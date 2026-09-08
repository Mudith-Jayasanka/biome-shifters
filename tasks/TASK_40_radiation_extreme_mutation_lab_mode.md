# Task 40: Radiation & Extreme Mutation Laboratory Mode (Per-Island Granularity & Undoable)

## Status: `DONE`

## Goal
Implement a granular, undoable Radiation & Extreme Mutation Laboratory Mode allowing the Host to designate ANY specific island (whether hosted locally on the Host machine or remotely on a contributor machine) with elevated mutation rates (4.0x) and perturbation strength, and toggle it back to normal at any time.

## Context
Homogeneous mutation rates across all islands can lead to slower speciation. By subjecting selected individual islands to accelerated mutation rates, those islands generate radical phenotypes and novel behavioural archetypes that periodically cross-pollinate into the rest of the cluster during migration epochs. Full undoability and per-island control ensures the user can test genetic hyper-evolution without compromising unselected islands.

## Files to Create/Modify
- `[MODIFY]` `server.py` — Track `irradiated_islands: set[int]` in `ClusterManager`, add `POST /api/cluster/island/radiation` endpoint, and propagate irradiated island IDs in heartbeats and node queries.
- `[MODIFY]` `js/simulation.js` — Add `isRadiationMode` and `radiationMultiplier` attributes, `setRadiationMode(enabled, multiplier)` method, and apply multiplier during offspring mutation and recovery reseed.
- `[MODIFY]` `js/agent.js` — Scale child brain mutation rate and strength in `reproduce()` when the simulation is in radiation mode.
- `[MODIFY]` `js/workers/island.worker.js` — Handle `SET_RADIATION` message, forward to `simulation.setRadiationMode()`, and include `isRadiationMode` in `TELEMETRY` and `FRAME_DATA`.
- `[MODIFY]` `js/island-manager.js` — Maintain `irradiatedIslands: Set<number>`, add `setIslandRadiation(islandId, enabled, multiplier)`, and dispatch `SET_RADIATION` to the appropriate worker.
- `[MODIFY]` `js/cluster-client.js` — Synchronize `irradiatedIslands` from heartbeat `globalState` and add `toggleIslandRadiation(islandId, enabled, multiplier)`.
- `[MODIFY]` `js/renderer.js` — Add distinct irradiated biome palette (`IRRADIATED_BIOME_COLORS`) with bio-luminescent neon/toxic chartreuse and jade hues, irradiated water tints, and radioactive viewport border glow when viewing an irradiated island.
- `[MODIFY]` `index.html` — Add Radiation Lab toggle button & badge to the Inspector World/Population card, and add interactive radiation indicators to the Host Cluster Nodes table.
- `[MODIFY]` `style.css` — Glowing radioactive badges, toggle button styles, and pulse animation for irradiated islands.
- `[MODIFY]` `js/main.js` — Render interactive island pills in the Cluster Nodes dashboard allowing 1-click toggling of radiation mode for any host or contributor island, update the active island Radiation button in the Inspector, and add `☢️` indicator on island switcher bar buttons.

## Detailed Specification

### 1. Backend: `server.py`
- In `ClusterManager`:
  - Initialize `cls.irradiated_islands = set()`.
  - Add method `ClusterManager.set_island_radiation(cls, island_id: int, enabled: bool) -> dict`:
    - If `enabled`: `cls.irradiated_islands.add(island_id)`.
    - Else: `cls.irradiated_islands.discard(island_id)`.
    - Return `{'status': 'radiation_updated', 'islandId': island_id, 'enabled': bool, 'irradiatedIslands': sorted(list(cls.irradiated_islands))}`.
  - In `ClusterManager.heartbeat()`:
    - Include `'irradiatedIslands': sorted(list(cls.irradiated_islands))` in `globalState`.
  - In `ClusterManager.get_cluster_summary()`:
    - Include `'irradiatedIslands': sorted(list(cls.irradiated_islands))` in cluster dictionary.
  - In `ClusterManager.get_all_nodes()`:
    - Include `'irradiatedIslands': [iid for iid in n.get('islandIds', []) if iid in cls.irradiated_islands]` in each node record.
- In `do_POST`:
  - Route `POST /api/cluster/island/radiation` (guarded by `self.is_localhost_request()`).
  - Parse `{ islandId, enabled }` and invoke `ClusterManager.set_island_radiation()`.

### 2. Simulation & Agent Mechanics: `js/simulation.js` & `js/agent.js`
- In `Simulation`:
  - `this.isRadiationMode = false;`
  - `this.radiationMultiplier = 4.0;`
  - `setRadiationMode(enabled, multiplier = 4.0)`: updates both fields.
  - In fallback reseed / extinction recovery: scale mutation rate and strength if `this.isRadiationMode`.
  - In `toJSON()` & `fromJSON()`: persist `isRadiationMode` and `radiationMultiplier`.
- In `Agent.prototype.reproduce(grid, ...)`:
  - When mutating `childBrain`:
    - `const rate = (this.simulation && this.simulation.isRadiationMode) ? CONFIG.MUTATION_RATE_DEFAULT * (this.simulation.radiationMultiplier || 4.0) : CONFIG.MUTATION_RATE_DEFAULT;`
    - `const strength = (this.simulation && this.simulation.isRadiationMode) ? 0.45 : 0.2;`
    - `childBrain.mutate(rate, strength);`

