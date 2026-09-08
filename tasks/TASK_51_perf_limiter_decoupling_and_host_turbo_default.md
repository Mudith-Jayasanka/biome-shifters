# Task 51: Performance Limiter Decoupling & Host Uncapped Execution

## Status
`DONE`

---

## Goal
Decouple simulation speed multipliers (`1x`, `2x`, `5x`, `10x`) and the Turbo mode toggle from the node-level performance limiter in `island.worker.js`, and set the Host machine's default performance limiter mode to uncapped `'turbo'` so local simulations and speed controls are never throttled to 60 TPS.

---

## Context
When Task 39 ("Per-Node Performance Limiter") was introduced to allow hosts to throttle remote LAN contributor laptops to regulate heat, all nodes (including the local Host machine) were given a default `perfMode = 'standard'`. 

In `island.worker.js`, the execution logic was inadvertently structured such that `isTurbo` and `speed` were nested *only* inside `if (perfMode === 'turbo')`. Under `perfMode === 'standard'`, the worker ran exactly 1 tick with a 16ms delay (~60 TPS), completely ignoring user speed buttons and the Turbo mode switch. Furthermore, the Host in the Cluster Dashboard was hardcoded to `<span class="perf-badge host">Host (Default)</span>` without ability to adjust or uncap its own governor.

---

## Gaps Identified in Existing Implementation
1. **Speed & Turbo Logic Nesting Gap (`island.worker.js`)**:
   `isTurbo` and `for (let i = 0; i < speed; i++)` were placed exclusively inside `else if (perfMode === 'turbo')`. In `perfMode === 'standard'`, the code simply executed `simulation.tick()` once and scheduled a 16ms timeout. As a result, selecting `2x`, `5x`, `10x`, or `⚡ Turbo` had zero effect on any node in `'standard'` mode.
2. **Host Ceiling Gap (`server.py`, `island-manager.js`, `cluster-client.js`, `main.js`)**:
   The Host node was initialized with `perfMode: 'standard'` alongside contributors. The Host should default to `'turbo'` (uncapped) so that the primary workstation running the simulation operates with maximum performance by default.
3. **Host Dashboard Governor Gap (`main.js`, `index.html`)**:
   In `refreshClusterNodes()`, the Host row displayed a static label `Host (Default)` while contributors had an interactive dropdown. The Host administrator had no interface to change the local machine's limiter mode.
4. **Governor Semantic Inversion Gap**:
   `perfMode` was conflated with simulation `speed`. `perfMode` is an administrative safety ceiling (hardware power/thermal governor: `eco` = cap at ~30 TPS; `standard` = cap at ~60 TPS; `turbo` = uncapped), while `speed` and `isTurbo` are user simulation controls.

---

## Files to Create / Modify
- `[MODIFY]` `js/workers/island.worker.js` — Decouple `speed` and `isTurbo` execution from `perfMode`. Under `perfMode === 'turbo'`, allow full uncapped batching and user speed; under `standard`, permit speeds up to ~60 TPS; under `eco`, throttle to ~30 TPS.
- `[MODIFY]` `server.py` — Default host node's `perfMode` to `'turbo'`.
- `[MODIFY]` `js/cluster-client.js` — Default `perfMode` to `'turbo'` for host connections.
- `[MODIFY]` `js/island-manager.js` — Default `perfMode` to `'turbo'`.
- `[MODIFY]` `js/main.js` — Default local node `perfMode` to `'turbo'`, and provide an interactive performance limiter selector for the Host in the Cluster Dashboard.

---

## Detailed Specification

### 1. Worker Loop Decoupling: `js/workers/island.worker.js`
In `runLoopStep()`:
- Separate the **tick execution count** from the **delay pacing**.
- When `isTurbo` is true:
  - If `perfMode === 'eco'`: run 1 tick per step with delay 33ms (~30 TPS cap).
  - If `perfMode === 'standard'`: run batch of ticks capped to ~60 TPS (or 1 tick per 16ms).
  - If `perfMode === 'turbo'` (default for Host): execute in batches (`batchSize = 25`) with `delay = 0` (or yield immediately).
