# TASK_63: Fix WebGPU Shader NaN Propagation, Readback Queue Saturation, and Terrain State Handover

**Status**: `DONE`  
**Date**: 2026-09-09  
**Goal**: Eliminate WebGPU flora decay and ocean flooding by fixing shader `NaN` division-by-zero, decoupling environmental GPU dispatch/readback cadence from high-frequency agent ticks, and ensuring clean bidirectional state handover between GPU and CPU.  
**Context**: Flight recorder traces in `debug/trace_latest.json` proved that toggling GPU caused biomass to instantly crash to 0 and, upon disabling GPU, caused water to surge to 100% across the map. This was caused by unconditional division by zero in `moisture.wgsl` and `pheromone.wgsl`, high-frequency GPU queue flooding from 8 uncapped workers choking `mapAsync()`, and lack of a synchronous terrain readback before GPU teardown.

---

## 🔍 Root Causes Identified

1. **Unconditional Evaluation in WGSL `select()`**:
   In `moisture.wgsl` and `pheromone.wgsl`, the expression `select(absorbed_m, neighbor_sum / count, count > 0.0)` evaluates both operands before calling `select()`. When `count == 0.0`, `neighbor_sum / 0.0` yields `NaN`, which cascades through `clamp()`, turning `moisture`, `elevation`, and `biomass` into `0.0` or `NaN`.
2. **GPU Command & Readback Queue Saturation**:
   Each island worker ticks at hundreds to thousands of ticks per second. Submitting 8 compute passes + 6 buffer copies + `mapAsync()` every 0.5ms overwhelms the GPU command queue on integrated graphics (Intel UHD 620). `mapAsync()` cannot resolve before the next tick unmaps or overwrites the staging buffer, starving the CPU grid of growth updates.
3. **Missing Terrain Flush on Disable**:
   When GPU mode is disabled (`disableGpu()`), `gpuEnvironment.destroy()` is called without waiting for the latest GPU buffers to flush into `this.grid`. As a result, the CPU simulation resumes with corrupted or zeroed elevation arrays, causing groundwater replenishment to flood the entire world.
4. **Worker Console Errors Masked**:
   Worker WebGPU errors and WGSL compilation warnings are not forwarded to the main thread or Flight Recorder, hindering real-time diagnostics.

---

## Files to Create/Modify

- `tasks/TASK_63_fix_webgpu_shader_nan_and_readback_saturation.md` `[NEW]` - This task document.
- `tasks/README.md` `[MODIFY]` - Register TASK_63 in dependency graph and task table.
- `js/wgsl/moisture.wgsl` `[MODIFY]` - Replace `select()` with branch guard `if (count > 0.0)` to eliminate `NaN`.
- `js/wgsl/pheromone.wgsl` `[MODIFY]` - Replace `select()` with branch guard `if (count > 0.0)` to eliminate `NaN`.
- `js/gpu-environment.js` `[MODIFY]` - Add `createComputePipelineAsync` with `getCompilationInfo()`, `device.onuncapturederror`, GPU dispatch throttling/cadence latching, and robust async readback.
- `js/simulation.js` `[MODIFY]` - Make `disableGpu()` asynchronously await `syncReadback()` before destroying GPU resources.
- `js/workers/island.worker.js` `[MODIFY]` - Hook worker `console.error` and `console.warn` to post `WORKER_LOG` messages to main thread.
- `js/main.js` `[MODIFY]` - Handle `WORKER_LOG` messages and log them cleanly with island IDs.

---

## Detailed Specification

### 1. Safe Branch Guards in WGSL Shaders
In `js/wgsl/moisture.wgsl`:
```wgsl
  var avg_neighbors = absorbed_m;
  if (count > 0.0) {
    avg_neighbors = neighbor_sum / count;
  }
  var new_m = absorbed_m + u.moistureDiffusion * (avg_neighbors - absorbed_m) - u.moistureDrying;
```
In `js/wgsl/pheromone.wgsl`:
```wgsl
  var avg = current_s;
  if (count > 0.0) {
    avg = neighbor_sum / count;
  }
  var new_s = (current_s + u.scentDiffusion * (avg - current_s)) * (1.0 - u.scentEvaporation);
```