### 3. Worker & Island Manager: `js/workers/island.worker.js` & `js/island-manager.js`
- `island.worker.js`:
  - In `case 'INIT'`: if `msg.isRadiationMode`, call `simulation.setRadiationMode(true, msg.radiationMultiplier)`.
  - In `case 'SET_RADIATION'`: call `simulation.setRadiationMode(msg.enabled, msg.multiplier || 4.0)`.
  - In `measureTpsAndSendTelemetry()`: post `isRadiationMode: Boolean(simulation.isRadiationMode)`.
- `island-manager.js`:
  - Maintain `this.irradiatedIslands = new Set();`
  - `setIslandRadiation(islandId, enabled, multiplier = 4.0)`:
    - If `enabled`, `this.irradiatedIslands.add(islandId)`; else `this.irradiatedIslands.delete(islandId)`.
    - If `this.workerMap.has(islandId)`:
      `this.workerMap.get(islandId).postMessage({ type: 'SET_RADIATION', islandId, enabled, multiplier })`.
  - In `initWorkers()`: pass `isRadiationMode: this.irradiatedIslands.has(id)` in `INIT`.

### 4. Cluster Coordinator: `js/cluster-client.js`
- In `sendHeartbeat()`:
  - Extract `globalState.irradiatedIslands`.
  - Compare with local `this.islandManager.irradiatedIslands` for all local `this.islandManager.islandIds`.
  - If any local island changed state, call `this.islandManager.setIslandRadiation(id, isIrradiated)`.
  - Emit `'radiation_sync', globalState.irradiatedIslands`.
- Add `async toggleIslandRadiation(islandId, enabled, multiplier = 4.0)`:
  - Calls `POST /api/cluster/island/radiation` with `{ islandId, enabled, multiplier }`.

### 5. Visual Distinction & Irradiated Palette: `js/renderer.js`
- Define `IRRADIATED_BIOME_COLORS` table with bio-luminescent, mutated hues:
  - Flora/Grassland/Forests: vibrant radioactive lime and toxic chartreuse (`[132, 215, 60]`, `[20, 150, 95]`).
  - Water: eerie phosphor-teal glow (`[15, 85, 135]`, `[35, 170, 190]`).
  - Desert/Highland: copper irradiated wasteland (`[210, 160, 95]`).
  - Swamps: murky toxic violet-green (`[78, 122, 70]`).
- In `Renderer.prototype.rasterizeGridLayer(grid, isRadiationMode)`:
  - If `isRadiationMode` is true, sample colors from `IRRADIATED_BIOME_COLORS`.
- In `Renderer.prototype.render()`:
  - Detect `simulation.isRadiationMode` or `frame.isRadiationMode`.
  - When irradiated, render a glowing radioactive border (`rgba(74, 222, 128, 0.7)`) around the world canvas and a corner watermark/badge `☢️ HIGH RADIATION LAB`.
  - Agents living on irradiated islands render with a subtle luminous border/dot.

### 6. UI Controls: `index.html`, `style.css`, `js/main.js`
- **Host Cluster Nodes Modal**:
  - In the `Simulated Islands` column: render each island as an interactive clickable pill:
    - Normal: `<span class="island-pill-btn" data-island="${id}" title="Click to toggle Extreme Mutation Lab">🏝️ Isl ${id + 1}</span>`
    - Irradiated: `<span class="island-pill-btn irradiated" data-island="${id}" title="Click to disable Extreme Mutation Lab">☢️ Isl ${id + 1}</span>`
  - Clicking any pill immediately toggles radiation mode for that island (Host or Contributor), updates the server, and syncs across the cluster.
- **Top Island Switcher Bar**:
  - Irradiated islands display a glowing radioactive badge `☢️` next to the island name.
- **Inspector Sidebar**:
  - Add a "Radiation & Mutation Laboratory" control to the inspector sidebar for the currently selected island, with a toggle button `[ ☢️ Enable Radiation Lab ]` / `[ ↩️ Disable Radiation Lab ]`.

## Test Plan
- Toggle Radiation mode ON for a local Host island (e.g. Island 2) from the Cluster Nodes dashboard; verify `☢️` badge appears in the island switcher bar and inspector.
- Verify canvas viewport for Island 2 adopts the distinct toxic bio-luminescent color palette and glowing border.
- Toggle Radiation mode OFF (undo); verify badge disappears, canvas returns to standard natural palette, and mutation rates return to baseline.
- Connect a simulated contributor; toggle Radiation mode for a contributor island (e.g. Island 9) from the Host dashboard; verify heartbeat updates the contributor and worker telemetry reports `isRadiationMode: true`.
- Verify non-selected islands remain unaffected in standard mutation mode and standard color palette.

## Acceptance Criteria
- [x] Host can toggle extreme mutation mode on any individual island (local Host island or remote Contributor island).
- [x] The user can undo/turn off radiation mode for any island at any time.
- [x] Irradiated islands visually display a distinct bio-luminescent/toxic color palette and glowing border.
- [x] Offspring mutation rate & perturbation strength are amplified (4.0x) on irradiated islands only.
- [x] Visual indicators (`☢️`) clearly show which islands are undergoing extreme mutation in both the Island Switcher Bar and the Cluster Dashboard.