- When `isTurbo` is false:
  - Run `speed` ticks (bounded by `perfMode` if eco or standard).
  - If `perfMode === 'eco'`: delay 33ms.
  - If `perfMode === 'standard'`: delay 16ms (running `Math.min(speed, 2)` or pacing delay).
  - If `perfMode === 'turbo'`: delay = Math.max(0, Math.round(16 / Math.max(1, speed))), running `speed` ticks.

Before snippet:
```javascript
    if (perfMode === 'eco') {
      simulation.tick();
      tickCounter++;
    } else if (perfMode === 'standard') {
      simulation.tick();
      tickCounter++;
    } else if (perfMode === 'turbo') {
      if (isTurbo) {
        const batchSize = 25;
        for (let i = 0; i < batchSize; i++) {
          if (isPaused || !isRunning) break;
          simulation.tick();
          tickCounter++;
        }
      } else {
        for (let i = 0; i < speed; i++) {
          if (isPaused || !isRunning) break;
          simulation.tick();
          tickCounter++;
        }
      }
    }
```

After snippet:
```javascript
    if (isTurbo) {
      if (perfMode === 'eco') {
        simulation.tick();
        tickCounter++;
      } else if (perfMode === 'standard') {
        simulation.tick();
        tickCounter++;
      } else {
        // perfMode === 'turbo' (uncapped)
        const batchSize = 25;
        for (let i = 0; i < batchSize; i++) {
          if (isPaused || !isRunning) break;
          simulation.tick();
          tickCounter++;
        }
      }
    } else {
      // Normal speed multiplier (1x, 2x, 5x, 10x)
      const ticksToRun = perfMode === 'eco' ? 1 : speed;
      for (let i = 0; i < ticksToRun; i++) {
        if (isPaused || !isRunning) break;
        simulation.tick();
        tickCounter++;
      }
    }
```

Delay scheduling:
```javascript
  let delay = 16;
  if (perfMode === 'eco') {
    delay = 33; // ~30 TPS cap
  } else if (perfMode === 'standard') {
    delay = 16; // ~60 TPS cap
  } else if (perfMode === 'turbo') {
    delay = isTurbo ? 0 : Math.max(0, Math.floor(16 / Math.max(1, speed)));
  }
  loopTimer = setTimeout(runLoopStep, delay);
```

### 2. Host Default to `'turbo'`: `server.py`, `js/island-manager.js`, `js/cluster-client.js`, `js/main.js`
- `server.py`:
  In `ClusterManager.register_node()`:
  - If `role == 'host'`: `'perfMode': 'turbo'`
  - If `role == 'contributor'`: `'perfMode': 'standard'`
- `js/island-manager.js`:
  - `this.perfMode = config.perfMode || 'turbo';`
- `js/cluster-client.js`:
  - `this.perfMode = options.perfMode || 'turbo';`
- `js/main.js`:
  - In `refreshClusterNodes()`: allow Host row to also render a `.select-cluster-perf` dropdown or a distinct host indicator showing `🚀 Turbo (Uncapped)`.
  - In `setupClusterEvents()`: ensure Host node performance mode updates propagate to local `islandManager.setPerfMode()`.

---

## Test Plan
1. Launch `server.py` and open simulation in browser.
2. In single-player/host mode, verify that clicking `2x`, `5x`, and `10x` immediately increases simulation TPS proportionally (~120 TPS at 2x, ~300 TPS at 5x, ~600 TPS at 10x).
3. Click `⚡ Turbo`. Verify TPS immediately rises into the thousands and is no longer locked to 60 TPS.
4. Open the Cluster Nodes modal and verify the Host performance mode is `'turbo'` by default.

---

## Acceptance Criteria
- [x] Speed multipliers `2x`, `5x`, and `10x` increase tick frequency proportionally.
- [x] Turbo mode is not locked to 60 TPS.
- [x] Host machine defaults to uncapped `'turbo'` performance mode.
- [x] Contributor machines still respect assigned Eco (~30 TPS) and Standard (~60 TPS) caps when configured.
- [x] No regression in UI rendering or Island telemetry.

