# TASK_72: Headless Max-Speed CPU vs. GPU Parity Benchmark & Recursive Alignment Harness

- **Status**: DONE
- **Date**: 2026-09-10
- **Goal**: Create an automated headless and in-browser benchmark harness (`test_parity.html` + `scripts/run_parity_benchmark.sh`) that boots identical simulation seeds in CPU and GPU mode at max speed, collects comparative trajectories, and enables rapid recursive tuning of WGSL compute shaders to achieve exact behavioral parity.
- **Context**: To eliminate all remaining discrepancies between CPU and GPU implementations, we need a rapid-iteration benchmark loop: run both engines from identical seeds, detect deltas via `compare_cpu_gpu.py`, adjust WGSL shaders, and re-run until convergence.
- **Files to Create / Modify**:
  - `[NEW]` `test_parity.html`: Automated browser-based test runner that boots both CPU and GPU simulation engines with identical seeds, runs them at max turbo speed for $N$ ticks, collects step-by-step telemetry, and POSTs the comparative trace to `/api/trace`.
  - `[NEW]` `scripts/run_parity_benchmark.sh`: One-command script to launch the benchmark and run `compare_cpu_gpu.py` on the result.
  - `[MODIFY]` `tasks/README.md`: Register TASK_72.

---

## Detailed Specification

### 1. `test_parity.html`
- Standalone HTML page with embedded script (no manual UI required).
- Query params support: `?ticks=500&seed=1337&autoExit=true`.
- Flow:
  1. Boot Simulation A (CPU mode) with `seed = 1337`. Run $N$ ticks at max speed. Collect `sim_dynamics` every 20 ticks.
  2. Boot Simulation B (GPU mode) with identical `seed = 1337`. Run $N$ ticks at max speed. Collect `sim_dynamics` every 20 ticks.
  3. Combine both runs into a single trace JSON payload.
  4. POST trace to `/api/trace` on `server.py` with filename `parity_benchmark_<timestamp>.json`.
  5. Display side-by-side telemetry summary on screen.

### 2. `scripts/run_parity_benchmark.sh`
- CLI runner that:
  1. Ensures `server.py` is running on port 8080.
  2. Launches headless browser (or instructions for opening `test_parity.html`).
  3. Waits for the new trace to appear in `traces/`.
  4. Runs `python3 scripts/compare_cpu_gpu.py traces/latest_parity.json`.
  5. Returns exit code 0 if all deltas are $< 10\%$, or non-zero with divergence diagnostic.

---

## Test Plan

1. Verify runner page:
   - Load `http://localhost:8080/test_parity.html?ticks=200` in browser.
   - Confirm both CPU and GPU phases run sequentially and POST trace to server.
2. Verify comparison output:
   - Confirm `compare_cpu_gpu.py` analyzes the output trace and highlights any discrepancies.

---

## Acceptance Criteria

- [x] `test_parity.html` automated benchmark page created and functional.
- [x] `scripts/run_parity_benchmark.sh` launches parity benchmark and generates report.
- [x] Registered in `tasks/README.md`.

---

## 🔬 Diagnostic Findings & Divergence Root Causes (Baseline Run)

### 1. Benchmark Execution Performance (300 Ticks, Seed 1337)
- **CPU Engine**: 300 ticks executed in **708ms** (~423 TPS). Living population: 91 agents.
- **WebGPU Engine**: 300 ticks executed in **177ms** (~1,695 TPS) — **$4.0\times$ faster**, 100% closed-loop in VRAM.

