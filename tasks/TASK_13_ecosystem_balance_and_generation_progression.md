# Task 13: Ecosystem Balance & Generational Progression

## Status
`TODO`
`DONE`

---

## Goal
Establish a self-sustaining ecological equilibrium (stable hydrology and vegetative biomass) and repair generational inheritance so that evolving populations consistently advance beyond Generation 1 across thousands of ticks.

---

## Context
In long-running simulations (e.g. 100k ticks), entities remained permanently at Generation 1. Investigation revealed:
1. Basins evaporated and infiltrated into soil faster than rain replenished them, causing average world moisture to plunge below 0.08 and biomass to completely collapse to 0 (desertification).
2. Without food, agents suffered 100% starvation mortality, unable to ever reach `REPRODUCTION_THRESHOLD` (160).
3. The extinction floor constantly repopulated the world via `reseedFromElites()`, but reseeded agents were instantiated with `generation = 1` because the elite archive did not record generation.
4. Telemetry only evaluated living agents, dropping `generationMax` back to 1 whenever older generations died.

---

## Files to Create / Modify
- `[MODIFY]` `js/config.js` — Tune baseline moisture drying, rain frequency, reproduction threshold, and graze energy intake.
- `[MODIFY]` `js/environment.js` — Add low-basin groundwater replenishment and dormant seed germination in moist fertile soil.
- `[MODIFY]` `js/simulation.js` — Preserve generation in elite archive, propagate generation to reseeded descendants, and track all-time maximum generation.
- `[MODIFY]` `js/main.js` — Display all-time maximum generation alongside current living generation in the Evolution & Generations HUD card.
- `[MODIFY]` `index.html` — Update telemetry labels if necessary to show all-time max generation.

---

## Detailed Specification

### 1. `js/config.js`
- `MOISTURE_DRYING`: Lower from `0.003` to `0.001` to prevent rapid desertification.
- `RAIN_PROBABILITY`: Increase from `0.04` to `0.08` so showers sustain continental greenery.
- `REPRODUCTION_THRESHOLD`: Adjust from `160` to `135` so agents that feed well can reach reproductive surplus.
- `GRAZE_MAX_INTAKE`: Increase from `15.0` to `18.0` so grazing provides a viable caloric surplus over movement and metabolism.

### 2. `js/environment.js`
- In `simulateHydrology()` or dedicated `simulateWaterSources()`: Ensure low-elevation ocean/lake basins (`elev < 0.22`) receive baseline spring/groundwater inflow (e.g. `water[i] = Math.min(0.6, water[i] + 0.02)` when water is low), maintaining permanent water bodies.
- In `simulateVegetationGrowth()`: Allow dormant seed germination on barren tiles when moisture and fertility are high (`m > 0.35 && f > 0.35 && Math.random() < 0.001`), ensuring permanent desertification cannot wipe out plant life.

### 3. `js/simulation.js`
- In `this.stats`: Add `generationMaxAllTime: 1`.
- In `recordPotentialElite(agent)`: Save `generation: agent.generation` into `this.eliteArchive`.
- In `reseedFromElites()`: Set `agent.generation = elite.generation || 1`.
- In `updateStats()`: Track `if (maxGen > this.stats.generationMaxAllTime) this.stats.generationMaxAllTime = maxGen;`.

### 4. `js/main.js` & `index.html`
- Update the Max Generation stat display in `updateTelemetry()` to show current and peak generation (e.g., `Gen ${stats.generationMax} (Peak: ${stats.generationMaxAllTime})`).

---

## Test Plan
1. **Automated Headless Verification**:
   Run a 10,000-tick headless Node simulation:
   ```bash
   node --input-type=module -e "
   import { Simulation } from './js/simulation.js';
   const sim = new Simulation();
   sim.initWorld(42);
   for (let t = 1; t <= 10000; t++) sim.tick();
   console.log('Biomass:', sim.stats.totalBiomass);
   console.log('Living Max Gen:', sim.stats.generationMax);
   console.log('All-Time Max Gen:', sim.stats.generationMaxAllTime);
   console.log('Avg Gen:', sim.stats.generationAvg);
   if (sim.stats.totalBiomass > 1500 && sim.stats.generationMaxAllTime >= 5) process.exit(0);
   else process.exit(1);
   "
   ```
2. **Browser Verification**:
   Load `http://localhost:8080/`, run in Turbo mode, and verify that the Living Generation Distribution graph and Max Generation counter continuously climb through generations 2, 3, 4, 5+ while biomass remains lush and green.

---

## Acceptance Criteria
- [ ] World biomass remains stable and vibrant (>1500) over 10,000+ ticks without collapsing to 0.
- [ ] Water basins retain permanent water coverage, sustaining regional vegetation.
- [ ] Agents consistently reproduce and produce offspring advancing beyond Generation 1.
- [ ] Reseeded agents from the elite archive preserve the generational lineage of their ancestors.
- [ ] All-time maximum generation is tracked and displayed alongside living generation statistics.
- [x] World biomass remains stable and vibrant (>1500) over 10,000+ ticks without collapsing to 0.
- [x] Water basins retain permanent water coverage, sustaining regional vegetation.
- [x] Agents consistently reproduce and produce offspring advancing beyond Generation 1.
- [x] Reseeded agents from the elite archive preserve the generational lineage of their ancestors.
- [x] All-time maximum generation is tracked and displayed alongside living generation statistics.

