# TASK_67: WebGPU Agent Perception & Sensory Raycasting Compute Pipeline

- **Status**: DONE
- **Date**: 2026-09-10
- **Goal**: Implement the WebGPU agent sensory perception and extended food raycasting compute shader (`agent_sense.wgsl`), sampling physical grid buffers directly in VRAM to populate the 37-element neural input vector for all active agents.
- **Context**: In Phase 14, agent cognition runs entirely on the GPU. Instead of the CPU querying grid Float32Arrays and writing to `agent.sensorBuffer`, this compute pass evaluates all 37 physical sensations simultaneously across active agents directly in VRAM.
- **Files to Create / Modify**:
  - `[NEW]` `js/wgsl/agent_sense.wgsl`
  - `[MODIFY]` `js/gpu-environment.js`
  - `[MODIFY]` `tasks/README.md`

---

## Detailed Specification

### 1. The 37-Element Physical Sensory Schema
For each agent at coordinate $(x, y)$:
- `[0..3]`: Local Slope $(Elevation_{neighbor} - Elevation_{current}) \times 2.0$ for $(N, S, E, W)$. Out-of-bounds registers $+1.0$ (sheer impassable cliff).
- `[4..7]`: Local Moisture for $(N, S, E, W)$. Out-of-bounds is $0.0$.
- `[8..11]`: Immediate Biomass for $(N, S, E, W)$ at distance 1. Out-of-bounds is $0.0$.
- `[12..15]`: Extended Food Raycasts for $(N, S, E, W)$ across distance steps 2, 3, 4 with weights $[0.45, 0.35, 0.20]$. Out-of-bounds terminates ray. Clamped to $[0, 1.0]$.
- `[16..19]`: Local Trample Compaction for $(N, S, E, W)$. Out-of-bounds is $1.0$ (impassable).
- `[20..23]`: Local Pheromone Scent for $(N, S, E, W)$. Out-of-bounds is $0.0$.
- `[24..27]`: Neighbor Occupancy & Obstacles for $(N, S, E, W)$. $1.0$ if out-of-bounds wall OR occupied by another agent; $0.0$ if free.
- `[28]`: Current Tile Biomass.
- `[29]`: Current Tile Water Depth.
- `[30]`: Agent Energy Ratio: $\min(1.0, \text{energy} / \text{MAX\_ENERGY})$.
- `[31]`: Agent Age Ratio: $\min(1.0, \text{age} / \text{MAX\_AGE})$.
- `[32]`: Feedback of last action success: `lastActionResult`.
- `[33..36]`: Self-Motion / Momentum Heading (one-hot for last move direction: 0=N, 1=S, 2=E, 3=W, -1=none).

### 2. `js/wgsl/agent_sense.wgsl`
- Compute shader with `@workgroup_size(64, 1, 1)`.
- Invocation index `agent_idx = id.x`.
- Early return if `agent_idx >= u.agentCount` or `agentState[agent_idx].alive == 0u`.
- Reads `(x, y)` from `agentState[agent_idx]`.
- Samples grid buffers: `elevation`, `water`, `moisture`, `biomass`, `trample`, `scent`, and `occupancy`.
- Computes all 37 values and writes sequentially into `agentInputs[agent_idx * 37 + i]`.

### 3. `js/gpu-environment.js`
- Allocate `this.buffers.occupancy`: Int32Array grid buffer initialized with $-1$.
- Allocate `this.buffers.senseUniforms` for grid dimensions, agent count, max energy, and max age.
- Create `agentSenseBindGroupLayout` and `agentSenseBindGroup`.
- Compile `pipelines.agent_sense` asynchronously.
- Provide `dispatchAgentSense(encoder, agentCount)` method.

---

## Test Plan

1. Verify WGSL syntax and JavaScript parse validation:
   - `node -c js/gpu-environment.js`
2. Test pipeline compilation:
   - Confirm `agent_sense.wgsl` compiles without errors during `GpuEnvironment.init()`.
3. Validation:
   - Run a test dispatch with mock agents on a grid with known elevation/water/biomass and assert that the 37-element `agentInputs` buffer populates correctly.

---

## Acceptance Criteria

- [x] `js/wgsl/agent_sense.wgsl` created with the exact 37-input physical perception schema matching CPU `Agent.prototype.sense()`.
- [x] `occupancy` and `senseUniforms` buffers allocated in `js/gpu-environment.js`.
- [x] Pipeline compiled asynchronously with error checking.
- [x] `dispatchAgentSense()` method implemented.
- [x] Node syntax checks pass cleanly.
