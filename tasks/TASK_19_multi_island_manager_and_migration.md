# Task 19: Multi-Island Manager & Cross-Island Elite Migration

## Status
`DONE`

## Goal
Implement the coordinator module (`js/island-manager.js`) to spawn and supervise 8 parallel Web Worker islands, coordinate render frame retrieval for the active island, aggregate telemetry, and drive the Cross-Island Elite Migration protocol.

## Context
Each of the 8 islands runs on its own core in an isolated worker. To achieve the user's goal ("The best from each island should be spread across the other islands though so that all islands are separated but make combined progress"), `IslandManager` acts as the conductor: orchestrating workers, monitoring telemetry, delivering visual frames to the renderer, and managing the periodic broadcast of top-performing elite genomes across all islands.

## Files to Create/Modify
- `js/island-manager.js` [NEW]: `IslandManager` class orchestrating 8 Web Worker islands, managing active island selection, pulling render frames, broadcasting commands, and running the migration protocol.
- `js/storage.js` [MODIFY]: Add support for multi-island bundle serialization/deserialization.

## Detailed Specification

### 1. `js/island-manager.js`
- Spawns 8 Web Workers:
  ```javascript
  for (let i = 0; i < 8; i++) {
    this.workers[i] = new Worker('./js/workers/island.worker.js', { type: 'module' });
  }
  ```
- Maintains state for all 8 islands:
  - `activeIslandIndex`: 0..7 (default: 0).
  - `islandsTelemetry`: array of 8 summary objects (`{ tick, population, maxGen, maxGenAllTime, biomass, tps, immigrantsReceived }`).
  - `activeFrameData`: latest frame snapshot received from active island worker.
  - `waitingForFrame`: boolean flag to ensure pull-based frame requests never pile up.
  - `isPaused`: boolean.
  - `speed`: number / 'turbo'.
- Frame Acquisition:
  - `requestActiveFrame(selectedAgentId, selectedTile)`: Sends `GET_FRAME` to `workers[activeIslandIndex]`.
  - When worker responds with `FRAME_DATA`, caches in `activeFrameData` and resets `waitingForFrame`.
- Cross-Island Elite Migration Protocol:
  - `migrationIntervalTicks`: 800 (configurable).
  - `migrationEpochCount`: counter for migration cycles.
  - `triggerMigration()`:
    1. Requests `EXPORT_ELITES` (count = 3) from all 8 workers.
    2. Collects exported elite packages from all workers.
    3. Broadcasts foreign elites to each worker:
       For island $i$, compile elites from all other islands $j \neq i$, select the top performing foreign genomes, and send `IMPORT_ELITES` message to worker $i$.
    4. Records migration telemetry event (timestamp, epoch, count of migrants exchanged, peak generation).
    5. Dispatches custom event / callback to inform UI of migration occurrence.
  - Auto-Migration Check: Checks island ticks; when tick reaches multiple of `migrationIntervalTicks`, triggers migration automatically.
- Broadcast Controls:
  - `setPause(isPaused)`: Broadcasts to all workers.
  - `setSpeed(speed, isTurbo)`: Broadcasts to all workers.
  - `resetAll(baseSeed)`: Reinitializes all 8 workers with unique seeds.
  - `spawnOnActiveIsland(count)`: Sends `SPAWN_BATCH` to active island.
  - `setActiveIsland(index)`: Switches active island index, immediately requests new frame.
- Multi-Island Save / Load:
  - `saveAll(name)`: Asynchronously collects `SERIALIZE` from all 8 workers, packages into a unified multi-island JSON payload, and posts to `StorageManager.saveSimulation()`.
  - `loadAll(data)`: Restores 8 worker states from multi-island save, or restores active island if single-island save is provided.

## Test Plan
- Run 8 workers simultaneously and log individual TPS.
- Trigger migration and verify each worker receives foreign elite brains and spawns immigrants.
- Verify multi-island state save and load roundtrip.

## Acceptance Criteria
- [ ] 8 Web Workers are successfully initialized and run concurrently on separate threads.
- [ ] Active island can be switched smoothly, pulling 60 FPS frame data without memory leaks.
- [ ] Cross-island elite migration successfully exchanges genomes between all 8 islands.
- [ ] Multi-island serialization preserves the state of all 8 islands.
