# Task 24: Ecological Stepping Stones for Irrigation & Farming

## Status
`DONE`

## Goal
Implement biologically grounded ecological mechanisms (soil moisture microclimate thermal relief, subterranean root foraging rebate, and scent momentum stabilization) so neural agents can organically discover and sustain irrigation trenching and agricultural terraforming without artificial cheats.

## Context
Analysis of 800k+ tick simulations revealed that neural networks actively evolved negative biases against `DIG_TRENCH` (-0.297) and `MOUND_EARTH` (-0.415) due to the high upfront energy penalty (3.5 energy) and delayed agricultural payoff (~100-tick delay). By introducing immediate physical utility (metabolic thermal relief in moist soil and root excavation in fertile soil), digging becomes economically viable for natural selection to favor.

## Files to Create/Modify
- `[MODIFY]` `js/config.js`
- `[MODIFY]` `js/agent.js`
- `[MODIFY]` `tasks/README.md`

## Detailed Specification
- **`js/config.js`**:
  - Add `MOISTURE_METABOLIC_RELIEF: 0.35` (max 35% reduction in basal drain on moist soil).
  - Add `ROOT_HARVEST_MAX: 1.6` (maximum energy recovered from unearthing roots in fertile virgin soil).
  - Add `SCENT_COST: 0.08` (adjusted down from 0.15 to encourage territory marking).
- **`js/agent.js`**:
  - In `act(action, grid)`:
    - Query `grid.getMoisture(this.x, this.y)`.
    - Apply microclimate metabolic relief: `effectiveDrain = CONFIG.BASAL_METABOLIC_DRAIN * (1.0 - Math.min(CONFIG.MOISTURE_METABOLIC_RELIEF, moisture * CONFIG.MOISTURE_METABOLIC_RELIEF))`.
    - Deduct `effectiveDrain` instead of flat `BASAL_METABOLIC_DRAIN`.
  - In `ACTIONS.DIG_TRENCH`:
    - Query `grid.getFertility(this.x, this.y)` and `grid.getTrample(this.x, this.y)`.
    - If fertility > 0.25, calculate root yield: `rootYield = fertility * CONFIG.ROOT_HARVEST_MAX * Math.max(0.2, 1.0 - trample)`.
    - Add `rootYield` to agent energy (capped at `MAX_ENERGY`) and log to `biomassEaten` (`rootYield / CONFIG.GRAZE_MAX_INTAKE`).
  - In `ACTIONS.EMIT_SCENT`:
    - Deduct `CONFIG.SCENT_COST` instead of hardcoded 0.15.
  - In movement terrain resistance:
    - When moving across cells with high scent (`grid.getScent > 0.3`), apply a 10% familiar territory momentum discount.

## Test Plan
- Run headless Node.js test script verifying:
  1. Basal drain on dry tile (0.05 moisture) vs moist tile (0.8 moisture).
  2. `DIG_TRENCH` on fertile tile yields root energy rebate and increments `biomassEaten`.
  3. `DIG_TRENCH` on barren/dry tile yields no root rebate (strict net negative).
  4. Ensure all energy and biomass values remain finite and strictly in bounds.
- Run `node -e "import('./js/agent.js')"` to verify ES6 module import syntax without errors.
- Run simulation in browser via `python3 server.py` and inspect agents.

## Acceptance Criteria
- [ ] `MOISTURE_METABOLIC_RELIEF`, `ROOT_HARVEST_MAX`, and `SCENT_COST` added to `js/config.js`.
- [ ] Microclimate thermal relief reduces basal drain up to 35% in moist soils.
- [ ] Subterranean root excavation provides partial rebate on fertile ground when trenching.
- [ ] Scent marking cost lowered and territory momentum bonus active.
- [ ] Headless tests pass completely with zero NaN or crashes.
- [ ] Registered in `tasks/README.md`.
