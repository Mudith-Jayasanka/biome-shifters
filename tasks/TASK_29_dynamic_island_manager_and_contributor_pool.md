# Task 29: Dynamic IslandManager & Contributor Worker Pool

## Status: `TODO`
## Status: `DONE`

## Goal
Refactor `IslandManager` to support dynamic island ID offsets and arbitrary worker counts (1–8 cores per node) rather than hardcoded 0–7, and create `ClusterClient` to synchronize local workers with cluster state and send periodic telemetry.

## Context
Currently, `IslandManager` strictly instantiates 8 workers numbered 0 to 7 and manages them as a fixed set. In a distributed cluster, the host simulates Islands 0–7, while contributor nodes (friends) dedicate an arbitrary number of cores (e.g. 2, 4, or 8) and simulate assigned island ID ranges (e.g. Islands 8–11). `IslandManager` must flexibly spawn and manage any arbitrary slice of island IDs, maintaining pull-based frame streaming and telemetry for whichever island is currently active in the local viewport.

## Files to Create/Modify
- `[MODIFY]` `js/island-manager.js` — Support `islandIds` array (e.g. `[8, 9, 10, 11]`) or `islandCount` + `startIslandIndex`. Key telemetry and frame requests by assigned island IDs rather than 0..N indices.
- `[NEW]` `js/cluster-client.js` — Client module handling cluster registration (`/api/cluster/join`), periodic heartbeat loop, and applying remote pause/speed states to local `IslandManager`.
- `[MODIFY]` `tasks/README.md` — Register TASK_29 in task catalog and dependency graph.

## Detailed Specification

### 1. `IslandManager` Refactoring (`js/island-manager.js`)
- Constructor accepts:
  ```js
  constructor(config = {}) {
    this.islandIds = Array.isArray(config.islandIds) && config.islandIds.length > 0 
      ? config.islandIds 
      : Array.from({ length: config.islandCount || 8 }, (_, i) => (config.startIslandIndex || 0) + i);
    this.islandCount = this.islandIds.length;
    this.activeIslandId = this.islandIds[0] || 0;
    // ...
  ```
- Map worker instances by their actual `islandId`:
  ```js
  this.workers = new Map(); // islandId -> Worker instance
  ```
- In `initWorkers(baseSeed)`:
  For each `id` in `this.islandIds`:
  ```js
  const worker = new Worker('./js/workers/island.worker.js', { type: 'module' });
  worker.onmessage = (e) => this.handleWorkerMessage(e.data);
  this.workers.set(id, worker);
  worker.postMessage({
    type: 'INIT',
    islandId: id,
    seed: baseSeed + id * 99991,
    isPaused: this.isPaused,
    speed: this.speed,
    isTurbo: this.isTurbo
  });
  ```
- `setActiveIsland(islandId)`: sets active island to the specified `islandId` if present in `this.islandIds`.
- Telemetry cache: Map or array of telemetry keyed by `islandId`.
- Methods `setPause`, `setSpeed`, `resetAll`, `spawnOnActiveIsland`, `setPopulationLimits`: iterate over `this.workers.values()`.

### 2. `ClusterClient` (`js/cluster-client.js`)
Module responsible for communicating with `server.py`:
- `async join(name, requestedCores)`: Calls `POST /api/cluster/join`, receives assigned `islandIds`, `baseSeed`, and `globalState`.
- `startHeartbeat(islandManager, intervalMs = 1000)`:
  - Collects local telemetry from `islandManager`.
  - Calculates local TPS and population.
  - Sends `POST /api/cluster/heartbeat`.
  - On response, syncs `isPaused`, `speed`, and `isTurbo` with `islandManager`.
  - Emits event/callback if cluster state changed or migration epoch updated.
- `async leave()`: Sends `POST /api/cluster/leave` on window unload or disconnect.

## Test Plan
1. **Dynamic Offset Instantiation**: Instantiate `new IslandManager({ islandIds: [10, 11, 12, 13] })` in a headless node/browser test. Verify 4 workers spawn with `islandId` 10, 11, 12, and 13.
2. **Frame Streaming**: Call `setActiveIsland(11)` and `requestActiveFrame()`. Verify frame data returns for `islandId: 11`.
3. **Heartbeat & Sync**: Mock or run server, join cluster with `ClusterClient`, verify heartbeat transmits local island telemetry, and verify remote pause signal immediately pauses local workers.

## Acceptance Criteria
- [ ] `IslandManager` works seamlessly with any arbitrary array of island IDs (e.g. `[0..7]` for Host, `[8..11]` for Client).
- [ ] Active island selection and viewport frame streaming function properly with non-zero start indices.
- [ ] `ClusterClient` joins the server, receives assigned island IDs, and runs periodic heartbeats.
- [ ] Changes in cluster pause/speed state received in heartbeats are immediately applied to local workers.
- [x] `IslandManager` works seamlessly with any arbitrary array of island IDs (e.g. `[0..7]` for Host, `[8..11]` for Client).
- [x] Active island selection and viewport frame streaming function properly with non-zero start indices.
- [x] `ClusterClient` joins the server, receives assigned island IDs, and runs periodic heartbeats.
- [x] Changes in cluster pause/speed state received in heartbeats are immediately applied to local workers.

