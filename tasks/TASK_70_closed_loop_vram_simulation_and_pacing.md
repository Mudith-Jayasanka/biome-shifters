# TASK_70: Closed-Loop VRAM Simulation & Turbo Microtask Pacing

- **Status**: DONE
- **Date**: 2026-09-10
- **Goal**: Unify all 12 WebGPU compute shader passes into a 100% closed-loop simulation engine inside GPU VRAM, eliminating CPU-GPU PCIe synchronization during ticks and providing high-speed Turbo execution.
- **Context**: In Phase 14, individual GPU passes (8 CA passes, Sense, Brain, Act, Lifecycle) were built and tested. This task connects them into `GpuEnvironment.stepSimulation()`, synchronizes agent population state to the CPU at a decoupled presentation rate (~4–60 FPS), and connects the GPU loop into `Simulation.tick()` and `island.worker.js`.
- **Files to Create / Modify**:
  - `[MODIFY]` `js/gpu-environment.js`
  - `[MODIFY]` `js/simulation.js`
  - `[MODIFY]` `js/workers/island.worker.js`
  - `[MODIFY]` `tasks/README.md`

---

## Detailed Specification

### 1. `GpuEnvironment.stepSimulation(batchTicks = 1, isRadiationMode = false)`
- Encodes a full simulation cycle:
  - 8 Environmental Cellular Automata passes:
    1. `water_sources`
    2. `hydrology`
    3. `rain_evaporation`
    4. `soil_infiltration`
    5. `moisture_diffusion`
    6. `erosion`
    7. `vegetation`
    8. `trail_decay` (trample decay & pheromone evaporation)
  - 4 Agent Cognition & Lifecycle passes:
    1. `dispatchAgentSense`: reads grid + occupancy -> writes 37-element sensory vector.
    2. `dispatchAgentBrain`: RNN forward pass with recurrent hidden carry -> writes logits + chosen action.
    3. `dispatchAgentAct`: applies movement (with atomic occupancy collision resolution), grazing, terraforming, scent, and sowing directly to terrain + agent state.
    4. `dispatchAgentLifecycle`: mortality culling, reproduction slot claiming, sexual mate crossover, and weight mutation.
- Submits command buffer to GPU queue.
- State persists 100% in VRAM across ticks.

### 2. Decoupled Readback & Presentation Cadence
- In Turbo mode (hundreds or thousands of TPS), terrain and agent readbacks occur asynchronously at 4–60 Hz via double-buffered staging buffers (`stagingBuffers[0..1]` and `agentStateStagingBuffer`).
- Eliminates the biomass overwrite/resurrection bug: the CPU never overwrites GPU VRAM buffers with stale CPU state.

### 3. `Simulation` and `island.worker.js` Integration
- `Simulation.enableGpu()` uploads active CPU agents to GPU buffers via `uploadAgentData()`.
- `Simulation.tick()` delegates directly to `gpuEnvironment.stepSimulation(1, this.isRadiationMode)` when GPU is enabled.
- `Simulation.disableGpu()` flushes VRAM terrain and reads back surviving agent states into `this.agents` before teardown.
- `island.worker.js` reports accurate GPU telemetry (population, TPS, GPU active).

---

## Test Plan

1. Verify JavaScript syntax and module integrity:
   - `node -c js/gpu-environment.js`
   - `node -c js/simulation.js`
   - `node -c js/workers/island.worker.js`
2. Test simulation execution with GPU enabled:
   - Confirm all 12 pipelines compile cleanly in WebGPU.
   - Verify GPU mode runs closed-loop in VRAM without CPU errors or NaN values.
   - Observe biomass growth and agent foraging staying physically consistent (no biomass resurrection).
   - In Turbo mode, verify high TPS and GPU saturation.

---

## Acceptance Criteria

- [x] `GpuEnvironment.stepSimulation()` chains all 8 CA passes + 4 agent passes in a unified compute loop.
- [x] `Simulation.enableGpu()` uploads agents and `Simulation.tick()` runs closed-loop GPU steps when GPU is enabled.
- [x] `Simulation.disableGpu()` gracefully retrieves living agent states and terrain back to CPU.
- [x] Registered in `tasks/README.md`.
