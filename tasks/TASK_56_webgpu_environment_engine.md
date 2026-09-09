# TASK_56 — WebGPU Environment Engine (GPU Compute Shaders for CA Passes)

**Status**: `DONE`

---

## Goal

Create a `js/gpu-environment.js` module that replicates every cellular automaton pass in `js/environment.js` using WebGPU compute shaders, operating on the **exact same `Float32Array` grid buffers** as the CPU engine, so the two can be swapped transparently.

---

## Context

`environment.js` is the single biggest consumer of CPU time per tick.  It runs 8 independent CA passes across 128×128 = 16,384 cells (or 65,536 for 256×256) per simulation tick, per island, per worker.  Moving these passes to WebGPU compute shaders runs **all 16,384 cells simultaneously** instead of sequentially, freeing every CPU core to focus on agent brains and genetics.

This task creates only the GPU engine module and a minimal self-test.  It does **not** wire it into the simulation tick loop or add any UI — those come in later tasks.

---

## Files to Create / Modify

| Action | File |
|--------|------|
| `[NEW]` | `js/gpu-environment.js` |
| `[NEW]` | `js/wgsl/water_sources.wgsl` |
| `[NEW]` | `js/wgsl/rain_evaporation.wgsl` |
| `[NEW]` | `js/wgsl/hydrology.wgsl` |
| `[NEW]` | `js/wgsl/erosion.wgsl` |
| `[NEW]` | `js/wgsl/moisture.wgsl` |
| `[NEW]` | `js/wgsl/vegetation.wgsl` |
| `[NEW]` | `js/wgsl/trail_decay.wgsl` |
| `[NEW]` | `js/wgsl/pheromone.wgsl` |

---

## Detailed Specification

### Architecture

```
GpuEnvironment (js/gpu-environment.js)
  ├── async init(grid)          — Request WebGPU adapter, create device, allocate GPU buffers, compile shaders
  ├── tick()                    — Run all 8 compute passes then read back results into grid Float32Arrays
  ├── destroy()                 — Release all GPU resources
  └── static isSupported()      — Returns true if navigator.gpu is available
```

### Class Contract

```js
// js/gpu-environment.js
export class GpuEnvironment {
  /**
   * @param {Grid} grid - The simulation grid whose Float32Array layers will be GPU-accelerated.
   */
  constructor(grid) { /* store grid reference only */ }

  /**
   * Request WebGPU device, compile all 8 compute shaders, allocate GPU buffers.
   * Must be called before tick().
   * @returns {Promise<boolean>} - true on success, false if WebGPU unsupported/failed.
   */
  async init() { }

  /**
   * Run one full GPU environmental tick (mirrors Environment.tick()).
   * Uploads changed grid layers to GPU, dispatches all 8 compute passes, reads results back.
   * Zero new JS object allocations per call.
   */
  tick() { }

  /**
   * Free all GPU buffers, pipelines and the device.
   */
  destroy() { }

  /**
   * @returns {boolean} Whether WebGPU is available in this browser.
   */
  static isSupported() {
    return typeof navigator !== 'undefined' && 'gpu' in navigator;
  }
}
```

### GPU Buffer Layout

All layers are uploaded as `GPUBuffer` with usage `STORAGE | COPY_SRC | COPY_DST`. The grid's CONFIG constants (width, height, rates) are uploaded in a single uniform buffer.

| Buffer Name | Source Array | Format |
|---|---|---|
| `buf_elevation` | `grid.elevation` | `Float32Array` |
| `buf_base_elevation` | `grid.baseElevation` | `Float32Array` |
| `buf_water` | `grid.water` | `Float32Array` |
| `buf_moisture` | `grid.moisture` | `Float32Array` |
| `buf_fertility` | `grid.fertility` | `Float32Array` |
| `buf_biomass` | `grid.biomass` | `Float32Array` |
| `buf_trample` | `grid.trample` | `Float32Array` |
| `buf_scent` | `grid.scent` | `Float32Array` |
| `buf_coastal` | `grid.coastal` (derived `Uint8Array` cast to `Float32Array`) | `Float32Array` |
| `buf_water_tmp` | ping-pong scratch | `Float32Array` |
| `buf_moisture_tmp` | ping-pong scratch | `Float32Array` |
| `buf_biomass_tmp` | ping-pong scratch | `Float32Array` |
| `buf_scent_tmp` | ping-pong scratch | `Float32Array` |
| `buf_elev_tmp` | ping-pong scratch | `Float32Array` |
| `buf_uniforms` | CONFIG constants + rain parameters | `Float32Array` uniform |

