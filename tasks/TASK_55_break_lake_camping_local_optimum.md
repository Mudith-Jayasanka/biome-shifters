# Task 55: Break Lake Camping Local Optimum & Restore Nomadic Dispersal

## Status
`DONE`

---

## Goal
Eliminate the stationary lake-camping exploit and restore dynamic herd dispersal, nomadic grazing, and active overland terraforming by introducing seed maturation delay, aquatic submersion drain, stationary soil trampling, and rebalancing agricultural fitness metrics.

---

## Context: Post-Mortem of the "Lake-Camping" Local Optimum

Over an overnight multi-island run of 856,000+ ticks, telemetry revealed that **67% to 71% of all agents across all 8 islands aggregated permanently inside or directly on the perimeter of water basins**, moving minimally and performing millions of repetitive agricultural cycles on the same tiles.

This state represents a quintessential evolutionary **local optimum** driven by the unintended convergence of three previous features:

1. **TASK_43 (Coastal Eviction)**: Hostile border perimeters correctly repelled agents from corner traps, funneling them inland toward central lake basins.
2. **TASK_44 (Microclimate Thermal Relief)**: Soil moisture was given a 40% metabolic relief discount (`MOISTURE_METABOLIC_RELIEF: 0.40`), dropping basal drain in water from $0.20$ to $0.12$ energy/tick.
3. **TASK_45 (Caloric Seed Sowing & Grazing)**:
   - Sowing cost 2.5 energy and **instantly** spawned 0.20 biomass (`SEED_GERM_BIOMASS`).
   - Grazing immediately devoured that 0.20 biomass at `GRAZE_MAX_INTAKE: 20.0`, yielding +4.0 energy.
   - **Net Caloric Profit**: $+1.5$ energy every 2 ticks with zero locomotion.
   - Furthermore, `fitness` rewarded `seedsSown * 10`, skewing elite preservation exclusively toward stationary sowers.
4. **Asymmetric Physics**:
   - Compaction (`TRAMPLE_DEPOSIT`) was *only* deposited during movement (`ACTIONS.MOVE_*`). Stationary agents produced zero trample, keeping overcrowded lake mud permanently uncompacted and farmable.
   - Terrestrial agents suffered no continuous drowning, hypothermia, or fatigue from standing submerged in standing water.
   - Wandering inland meant facing dry soil ($moisture < 0.30$, where seeds wither) and higher basal drain, meaning any adventurous agent starved to death in the arid interior while lake campers reproduced infinitely.

To break this trap without artificial cheats, the physics of the environment must be deepened so that camping is naturally self-limiting and nomadic foraging is ecologically viable.

---

## Detailed Rationale for Improvements

### 1. Seed Maturation Delay (Break the 2-Tick Caloric Exploit)
- **Problem**: Instant 0.20 biomass on seed germination allows an agent to alternate `SOW` $\to$ `GRAZE` $\to$ `SOW` $\to$ `GRAZE` in a closed 2-tick loop.
- **Physical Solution**: Sowing a seed deposits an initial sprout of minimal biomass ($0.03$). For the sprout to become nutritious, it must undergo natural logistic growth over time ($dB/dt = r \cdot B \cdot (1 - B/K) \cdot m \cdot f$).
- **Economic Consequence**: Grazing an immature sprout ($biomass < 0.20$) yields trivial calories ($< 0.6$ energy), making immediate re-grazing a net loss ($-1.9$ energy). To profit from agriculture, agents must sow seeds and move onward, creating pastures to graze upon return.

### 2. Aquatic Submersion Drain (Drowning & Hypothermia)
- **Problem**: Terrestrial agents currently camp inside deep lakes with 40% reduced metabolism.
- **Physical Solution**: While moist shorelines ($water \le 0.15$) provide thermal cooling, standing in standing water ($water > 0.15$) inflicts an aquatic exposure drain (`AQUATIC_EXPOSURE_DRAIN: 0.35`) proportional to depth.
- **Economic Consequence**: Agents are forced out of the lake water and onto the riparian banks and meadows.

### 3. Stationary Soil Trampling (Herd Overcrowding & Hardpan Formation)
- **Problem**: In `agent.js`, trample is only added when moving. 500 agents standing motionless never compact the soil.
- **Physical Solution**: Any agent occupying a tile deposits a subtle stationary trample (`STATIONARY_TRAMPLE_DEPOSIT: 0.04` per tick).
- **Economic Consequence**: When a dense herd clusters in a confined basin, their collective presence rapidly compacts the ground ($trample > 0.45$). Once compacted, `SEED_GERM_MAX_TRAMPLE` halts seed germination and slows flora regrowth, forcing the herd to migrate to fresh, untrampled meadows.

### 4. Soil Fertility Exhaustion & Fallow Regeneration
- **Problem**: A single tile can be grazed infinitely without nutrient depletion.
- **Physical Solution**: Grazing or root harvesting leaches a trace amount of fertility (`FERTILITY_GRAZE_DEPLETION: 0.005`). Natural silt deposition from runoff and fallow resting slowly restores fertility.
- **Economic Consequence**: Depleted monoculture patches become barren, incentivizing rotational grazing.

