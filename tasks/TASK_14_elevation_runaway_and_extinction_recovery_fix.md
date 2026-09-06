# Task 14: Elevation Runaway Fix & Robust Extinction Recovery

## Status
`DONE`

---

## Goal
Eliminate terrain elevation runaway (preventing entire worlds from elevating into mountain peaks and turning white) and ensure robust, unblocked spawning so the extinction safety floor never deadlocks at population zero even on extreme topography.

---

## Context
Running long turbo sessions (e.g. tick 1,339,724) resulted in the population dropping to zero without recovery, while the entire canvas turned solid white with transient water puddles.
Analysis revealed:
1. **Unbounded Mounding**: Herbivore agents repeatedly executed `ACTIONS.MOUND_EARTH` (+0.05 elevation) to push water downhill and protect biomass. With zero environmental erosion or mass conservation, 97.6% of the world rose above 0.95 elevation, classifying the entire world as `MOUNTAIN_PEAK` (pure white).
2. **Spawn Gate Extinction Deadlock**: `Simulation.findSpawnLocation()` enforced `grid.getElevation(x, y) < 0.85`. Because 0 out of 16,384 tiles had elevation < 0.85 on the mounded map, `findSpawnLocation()` failed 100% of the time, preventing `reseedFromElites()` from spawning any agents.

---

## Files to Create / Modify
- `[MODIFY]` `js/config.js` — Add geological erosion & thermal relaxation constants, and terraforming height limit.
- `[MODIFY]` `js/grid.js` — Track `baseElevation` TypedArray buffer, handle serialization/deserialization, and reconstruct baseline topography for legacy saves.
- `[MODIFY]` `js/agent.js` — Enforce physical ceiling on `MOUND_EARTH` (`elev < 0.72`) to prevent artificial alpine peaks and provide failure feedback to the RNN.
- `[MODIFY]` `js/environment.js` — Implement `simulateGeologicalErosion()` with hydraulic erosion, gravity soil creep (angle of repose relaxation), and baseline weathering pull toward bedrock.
- `[MODIFY]` `js/simulation.js` — Multi-stage progressive fallback in `findSpawnLocation()`, auto-recovery on tick/load, and fix duplicate push in `recordPotentialElite()`.

---

## Detailed Specification

### 1. `js/config.js`
Add configuration constants:
```javascript
  // Geological Weathering & Erosion CA
  TERRAFORM_MAX_ELEVATION: 0.72,  // Maximum elevation agents can artificially mound (prevents artificial alpine white-out)
  SOIL_CREEP_THRESHOLD: 0.08,     // Slope difference (angle of repose) beyond which gravity causes soil to slip downhill
  SOIL_CREEP_RATE: 0.02,          // Rate at which over-steepened mounds settle into neighbors
  EROSION_HYDRAULIC_RATE: 0.001,  // Sediment carrying capacity of flowing water
  EROSION_BASE_WEATHERING: 0.00005// Slow geological relaxation pull towards base bedrock topography
```

### 2. `js/grid.js`
- Add `this.baseElevation = new Float32Array(this.size);` in `constructor`.
- In `generateTerrain()`, populate `this.baseElevation[idx] = elev;` alongside `this.elevation[idx] = elev;`.
- In `toJSON()`, include `baseElevation: Array.from(this.baseElevation)`.
- In `fromJSON()`, load `baseElevation` if present; if missing (legacy save like `error_-_population_zero.json`), synthesize a natural baseline topography using noise & center distance bias or smoothed baseline so geological erosion can heal bloated saves.

### 3. `js/agent.js`
- In `case ACTIONS.MOUND_EARTH`:
  ```javascript
  const elev = grid.getElevation(this.x, this.y);
  if (elev < CONFIG.TERRAFORM_MAX_ELEVATION) {
    grid.setElevation(this.x, this.y, elev + 0.04);
    success = 1.0;
  } else {
    // Cannot mound beyond hill height into alpine peaks
    this.energy -= 0.1;
    success = 0.0;
  }
  ```

### 4. `js/environment.js`
- Add `simulateGeologicalErosion()` to `Environment.tick()`:
  1. **Soil Creep / Angle of Repose**: For steep gradients ($\Delta e > \text{SOIL\_CREEP\_THRESHOLD}$), transfer loose soil downhill proportionally.
  2. **Hydraulic Runoff Erosion**: Moving water slightly erodes high elevation towards low elevation.
  3. **Baseline Topography Weathering**: Gradually pulls elevated mounds back toward `grid.baseElevation`, preventing infinite runaway elevation even over millions of ticks.

### 5. `js/simulation.js`
- In `findSpawnLocation()`:
  - Phase 1: Search randomly (50 attempts) with optimal conditions: `water < 0.25 && elev < 0.80 && occupant === -1`.
  - Phase 2: Relax elevation restriction (50 attempts): `water < 0.35 && elev < 0.98 && occupant === -1`.
  - Phase 3: Deterministic fallback: Scan grid for any dry unoccupied tile `water < 0.40 && occupant === -1`.
- In `recordPotentialElite(agent)`: Remove redundant `push({ fitness, brain: brainCopy })`.

---

## Test Plan
1. **Automated Headless Test**:
   Load `saves/error_-_population_zero.json` in Node.js:
   - Verify `findSpawnLocation()` succeeds immediately.
   - Verify `reseedFromElites()` spawns up to `minPopulationFloor` (140) agents.
   - Run 1,000 ticks:
     - Verify population $\ge 100$.
     - Verify average elevation steadily declines from 0.9725 toward healthy levels.
     - Verify non-mountain biomes appear and flourish.
2. **Browser Verification**:
   - Start server, load `error_-_population_zero.json`.
   - Observe immediate agent resurrection and recovery.
   - Observe the white terrain eroding into green biomes and flowing water.
   - Run in Turbo mode for 10,000 ticks to verify long-term stability.

---

## Acceptance Criteria
- [x] `findSpawnLocation()` never deadlocks or returns null when dry land exists.
- [x] Loading `error_-_population_zero.json` immediately restores living population to `minPopulationFloor`.
- [x] Agents cannot artificially raise terrain beyond `TERRAFORM_MAX_ELEVATION` (0.72).
- [x] Geological erosion CA gradually relaxes extreme high ground toward balanced natural topography.
- [x] Biome mode displays lush varied biomes rather than permanent white sheet.
- [x] Automated headless test passes.