### 2. Differential Analysis Delta Table
```
====================================================================================
  BIOME SHIFTERS — CPU vs GPU SIMULATION DYNAMICS COMPARISON
====================================================================================
Metric                           | CPU Engine       | GPU Engine       | Delta %      | Status
------------------------------------------------------------------------------------
Mean Population                  | 91.33            | 200.00           | +119.0%      | WARN (> 25%)
Mean Biomass                     | 591.47           | 604.00           | +2.1%        | PASS
Average Agent Energy             | 40.33            | 86.21            | +113.7%      | WARN (> 20%)
Max Generation                   | 1.47             | 1.00             | -31.8%       | WARN (> 30%)
Average Generation               | 1.16             | 1.00             | -13.8%       | PASS
------------------------------------------------------------------------------------
Action Distribution (% of Total Decisions):
  Action: idle                   | 9.8%             | 11.5%            | +17.1%       | PASS
  Action: move                   | 40.5%            | 39.5%            | -2.5%        | PASS
  Action: graze                  | 10.9%            | 13.5%            | +23.8%       | WARN (> 20%)
  Action: digTrench              | 9.5%             | 7.5%             | -21.2%       | WARN (> 20%)
  Action: moundEarth             | 9.2%             | 8.5%             | -7.3%        | PASS
  Action: emitScent              | 10.1%            | 12.5%            | +23.4%       | WARN (> 20%)
  Action: sowSeeds               | 9.9%             | 7.0%             | -29.6%       | WARN (> 20%)
------------------------------------------------------------------------------------
Physical Mechanics & Success Rates:
Move Collision Rate              | 5.2%             | 60.8%            | +1074.0%     | WARN (> 25%)
Graze Success Rate               | 53.3%            | 0.0%             | -100.0%      | WARN (> 20%)
Sow Success Rate                 | 17.6%            | 0.0%             | -100.0%      | WARN (> 25%)
------------------------------------------------------------------------------------
Sample Counts:
  CPU Dynamics Snapshots: 15  (Total Decisions: 29,142)
  GPU Dynamics Snapshots: 1   (Total Decisions: 200)
====================================================================================
```

### 3. Root Cause Diagnosis

#### A. Spatial Lockout via `occupancy` ID Inconsistency
- **The Bug**:
  - `uploadAgentData()` in `js/gpu-environment.js` uploaded `grid.occupancy`, which stores `agent.id` (1, 2, 3...).
  - `agent_act.wgsl` attempted atomic clear and claim using `agent_idx` (0, 1, 2...):
    ```wgsl
    atomicCompareExchangeWeak(&occupancy[cur_idx], i32(agent_idx), -1);
    ```
  - Because `occupancy[cur_idx]` held `agent.id` (e.g. 55) rather than `agent_idx` (e.g. 0), **the departure tile was never cleared**.
  - Departure tiles remained permanently occupied, causing agents to collide with their own phantom past positions. Move collisions spiked from 5.2% to 60.8%.
- **Associated Discrepancy**:
  - `agent_sense.wgsl` compared `occupancy` to `state.id` (`u32(occ) != state.id`), while `agent_act.wgsl` and `agent_lifecycle.wgsl` wrote `agent_idx`.

#### B. Cascading 0% Graze & 0% Sow Failure
- Because agents could not move due to phantom spatial lockouts, they grazed and exhausted their immediate tile's biomass on early ticks (`biomass <= 0.02`).
- Trapped on barren tiles, 100% of subsequent `graze` actions failed (`cur_bio <= 0.02` condition).
- Similarly, repeated lingering on the same tile compacted the soil via stationary trample (`trample > 0.45`), causing 100% of `sowSeeds` actions to fail.

#### C. Presentation Cadence Readback Under-Sampling
- GPU finished 300 ticks in 177ms. Because `GpuEnvironment.stepSimulation()` throttles staging buffer drain to ~16ms/60ms intervals, only 1 snapshot (tick 280) was drained before benchmark completion.
- In `test_parity.html`, adding `await gpuSim.gpuEnvironment.syncReadback()` on each 20-tick batch will align snapshot collection to 15 vs 15.

### 4. Required Alignment Actions (Next Recursive Iteration)
1. Standardize `occupancy` buffer semantics across all WGSL compute shaders and JS handover (`agent_idx` or `agent.id`).
2. Update `uploadAgentData()` to write matching occupancy IDs so initial tiles can be unlocked.
3. Update `agent_sense.wgsl` neighbor perception check to match the unified occupancy representation.
4. Update `test_parity.html` to sync-drain staging buffers every 20 ticks for granular 15-snapshot parity comparisons.