### 5. Rebalanced Genetic Fitness
- **Problem**: `(seedsSown * 10)` in `simulation.js` massively out-weights exploration, movement, and general survival.
- **Physical Solution**: Align fitness with holistic longevity, exploration, and offspring success: reduce seed sowing weight to `(seedsSown * 1.5)` and reward total distance or diverse biomes traversed.

---

## Files to Create / Modify
- `[NEW]` `tasks/TASK_55_break_lake_camping_local_optimum.md` — This specification file.
- `[MODIFY]` `tasks/README.md` — Register Task 55.
- `[MODIFY]` `js/config.js`:
  - Add `AQUATIC_EXPOSURE_DRAIN: 0.35`
  - Add `AQUATIC_SAFE_DEPTH: 0.15`
  - Add `STATIONARY_TRAMPLE_DEPOSIT: 0.04`
  - Add `FERTILITY_GRAZE_DEPLETION: 0.005`
  - Adjust `SEED_GERM_BIOMASS: 0.04` (was `0.20`)
- `[MODIFY]` `js/agent.js`:
  - Apply `AQUATIC_EXPOSURE_DRAIN` when `waterDepth > CONFIG.AQUATIC_SAFE_DEPTH`.
  - Deposit `STATIONARY_TRAMPLE_DEPOSIT` in `act()` on non-movement ticks.
  - Deplete soil fertility slightly during `ACTIONS.GRAZE`.
- `[MODIFY]` `js/simulation.js`:
  - Rebalance fitness scoring to remove hyper-inflation of `seedsSown`.

---

## Detailed Specification

### 1. `js/config.js`
```javascript
  // Aquatic Exposure & Moisture Balance
  AQUATIC_SAFE_DEPTH: 0.15,           // Maximum water depth before terrestrial submersion fatigue begins
  AQUATIC_EXPOSURE_DRAIN: 0.35,       // Metabolic drain per tick for standing in deep water
  
  // Soil Compaction & Fallow Dynamics
  STATIONARY_TRAMPLE_DEPOSIT: 0.04,   // Soil compaction accumulated per tick by occupying/grazing a tile
  FERTILITY_GRAZE_DEPLETION: 0.005,   // Trace fertility loss per grazing bite
  
  // Seed Germination Rebalance
  SEED_GERM_BIOMASS: 0.04,            // Initial sprout biomass (requires logistic growth to become profitable)
```

### 2. `js/agent.js`
In `act(action, grid)`:
```javascript
  // 1. Aquatic exposure vs moist microclimate relief
  const currentWater = grid.getWater(this.x, this.y);
  if (currentWater > CONFIG.AQUATIC_SAFE_DEPTH) {
    const submersion = currentWater - CONFIG.AQUATIC_SAFE_DEPTH;
    this.energy -= submersion * CONFIG.AQUATIC_EXPOSURE_DRAIN;
  }

  // 2. Stationary trample compaction on non-movement actions
  if (action !== ACTIONS.MOVE_NORTH &&
      action !== ACTIONS.MOVE_SOUTH &&
      action !== ACTIONS.MOVE_EAST &&
      action !== ACTIONS.MOVE_WEST) {
    grid.addTrample(this.x, this.y, CONFIG.STATIONARY_TRAMPLE_DEPOSIT);
  }
```

In `ACTIONS.GRAZE`:
```javascript
  // Deplete tile fertility slightly with each grazing bite
  const curFert = grid.getFertility(this.x, this.y);
  if (curFert > 0.05) {
    grid.setFertility(this.x, this.y, Math.max(0.05, curFert - CONFIG.FERTILITY_GRAZE_DEPLETION));
  }
```

In `ACTIONS.SOW_SEEDS`:
```javascript
  grid.setBiomass(this.x, this.y, CONFIG.SEED_GERM_BIOMASS); // 0.04
```

### 3. `js/simulation.js`
In `evaluateFitness(agent)` and `getEliteLineages()`:
```javascript
  const fitness = agent.age + 
    (agent.biomassEaten * 25) + 
    (agent.offspringCount * 300) + 
    ((agent.rootsHarvested || 0) * 8) + 
    ((agent.seedsSown || 0) * 1.5);
```

---

## Test Plan

1. **Verify Unit Mechanics**:
   - Sowing a seed deposits `0.04` biomass, which is not immediately profitable to graze.
   - Standing in a tile with `water = 0.50` incurs `(0.50 - 0.15) * 0.35 = 0.1225` extra drain per tick.
   - Standing still for 15 ticks compacts the tile above `0.45`, preventing immediate re-sowing.
2. **Verify Elite Archive**:
   - Confirm elite ranking does not select for pure stationary seed-sowing monocultures.
3. **Verify Dispersal**:
   - Run multi-island simulation and observe agent distribution across shores, meadows, and river valleys rather than deep lake interiors.

---

## Acceptance Criteria
- [x] `SEED_GERM_BIOMASS` reduced from `0.20` to `0.04`, requiring logistic growth before harvest.
- [x] Terrestrial agents standing in `water > 0.15` suffer depth-dependent aquatic fatigue.
- [x] Stationary presence deposits soil trample, naturally capping crowd density and halting camping.
- [x] Grazing slightly depletes soil fertility, enforcing rotational grazing.
- [x] `seedsSown` multiplier in fitness scoring scaled from `10` down to `1.5`.
- [x] Zero syntax errors, passes headless verification.
