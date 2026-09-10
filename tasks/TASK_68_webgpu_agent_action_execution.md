# TASK_68: WebGPU Agent Action Execution & Spatial Atomic Collisions

- **Status**: DONE
- **Date**: 2026-09-10
- **Goal**: Implement the WebGPU agent action execution compute shader (`agent_act.wgsl`), processing the 10 discrete agent actions (Idle, Move N/S/E/W, Graze, Dig Trench, Mound Earth, Emit Scent, Sow Seeds) directly in VRAM with atomic spatial collision resolution.
- **Context**: In Phase 14, all agent logic runs on the GPU. Following perception (`agent_sense.wgsl`) and RNN decision decoding (`agent_brain.wgsl`), `agent_act.wgsl` applies agent decisions directly to VRAM grid layers (elevation, biomass, trample, scent, fertility, occupancy) and updates agent metabolic states without CPU intervention.
- **Files to Create / Modify**:
  - `[NEW]` `js/wgsl/agent_act.wgsl`
  - `[MODIFY]` `js/gpu-environment.js`
  - `[MODIFY]` `tasks/README.md`

---

## Detailed Specification

### 1. Action Space & Execution Semantics
Each active agent reads its sampled action from `agentOutputs[agent_idx].chosenAction`:
- **Basal Metabolic Drain & Environmental Exposure**:
  - Microclimate thermal relief from moist soil reduces basal drain up to 40%.
  - Hostile coastal perimeter inflicts `COASTAL_EXPOSURE_DRAIN` (0.35).
  - Deep standing water (>0.15) inflicts aquatic submersion fatigue.
- **Stationary Trampling**:
  - Non-movement actions deposit `STATIONARY_TRAMPLE_DEPOSIT` (0.04) onto the current tile.
- **Actions 0 (IDLE)**:
  - Minimal energy expenditure, success = 1.0.
- **Actions 1..4 (MOVE N, S, E, W)**:
  - Boundary check: wall bump costs `0.5 * MOVE_ENERGY_BASE`, success = 0.0.
  - Spatial Atomic Collision: uses `atomicCompareExchangeWeak(&occupancy[target_idx], -1, i32(agent_idx))`.
  - If target is already occupied: collision penalty `0.5 * MOVE_ENERGY_BASE`, success = 0.0.
  - If successful: calculates slope cost (uphill/downhill), highway trail bonus, water wading resistance, scent highway bonus, momentum inertia/reversal penalties. Deducts move cost, deposits `TRAMPLE_DEPOSIT` (0.25) on departed tile, releases departed occupancy via `atomicCompareExchangeWeak`, and updates agent `(x, y)` and `lastMoveDir`.
- **Action 5 (GRAZE)**:
  - If `biomass > 0.02`: takes bite up to 0.35, gains `bite * GRAZE_MAX_INTAKE` energy, depletes soil fertility by `FERTILITY_GRAZE_DEPLETION`, tracks `biomassEaten`, success = 1.0. Barren grazing incurs penalty, success = 0.0.
- **Action 6 (DIG_TRENCH)**:
  - Deducts `TERRAFORM_ENERGY_COST` (2.5). If elevation > 0.05, lowers elevation by 0.05. Rich virgin loam (fertility > 0.25) unearths subterranean roots/tubers for energy refund. Success = 1.0.
- **Action 7 (MOUND_EARTH)**:
  - If elevation < `TERRAFORM_MAX_ELEVATION` (0.72), raises elevation by 0.04, deducts `TERRAFORM_ENERGY_COST`. Success = 1.0.
- **Action 8 (EMIT_SCENT)**:
  - Deducts `SCENT_COST` (0.08), adds `SCENT_DEPOSIT` (1.0) to current tile. Success = 1.0.
- **Action 9 (SOW_SEEDS)**:
  - Deducts `SEED_SOW_COST` (2.5). If moist (>= 0.30), fertile (> 0.20), uncompacted (trample <= 0.45), unshaded (biomass < 0.15), and non-coastal: sets biomass to `SEED_GERM_BIOMASS` (0.04), increments `seedsSown`. Success = 1.0.

### 2. Bindings & Memory Layout
- `@group(0) @binding(0)`: `elevation: array<f32>` (read_write)
- `@group(0) @binding(1)`: `water: array<f32>` (read)
- `@group(0) @binding(2)`: `moisture: array<f32>` (read)
- `@group(0) @binding(3)`: `biomass: array<f32>` (read_write)
- `@group(0) @binding(4)`: `trample: array<f32>` (read_write)
- `@group(0) @binding(5)`: `fertility: array<f32>` (read_write)
- `@group(0) @binding(6)`: `scent: array<f32>` (read_write)
- `@group(0) @binding(7)`: `occupancy: array<atomic<i32>>` (read_write)
- `@group(0) @binding(8)`: `agentState: array<AgentState>` (read_write)
- `@group(0) @binding(9)`: `agentOutputs: array<AgentOutput>` (read)
- `@group(0) @binding(10)`: `u: ActUniforms` (uniform)

### 3. `js/gpu-environment.js` Updates
- Allocate `this.buffers.actUniforms`.
- Create `agentActBindGroupLayout` and `agentActBindGroup`.
- Compile `pipelines.agent_act`.
- Implement `dispatchAgentAct(encoder, agentCount)`.

---

## Test Plan

1. Verify WGSL syntax and JavaScript parse validation:
   - `node -c js/gpu-environment.js`
2. Test pipeline compilation:
   - Confirm `agent_act.wgsl` compiles without errors during `GpuEnvironment.init()`.
3. Verify atomic occupancy collision resolution:
   - Two agents attempting to move to the same empty tile result in exactly one agent claiming the tile and the other agent failing and staying at its origin with a collision penalty.

---

## Acceptance Criteria

- [x] `js/wgsl/agent_act.wgsl` created implementing all 10 actions, metabolic drain, and atomic occupancy resolution.
- [x] `js/gpu-environment.js` allocates `actUniforms`, creates pipeline and bind group, and provides `dispatchAgentAct()`.
- [x] Pipeline compiles cleanly under WebGPU / Dawn with 10 storage buffers.
- [x] Registered in `tasks/README.md`.