### Uniform Buffer Layout (index × 4 bytes)

```
[0]  width          (u32)
[1]  height         (u32)
[2]  WATER_FLOW_RATE
[3]  WATER_EVAP_RATE
[4]  RAIN_PROBABILITY      // JS sets this per-tick stochastically (0.0 or 1.0)
[5]  RAIN_INTENSITY
[6]  RAIN_CENTER_X         // JS sets per-tick (random each rain event)
[7]  RAIN_CENTER_Y
[8]  RAIN_RADIUS           // JS sets per-tick (random each rain event)
[9]  SOIL_INFILTRATION
[10] MOISTURE_DIFFUSION
[11] MOISTURE_DRYING
[12] BIOMASS_GROWTH_RATE
[13] BIOMASS_MAX
[14] BIOMASS_SPREAD_CHANCE
[15] TRAMPLE_DECAY
[16] SCENT_EVAPORATION
[17] SCENT_DIFFUSION
[18] SOIL_CREEP_THRESHOLD
[19] SOIL_CREEP_RATE
[20] EROSION_HYDRAULIC_RATE
[21] EROSION_BASE_WEATHERING
[22] COASTAL_BORDER_WIDTH  (u32)
[23] padding
```

### WGSL Shader Contracts

Each shader file in `js/wgsl/` uses exactly this bind group layout (indices match across all shaders so all can share one bind group layout):

```wgsl
@group(0) @binding(0) var<storage, read_write> elevation: array<f32>;
@group(0) @binding(1) var<storage, read_write> base_elevation: array<f32>;
@group(0) @binding(2) var<storage, read_write> water: array<f32>;
@group(0) @binding(3) var<storage, read_write> moisture: array<f32>;
@group(0) @binding(4) var<storage, read_write> fertility: array<f32>;
@group(0) @binding(5) var<storage, read_write> biomass: array<f32>;
@group(0) @binding(6) var<storage, read_write> trample: array<f32>;
@group(0) @binding(7) var<storage, read_write> scent: array<f32>;
@group(0) @binding(8) var<storage, read>       coastal: array<f32>;
@group(0) @binding(9) var<storage, read_write> tmp_a: array<f32>;   // scratch ping-pong
@group(0) @binding(10) var<uniform>            u: Uniforms;
```

```wgsl
struct Uniforms {
  width:  u32,
  height: u32,
  waterFlowRate:         f32,
  waterEvapRate:         f32,
  rainActive:            f32,   // 1.0 = raining this tick, 0.0 = dry
  rainIntensity:         f32,
  rainCenterX:           f32,
  rainCenterY:           f32,
  rainRadius:            f32,
  soilInfiltration:      f32,
  moistureDiffusion:     f32,
  moistureDrying:        f32,
  biomassGrowthRate:     f32,
  biomassMax:            f32,
  biomassSpreadChance:   f32,
  trampleDecay:          f32,
  scentEvaporation:      f32,
  scentDiffusion:        f32,
  soilCreepThreshold:    f32,
  soilCreepRate:         f32,
  erosionHydraulicRate:  f32,
  erosionBaseWeathering: f32,
  coastalBorderWidth:    u32,
  _pad:                  u32,
}
```

Each shader has exactly `@compute @workgroup_size(8, 8)` and dispatches `ceil(width/8) × ceil(height/8)` workgroups.

### Execution Order in `tick()`

> **Important**: Each pass reads from the "committed" main buffers and writes to a `tmp_a` scratch buffer (ping-pong), then the CPU swaps by issuing a `copyBufferToBuffer` command between the scratch and the main buffer. This prevents the directional sweep bias already handled in the CPU version.