### 2. Cadence Decoupling & Readback Protection (`js/gpu-environment.js`)
- Environmental Cellular Automata (water flow, flora growth, moisture diffusion, erosion) does not need to run at 1,500 Hz; 30–60 Hz is standard.
- In `GpuEnvironment`:
  - Track `this.lastGpuTickTime = 0;` and minimum dispatch interval `minIntervalMs = 16;` (~60 Hz).
  - Only dispatch compute shaders and initiate readback when `minIntervalMs` has elapsed since the last GPU dispatch, or when staging buffer has successfully resolved.
  - Guard `curBuf.mapAsync()`: never call `mapAsync` if the buffer is already pending or mapped. Use a state enum (`IDLE`, `ENQUEUED`, `MAPPING`, `MAPPED`).
  - When `mapAsync` resolves, mark state `MAPPED`. On tick, read mapped buffer into `this.grid`, unmap, and set state `IDLE`.

### 3. Asynchronous Terrain Handover on Disable (`js/simulation.js` & `js/gpu-environment.js`)
- In `GpuEnvironment`:
  - `async syncReadback()`: await `device.queue.onSubmittedWorkDone()`, map latest staging buffer, commit to `this.grid`, unmap, and finish.
- In `Simulation.disableGpu()`:
  - Make `disableGpu()` async:
    ```javascript
    async disableGpu() {
      if (this.gpuEnvironment) {
        try {
          await this.gpuEnvironment.syncReadback();
        } catch (e) {}
        this.gpuEnvironment.destroy();
        this.gpuEnvironment = null;
      }
      this.useGpu = false;
      this.gpuInitPending = false;
    }
    ```
- In `island.worker.js`:
  - Await `simulation.disableGpu()` before replying with `GPU_MODE_CHANGED { active: false }`.

### 4. Robust Pipeline Compilation & Error Reporting (`js/gpu-environment.js`)
- Switch `createComputePipeline` to `await this.device.createComputePipelineAsync(...)`.
- Inspect `await shaderModule.getCompilationInfo()`. If any error messages exist, format and log them with line and column numbers.
- Add `this.device.onuncapturederror = (event) => ...`.

### 5. Worker Console Forwarding (`js/workers/island.worker.js` & `js/main.js`)
- In `island.worker.js`:
  - Wrap `console.error` and `console.warn` to post message `{ type: 'WORKER_LOG', level, islandId, message }`.
- In `main.js`:
  - Route `WORKER_LOG` into `console[level]('[Island ' + id + ']', message)` and into `flightRecorder`.

---

## Test Plan

1. **WGSL Syntax & Compilation Verification**:
   - Verify all 8 WGSL shaders compile without errors via `createComputePipelineAsync` and clean `getCompilationInfo()`.
2. **GPU Toggle Flora & Water Stability**:
   - Start simulation on CPU.
   - Click **⚡ GPU** &rarr; Verify simulation continues running smoothly, biomass remains stable/growing, water flows naturally, and no flora disappears.
   - Click **⚡ GPU** again (OFF) &rarr; Verify simulation seamlessly returns to CPU mode without elevation corruption or sea-level ocean flooding.
3. **Flight Recorder Verification**:
   - Record 5-second trace with GPU ON.
   - Verify `stat-biomass` does NOT drop to 0.
   - Verify `stat-water` does NOT jump to 100%.

---

## Acceptance Criteria

- [x] `moisture.wgsl` and `pheromone.wgsl` have safe branch guards eliminating `NaN` division-by-zero.
- [x] `GpuEnvironment` dispatches compute shaders at a stable, sustainable cadence (~30–60 Hz), eliminating GPU queue starvation.
- [x] Double-buffered staging readback tracks explicit buffer states (`IDLE`, `ENQUEUED`, `MAPPING`, `MAPPED`), ensuring clean zero-stall copies without unmapping mid-flight.
- [x] `disableGpu()` flushes GPU terrain state via `syncReadback()` before tearing down the environment, preventing 100% ocean flooding.
- [x] All 8 compute pipelines use `createComputePipelineAsync` with compilation error reporting.
- [x] Toggling GPU ON and OFF keeps biomass, water, and terrain elevation stable and visually continuous.
