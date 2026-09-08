# Task 43: Harsh Coastal Perimeter & Anti-Corner Eviction

## Status
`DONE`

---

## Goal
Implement an inhospitable coastal perimeter along the outer grid borders with zero fertility, zero flora growth, and elevated metabolic exposure drain to naturally eradicate corner-camping and concentrate populations in the fertile island interior.

---

## Context
Telemetry extraction from long-running simulations (`saves/multi_island_tick_5566691_test.json`) revealed that corner tiles suffer severe agent crowding (densities $3.5\times$ to $6.4\times$ higher than the interior), with $34\%$ of all agents loitering within 8 tiles of the map edge.
Because corner cells are sheltered from multi-directional grazing, biomass regrew more reliably in corners ($0.149$ vs $0.086$ interior). Agents evolved to follow extended food raycasts into corners, where they lived $65\%$ longer by camping on edge regrowth.

Instead of artificial invisible bounce barriers, this task establishes a natural **Harsh Coastal Perimeter** (the outer 3 tiles of each island):
1. The perimeter is designated as salty, barren coastal rock: `fertility = 0.0` and `biomass = 0.0` permanently.
2. Lingering on coastal perimeter cells inflicts severe environmental exposure (`COASTAL_EXPOSURE_DRAIN = 0.35` extra energy per tick).
3. Agents perceiving barren soil ahead and experiencing rapid caloric depletion on the coast are under strict evolutionary pressure to turn back toward interior valleys.
4. Spawning routines prevent agents from being dropped into the hostile coastal zone.
5. Worker frame serialization and remote satellite snapshot generators support coastal detection cleanly.

---

## Files to Create / Modify
- `[MODIFY]` `tasks/TASK_43_harsh_coastal_perimeter_and_corner_eviction.md` — Task specification document.
- `[MODIFY]` `tasks/README.md` — Register Task 43 in the task catalog and dependency graph.
- `[MODIFY]` `js/config.js` — Define `COASTAL_BORDER_WIDTH` (3) and `COASTAL_EXPOSURE_DRAIN` (0.35).
- `[MODIFY]` `js/grid.js` — Export pure `isCoastal(x, y, margin, width, height)`, add `Grid.prototype.isCoastal(x, y, margin)` helper, and initialize/clamp coastal border cells to zero fertility/biomass in `initTerrain()` and `fromJSON()`.
- `[MODIFY]` `js/environment.js` — In `simulateVegetationGrowth()`, prevent biomass from sprouting or growing within the coastal perimeter.
- `[MODIFY]` `js/agent.js` — In `act()`, apply `CONFIG.COASTAL_EXPOSURE_DRAIN` when `grid.isCoastal(this.x, this.y)`.
- `[MODIFY]` `js/simulation.js` — In `findSpawnLocation()`, exclude coastal perimeter cells in Stages 1 & 2.
- `[MODIFY]` `js/workers/island.worker.js` — In `generateSnapshot()`, tint coastal perimeter tiles to match main canvas.
- `[MODIFY]` `js/renderer.js` — Visually tint the outer coastal perimeter with rocky salt-flat styling so users clearly see the inhospitable boundary zone.

---

## Detailed Specification

### 1. `js/config.js`
Add configuration constants:
```javascript
  // Coastal Perimeter & Boundary Containment
  COASTAL_BORDER_WIDTH: 3,        // Margin width in tiles of hostile coastal perimeter
  COASTAL_EXPOSURE_DRAIN: 0.35,   // Additional metabolic drain per tick for lingering in coastal zone
```

### 2. `js/grid.js`
Export pure function and add Grid method:
```javascript
export function isCoastal(x, y, margin = CONFIG.COASTAL_BORDER_WIDTH || 3, width = CONFIG.GRID_WIDTH, height = CONFIG.GRID_HEIGHT) {
  return (x < margin || x >= width - margin || y < margin || y >= height - margin);
}
```
And inside `Grid`:
```javascript
  isCoastal(x, y, margin = CONFIG.COASTAL_BORDER_WIDTH || 3) {
    return isCoastal(x, y, margin, this.width, this.height);
  }
```
In `initTerrain()` and `Grid.fromJSON()`, zero out `fertility` and `biomass` for all cells where `isCoastal(x, y)` is true.

### 3. `js/environment.js`
In `simulateVegetationGrowth()`:
```javascript
  // Prevent growth or seed germination in the barren coastal perimeter
  if (this.grid.isCoastal(x, y)) {
    nextBiomass[i] = 0;
    continue;
  }
```

### 4. `js/agent.js`
In `Agent.prototype.act()`:
```javascript
  // Environmental exposure: coastal perimeter inflicts harsh metabolic drain
  if (grid.isCoastal(this.x, this.y)) {
    this.energy -= CONFIG.COASTAL_EXPOSURE_DRAIN;
  }
```

### 5. `js/simulation.js`
In `findSpawnLocation()`:
Exclude coastal tiles from candidate spawn points so initial agents, batch spawns, and cross-island immigrants do not spawn directly into the harsh coastal zone.

### 6. `js/workers/island.worker.js`
In `generateSnapshot()`:
Apply coastal shoreline tinting to matching pixels in the 64x64 satellite snooper.

### 7. `js/renderer.js`
In `rasterizeGridLayer()`:
Tint coastal boundary cells with rocky saline styling across biome view.

---

## Test Plan
1. **Headless Verification**:
   - Run a Node.js verification script creating a `Grid`, `Environment`, and `Simulation`.
   - Verify that cells at $x < 3$, $y < 3$, $x \ge W - 3$, or $y \ge H - 3$ have `fertility === 0.0` and never accumulate biomass even when soaked with moisture.
   - Verify `Grid.fromJSON()` properly zeroes out coastal fertility and biomass on deserialization.
   - Place an agent at $(1, 1)$ and tick `agent.act(ACTIONS.IDLE, grid)`. Verify that `energy` decreases by `effectiveDrain + COASTAL_EXPOSURE_DRAIN`.
   - Verify `findSpawnLocation()` never returns a coastal tile.
2. **Browser Verification**:
   - Start the simulation with `python3 server.py`.
   - Observe in the canvas view that the outer 3-tile border appears as a distinct rocky shoreline.
   - Inspect agents near the perimeter: observe that they quickly turn away or perish, leaving corners empty and agents concentrated in interior river basins.

---

## Acceptance Criteria
- [x] `COASTAL_BORDER_WIDTH` (3) and `COASTAL_EXPOSURE_DRAIN` (0.35) defined in `js/config.js`.
- [x] `isCoastal` exported and `grid.isCoastal(x, y)` implemented with zero per-tick allocations.
- [x] Coastal perimeter cells cannot grow or germinate biomass in `environment.js`.
- [x] Coastal cells initialized and clamped to zero fertility/biomass in `grid.js` (including `fromJSON`).
- [x] Spawning routines in `simulation.js` avoid coastal perimeter.
- [x] Agents in coastal perimeter incur additional exposure metabolic drain in `agent.js`.
- [x] Visual styling applied in `renderer.js` and `island.worker.js`.
- [x] Headless tests pass with zero errors.