1. Upload stochastic rain parameters to `buf_uniforms` (only the rain section, 4 floats).
2. Dispatch `water_sources.wgsl` → writes to `buf_water` in-place (only modifies low-elevation dry cells, safe without ping-pong).
3. Dispatch `rain_evaporation.wgsl` → reads `buf_water`, writes evaporation and rain to `buf_water` in-place (each cell independent, no neighbor reads).
4. Dispatch `hydrology.wgsl` → reads `buf_water` + `buf_elevation`, writes new water to `buf_water_tmp`. Swap `buf_water` ↔ `buf_water_tmp`.
5. Dispatch `erosion.wgsl` → reads `buf_elevation` + `buf_water`, writes new elevation to `buf_elev_tmp`. Swap `buf_elevation` ↔ `buf_elev_tmp`.
6. Dispatch `moisture.wgsl` → reads `buf_water` + `buf_moisture`, writes new moisture to `buf_moisture_tmp`. Swap `buf_moisture` ↔ `buf_moisture_tmp`.
7. Dispatch `vegetation.wgsl` → reads `buf_moisture` + `buf_fertility` + `buf_biomass` + `buf_trample` + `buf_coastal`, writes new biomass to `buf_biomass_tmp`. Swap `buf_biomass` ↔ `buf_biomass_tmp`.
8. Dispatch `trail_decay.wgsl` → reads/writes `buf_trample` in-place (each cell independent).
9. Dispatch `pheromone.wgsl` → reads `buf_scent`, writes new scent to `buf_scent_tmp`. Swap `buf_scent` ↔ `buf_scent_tmp`.
10. **Read back** all modified GPU buffers into the JS `Float32Array` layers on `grid` via `mapAsync` + `getMappedRange` + `set` + `unmap`.

> **Note on randomness**: WebGPU shaders cannot call `Math.random()`. For the `vegetation.wgsl` seed germination chance, use a deterministic per-cell hash function seeded by cell index and the current tick counter (passed as part of the uniform). This produces visually identical spreading behavior without calling JS random.

### Coastal mask pre-computation

The `coastal` buffer is a `Float32Array` where `coastal[i] = 1.0` if the cell is in the coastal perimeter, `0.0` otherwise. Compute this once during `init()` by iterating the grid and calling `grid.isCoastal(x, y)`. Upload it as a read-only GPU buffer that never changes during the run.

---

## Test Plan

Open browser console (`F12`) and run in the browser context after loading the page:

```js
// Paste in console after page loads
import('/js/gpu-environment.js').then(async m => {
  console.log('WebGPU supported:', m.GpuEnvironment.isSupported());
  // If true, integration is ready for TASK_57
});
```

Then in the **Host** UI, check the browser console for:
- `[GpuEnvironment] WebGPU adapter acquired` 
- `[GpuEnvironment] All 8 compute pipelines compiled`
- `[GpuEnvironment] init() complete`

And verify the existing CPU simulation continues running normally (no GPU toggle yet — that is TASK_57).

---

## Acceptance Criteria

- [x] `js/gpu-environment.js` exports `class GpuEnvironment` with `init()`, `tick()`, `destroy()`, and static `isSupported()`.
- [x] All 8 WGSL shader files exist in `js/wgsl/` and compile without error on Chrome/Chromium (the browser used by the Host machine).
- [x] `GpuEnvironment.isSupported()` returns `true` on Intel integrated GPU machines running Chrome with WebGPU enabled.
- [x] `init()` resolves to `true` on a machine with Intel GPU; resolves to `false` gracefully (no crash) if WebGPU is unavailable.
- [x] Calling `tick()` before `init()` does nothing (no error thrown).
- [x] The existing CPU-only simulation in `environment.js` is completely unchanged and fully functional.
- [x] No DOM/Canvas/Worker references inside `gpu-environment.js` — the class is headless.

---

## Important Notes for Implementor

- **Intel integrated GPUs** support WebGPU in Chromium but may have lower maximum buffer sizes and workgroup limits. Always query `device.limits.maxComputeWorkgroupSizeX` and fall back to workgroup size 4×4 if 8×8 is unsupported.
- The grid size is **128×128** (CONFIG.GRID_WIDTH × CONFIG.GRID_HEIGHT = 16,384 cells). All buffers are `16384 * 4 = 65,536 bytes`.
- WGSL does not have `Math.random()`. For vegetation stochastic germination, use a hash: `hash(cell_index ^ tick_count)` where `hash` is a simple Wang hash or PCG.
- Do **not** use `async` inside `tick()`. All GPU command encoding is synchronous; only the final readback is async. Schedule readbacks with `Promise` chaining but do not `await` in the tick path — read results into a staging buffer, and on the **next** tick's start, drain the staging buffer into the JS arrays before dispatching new commands.

