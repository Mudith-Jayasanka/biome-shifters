# Task 18: Headless Island Web Worker Core & Elite Export/Import

## Status
`DONE`

## Goal
Create a dedicated Web Worker module (`js/workers/island.worker.js`) and update `js/simulation.js` to enable headless simulation execution inside background Web Worker threads with cross-island elite export/import capabilities.

## Context
To utilize multi-core processing power, each simulation island must run independently inside a Web Worker on its own CPU core. This task builds the worker script and message protocol, and equips `Simulation` with methods to export top elite brains and import immigrant pioneers from foreign islands.

## Files to Create/Modify
- `js/simulation.js` [MODIFY]: Add `islandId`, `exportElites(count)`, `importElites(elites, spawnCount)`, and track immigrant statistics.
- `js/workers/island.worker.js` [NEW]: Background worker thread hosting a `Simulation` instance, managing its execution loop (ticks, speed, pause), and responding to coordinator commands (`INIT`, `START`, `PAUSE`, `SET_SPEED`, `GET_FRAME`, `EXPORT_ELITES`, `IMPORT_ELITES`, `SPAWN_AGENTS`, `SET_POP_LIMITS`, `SERIALIZE`, `DESERIALIZE`).

## Detailed Specification

### 1. `js/simulation.js`
- Add `this.islandId = config.islandId ?? 0;` and `this.immigrantsReceived = 0;` to `Simulation` constructor.
- Add `exportElites(count = 3)`:
  - Scans `this.eliteArchive` and living top performers by biological Darwinian fitness: `agent.age + agent.biomassEaten * 25 + agent.offspringCount * 300`.
  - Returns array of objects: `{ fitness, generation, brain: brain.toJSON(), originIsland: this.islandId, originTick: this.tickCount }`.
- Add `importElites(elites, spawnCount = 2)`:
  - Adds imported elite brains into `this.eliteArchive` after deserializing via `NeuralNet.fromJSON()`.
  - Spawns `spawnCount` immigrant pioneer agents into safe locations on the island (`this.findSpawnLocation()`), initializing them with the immigrant elite brain, a modest mutation chance (0.05) or exact clone, starting energy (`CONFIG.INITIAL_ENERGY * 1.5`), and marking them with foreign lineage.
  - Increments `this.immigrantsReceived += elites.length`.
- Ensure `toJSON()` and `fromJSON()` preserve `islandId` and `immigrantsReceived`.

### 2. `js/workers/island.worker.js`
- ES6 Module Web Worker (`{ type: 'module' }`).
- Instantiates `Simulation`.
- Loop mechanism:
  - Supports normal speeds (`1x`, `2x`, `5x`, `10x`) using timing batching, and `turbo` mode using a continuous loop / microtask pump with batching.
  - Maintains accurate TPS measurement for the island.
  - Sends a periodic lightweight telemetry message (`TELEMETRY`) every 500ms containing:
    `{ islandId, tick, population, maxGen, maxGenAllTime, biomass, tps, immigrantsReceived }`.
- Message Handler:
  - `INIT`: `{ seed, islandId, width, height, initialPopulation }`
  - `SET_SPEED`: `{ speed, isTurbo }`
  - `PAUSE`: `{ isPaused }`
  - `GET_FRAME`: `{ selectedAgentId, selectedTile }` -> replies with `FRAME_DATA` containing grid layers, agents summary array, telemetry history, and selected entity details.
  - `EXPORT_ELITES`: `{ count }` -> replies with `EXPORTED_ELITES`.
  - `IMPORT_ELITES`: `{ elites, spawnCount }` -> imports into local simulation.
  - `SPAWN_BATCH`: `{ count }` -> spawns agents.
  - `SET_POP_LIMITS`: `{ maxPopulation, minPopulationFloor }`.
  - `SERIALIZE`: replies with `SERIALIZED_DATA` (`sim.toJSON()`).
  - `DESERIALIZE`: `{ data }` -> restores simulation from JSON.

## Test Plan
- Create a test script or node verification to load `Simulation`, test `exportElites()` and `importElites()`.
- Verify in browser that `new Worker('./js/workers/island.worker.js', { type: 'module' })` initializes, ticks, and responds to messages.

## Acceptance Criteria
- [ ] `Simulation` exports top Darwinian elite brains with origin island tag.
- [ ] `Simulation` imports foreign elites, stores them in archive, and spawns pioneer immigrants.
- [ ] `island.worker.js` runs independently in background thread and calculates local TPS.
- [ ] `island.worker.js` responds to `GET_FRAME` with render-ready TypedArray layers and agent summaries.
