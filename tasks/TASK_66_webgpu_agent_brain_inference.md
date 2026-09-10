# TASK_66: WebGPU Agent Buffer Allocation & RNN Brain Inference Compute Pipeline

- **Status**: DONE
- **Date**: 2026-09-10
- **Goal**: Allocate GPU storage buffers for agent states, positions, RNN weights, and hidden states, and implement the WebGPU recurrent neural network brain compute shader (`agent_brain.wgsl`).
- **Context**: Phase 14 of Biome Shifters transitions agent execution 100% to WebGPU. This first task establishes the GPU agent memory structures and implements parallel neural network inference in WGSL, perfectly replicating the CPU `NeuralNet.feedForward()` and temperature-controlled softmax action sampling.
- **Files to Create / Modify**:
  - `[NEW]` `js/wgsl/agent_brain.wgsl`
  - `[MODIFY]` `js/gpu-environment.js`
  - `[MODIFY]` `tasks/README.md`

---

## Detailed Specification

### 1. GPU Agent Memory Layout
Each island supports up to $N = 1024$ agents.
Total weights per agent = $(37 \times 24) + (24 \times 24) + (24 \times 10) + 24 + 10 = 1,738$ floats ($6,952$ bytes).

Buffers allocated in `GpuEnvironment`:
1. `buffers.agentState`: $1024 \times 64$ bytes ($64\text{ KB}$)
   - `struct AgentState`: `x: u32, y: u32, energy: f32, age: u32, generation: u32, id: u32, alive: u32, lastAction: u32, lastSuccess: f32, lastMoveDir: i32, fitness: f32, speciesR: f32, speciesG: f32, speciesB: f32, seedsSown: u32, biomassEaten: f32`
2. `buffers.agentInputs`: $1024 \times 37 \times 4$ bytes ($151.5\text{ KB}$)
3. `buffers.agentHidden`: $1024 \times 24 \times 4$ bytes ($96\text{ KB}$)
4. `buffers.agentWeights`: $1024 \times 1,738 \times 4$ bytes ($7,118,848\text{ bytes} \approx 7.1\text{ MB}$)
5. `buffers.agentOutputs`: $1024 \times 16 \times 4$ bytes ($64\text{ KB}$)
   - `struct AgentOutput`: `chosenAction: u32, padding: vec3<u32>, logits: array<f32, 10>, pad2: vec2<f32>`
6. `buffers.brainUniforms`: $32$ bytes uniform buffer

### 2. `js/wgsl/agent_brain.wgsl`
- Compute shader with `@workgroup_size(64, 1, 1)`.
- Invocation index `agent_idx = id.x`.
- If `agent_idx >= u.agentCount || agentState[agent_idx].alive == 0u`: return immediately.
- Reads 37-element input vector from `agentInputs`.
- Multiplies $W_{in} \cdot X + W_{rec} \cdot H_{t-1} + B_h$, applies $\tanh$ activation, commits new recurrent carry $H_t$ to `agentHidden`.
- Computes 10 action logits: $Y = W_{out} \cdot H_t + B_o$.
- Applies temperature-scaled Softmax action sampling using PCG pseudo-random hash `hash(agent_idx, u.tickCount)`.
- Writes chosen action and logits to `agentOutputs`.

### 3. `js/gpu-environment.js`
- In `init()`:
  - Allocate agent buffers.
  - Compile `agent_brain.wgsl` compute pipeline with dedicated bind group layout.
  - Create `agentBrainBindGroup`.
- Provide helper methods:
  - `uploadAgentData(agents)`: Serializes active CPU `Agent` instances into GPU buffers for initial state handover.
  - `dispatchAgentBrain(agentCount, tickCount)`: Encodes and dispatches `agent_brain` pipeline.

---

## Test Plan

1. Verify WGSL syntax and JavaScript parse validation:
   - `node -c js/gpu-environment.js`
2. Validate pipeline compilation:
   - Verify `agent_brain.wgsl` compiles without errors during `gpuEnvironment.init()`.
3. Numerical verification:
   - Test that `uploadAgentData` uploads known weights and states correctly.
   - Run a test dispatch and verify hidden states and action logits populate non-zero bounded numbers.

---

## Acceptance Criteria

- [x] `js/wgsl/agent_brain.wgsl` created with RNN forward inference and softmax action sampling.
- [x] Agent buffers allocated in `js/gpu-environment.js` with capacity for 1,024 agents.
- [x] Pipeline compiled asynchronously with error checking.
- [x] Bidirectional upload method `uploadAgentData()` implemented.
- [x] Node syntax checks pass cleanly.
