# TASK_69: WebGPU Agent Lifecycle, Energy Economics & Genetic Mutation/Crossover

- **Status**: DONE
- **Date**: 2026-09-10
- **Goal**: Implement the WebGPU agent lifecycle compute shader (`agent_lifecycle.wgsl`), handling aging, mortality culling, reproduction slot allocation, sexual mate search, genome crossover, and Gaussian weight mutation directly in VRAM.
- **Context**: In Phase 14, agent reproduction and death must execute in VRAM without CPU round-trips. This eliminates the CPU/GPU hybrid bottleneck and enables closed-loop evolution at thousands of TPS.
- **Files to Create / Modify**:
  - `[NEW]` `js/wgsl/agent_lifecycle.wgsl`
  - `[MODIFY]` `js/gpu-environment.js`
  - `[MODIFY]` `tasks/README.md`

---

## Detailed Specification

### 1. Lifecycle Mechanics
Each agent thread in `@workgroup_size(64, 1, 1)`:
- **Mortality & Senescence**:
  - If `agentState[i].alive == 1u`:
    - Increment `age` by 1.
    - Evaluate biological Darwinian fitness:
      $\text{fitness} = \text{age} + (\text{biomassEaten} \times 25.0) + (\text{seedsSown} \times 1.5)$.
    - If `energy <= 0.0` (starvation) or `age >= maxAge` (senescence):
      - `agentState[i].alive = 0u`.
      - Clear spatial occupancy: `atomicCompareExchangeWeak(&occupancy[cur_idx], i32(i), -1)`.
      - Release slot: `atomicStore(&slotOccupied[i], 0u)`.
      - Terminate thread execution.
    - Else: agent survived!

- **Reproduction & Slot Allocation**:
  - If `energy >= reproductionThreshold` (115.0):
    - Search for an empty adjacent candidate tile $(N, S, E, W)$ that is in-bounds, non-coastal, water $< 0.6$, and `occupancy == -1`.
    - Atomically claim an empty slot `s` from `slotOccupied: array<atomic<u32>>` using `atomicCompareExchangeWeak(&slotOccupied[s], 0u, 1u)`.
    - Atomically claim target grid tile using `atomicCompareExchangeWeak(&occupancy[target_idx], -1, i32(s))`.
    - If successful:
      - Split energy: `childEnergy = parentEnergy * 0.5; parentEnergy -= childEnergy;`.
      - Search $5 \times 5$ neighborhood (radius 2) for mature mate ($\text{age} \ge 30$).
      - Perform sexual crossover across all 1738 weights if mate found, or asexual clone if alone.
      - Apply Gaussian weight mutation with `mutationRate` and `mutationStrength`.
      - Initialize child's recurrent hidden carry buffer to zero.
      - Populate child `AgentState` (`x, y, energy, age=0, generation=parent.gen+1, id=nextId, alive=1`).

### 2. Buffers & Bindings
- `@group(0) @binding(0)`: `elevation: array<f32>` (read)
- `@group(0) @binding(1)`: `water: array<f32>` (read)
- `@group(0) @binding(2)`: `occupancy: array<atomic<i32>>` (read_write)
- `@group(0) @binding(3)`: `agentState: array<AgentState>` (read_write)
- `@group(0) @binding(4)`: `agentWeights: array<f32>` (read_write)
- `@group(0) @binding(5)`: `agentHidden: array<f32>` (read_write)
- `@group(0) @binding(6)`: `slotOccupied: array<atomic<u32>>` (read_write)
- `@group(0) @binding(7)`: `globals: LifecycleGlobals` (storage read_write: `nextAgentId`, `livingCount`, etc.)
- `@group(0) @binding(8)`: `u: LifecycleUniforms` (uniform)

### 3. `js/gpu-environment.js` Updates
- Allocate `this.buffers.slotOccupied` (Uint32Array of length `maxAgents`).
- Allocate `this.buffers.lifecycleGlobals` (storage buffer with atomic counters).
- Allocate `this.buffers.lifecycleUniforms` (uniform buffer).
- Compile `pipelines.agent_lifecycle`.
- Implement `dispatchAgentLifecycle(encoder, agentCount, tickCount, isRadiationMode)`.

---

## Test Plan

1. Verify WGSL syntax and JavaScript parse validation:
   - `node -c js/gpu-environment.js`
2. Test pipeline compilation:
   - Confirm `agent_lifecycle.wgsl` compiles without errors during `GpuEnvironment.init()`.
3. Verify reproduction and mortality in VRAM:
   - Agents with energy $\le 0$ are culled and their tiles released.
   - Agents with energy $\ge 115$ reproduce into neighboring tiles without CPU round-trips.

---

## Acceptance Criteria

- [x] `js/wgsl/agent_lifecycle.wgsl` created implementing mortality, slot claiming, sexual crossover, and mutation.
- [x] `js/gpu-environment.js` allocates `slotOccupied`, `lifecycleGlobals`, and `lifecycleUniforms`.
- [x] Pipeline compiles cleanly under WebGPU / Dawn with 8 storage buffers + 1 uniform buffer.
- [x] Registered in `tasks/README.md`.
