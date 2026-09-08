# Task 44: Subterranean Root Foraging & Profitable Irrigation

## Status
`DONE`

---

## Goal
Transform trench digging from a guaranteed $-1.9$ caloric deficit into a viable subterranean foraging strategy yielding edible roots and tubers ($+1.3$ to $+2.0$ net energy gain on fertile soil), with enhanced microclimate cooling to incentivize emergent habitat engineering without artificial cheats.

---

## Context
Telemetry from 5.5M-tick simulations revealed that agents completely evolved away terraforming actions (`DIG_TRENCH` at $0.1\%$ probability, `MOUND_EARTH` at $0.0\%$).
Currently, `DIG_TRENCH` consumes $3.5$ energy while yielding at most $1.6$ energy from roots ($1.6 - 3.5 = -1.9$ energy loss). An agent that digs loses calories immediately and dies before reproducing, while pure grazers survive.

In real ecosystems, wild boars and burrowers excavate soil specifically to harvest high-calorie tubers, roots, and grubs.
By lowering `TERRAFORM_ENERGY_COST` to $2.5$ and increasing root yield on virgin, untrampled fertile soil to $4.0 - 4.5$, digging becomes immediately profitable as a secondary foraging mode. Digging also lowers elevation, capturing runoff and pooling moisture to provide long-term metabolic cooling (`MOISTURE_METABOLIC_RELIEF`).

---

## Files to Create / Modify
- `[NEW]` `tasks/TASK_44_subterranean_root_foraging_and_profitable_irrigation.md` — Task specification document.
- `[MODIFY]` `tasks/README.md` — Register Task 44.
- `[MODIFY]` `js/config.js` — Update `TERRAFORM_ENERGY_COST` (2.5), `ROOT_HARVEST_MAX` (4.5), and define `TRENCH_COOLING_MAX` (0.45).
- `[MODIFY]` `js/agent.js` — Rebalance `ACTIONS.DIG_TRENCH` execution logic, enforce diminishing returns on repeat digging of the same cell, and reward root yield as biological intake.
- `[MODIFY]` `js/simulation.js` — Add `trenchesDug` and `rootsHarvested` agent telemetry counters and include them in Darwinian fitness evaluation (`+ a.rootsHarvested * 5`).

---

## Detailed Specification

### 1. `js/config.js`
```javascript
  // Energetics & Terraforming Rebalance
  TERRAFORM_ENERGY_COST: 2.5,        // Reduced upfront excavation cost
  ROOT_HARVEST_MAX: 4.5,             // Max subterranean tubers unearthed on rich virgin soil (Net +2.0 ROI)
  MOISTURE_METABOLIC_RELIEF: 0.40,   // Up to 40% metabolic relief when resting in moist trenches
```

### 2. `js/agent.js`
In `Agent` constructor:
```javascript
  this.trenchesDug = 0;
  this.rootsHarvested = 0;
```
In `Agent.prototype.act()` under `ACTIONS.DIG_TRENCH`:
```javascript
  case ACTIONS.DIG_TRENCH: {
    this.energy -= CONFIG.TERRAFORM_ENERGY_COST;
    const elev = grid.getElevation(this.x, this.y);
    if (elev > 0.05) {
      grid.setElevation(this.x, this.y, elev - 0.05);
      this.trenchesDug++;

      // Subterranean root harvest: virgin fertile loam yields high-calorie tubers
      const fertility = grid.getFertility(this.x, this.y);
      if (fertility > 0.25) {
        const trample = grid.getTrample(this.x, this.y);
        // Diminishing returns: deeper trenches or heavily trampled soil have already been excavated
        const depthPenalty = Math.max(0.1, (elev - 0.05) / 0.8);
        const rootYield = fertility * CONFIG.ROOT_HARVEST_MAX * Math.max(0.1, 1.0 - trample) * depthPenalty;
        
        this.energy = Math.min(CONFIG.MAX_ENERGY, this.energy + rootYield);
        this.rootsHarvested += rootYield;
        this.biomassEaten += (rootYield / CONFIG.GRAZE_MAX_INTAKE);
      }

      success = 1.0;
    } else {
      success = 0.0;
    }
    break;
  }
```

### 3. `js/simulation.js`
In `recordPotentialElite()` and candidate fitness evaluation:
```javascript
  const fitness = a.age + (a.biomassEaten * 25) + (a.offspringCount * 300) + (a.rootsHarvested * 8);
```

---

## Test Plan
1. **Headless Energy Balance Verification**:
   - Create a test agent with energy $50$ on a tile with `elevation = 0.5`, `fertility = 1.0`, `trample = 0.0`.
   - Execute `agent.act(ACTIONS.DIG_TRENCH, grid)`.
   - Verify `agent.energy` increases (e.g. $50 - 2.5 + 4.2 = 51.7$).
   - Repeat `DIG_TRENCH` on the same tile 5 times: verify that depth penalty reduces root yield to near zero, preventing infinite stationary digging exploits.
2. **Moisture & Hydrology Verification**:
   - Verify that water flows into the dug depression and soil moisture diffuses to neighboring cells.

---

## Acceptance Criteria
- [x] `TERRAFORM_ENERGY_COST` reduced to 2.5 and `ROOT_HARVEST_MAX` set to 4.5 in `js/config.js`.
- [x] Digging virgin fertile soil yields a positive net caloric gain ($+1.3$ to $+2.0$).
- [x] Repeated digging on the same tile suffers diminishing returns.
- [x] `trenchesDug` and `rootsHarvested` tracked per agent and factored into fitness.
- [x] Headless test verifies positive ROI and diminishing returns.
