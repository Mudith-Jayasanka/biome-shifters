# TASK_10: Population Scaling, Higher Capacity & Interactive Population Controls

- **Status**: `DONE`
- **Goal**: Raise the simulation population capacity from 300 to 800+, elevate initial population to 200 and extinction floor from 20 to 100, and provide interactive HUD controls for dynamic population tuning and batch spawning.
- **Context**: Novice agents in early generations starved rapidly down to the extinction floor of 20, causing the world to remain severely under-populated (20 agents across 16,384 tiles). Increasing capacity, initial size, and floor allows hundreds of agents to explore the environment in parallel.

---

## Files to Create / Modify

- `[NEW]` `tasks/TASK_10_population_scaling_and_capacity.md`
- `[MODIFY]` `tasks/README.md`
- `[MODIFY]` `js/config.js`
- `[MODIFY]` `js/simulation.js`
- `[MODIFY]` `index.html`
- `[MODIFY]` `style.css`
- `[MODIFY]` `js/main.js`

---

## Detailed Specification

### 1. Configuration (`js/config.js`)
- Add `MAX_POPULATION: 800` to `CONFIG`.
- Update `INITIAL_POPULATION: 200` (up from 80).
- Update `MIN_POPULATION_FLOOR: 100` (up from 20).

### 2. Simulation Core (`js/simulation.js`)
- Add instance fields:
  - `this.maxPopulation = CONFIG.MAX_POPULATION;`
  - `this.minPopulationFloor = CONFIG.MIN_POPULATION_FLOOR;`
- Methods:
  - `setMaxPopulation(val)`: sets ceiling (clamped to e.g. min 50, max 2000).
  - `setMinPopulationFloor(val)`: sets floor (clamped to min 10, max `maxPopulation`).
  - `spawnBatch(count)`: spawns `count` new agents across valid fertile ground, pulling from elites if available or random brains if not.
- In `tick()`:
  - Replace hardcoded `< 300` check with `this.agents.length + newChildren.length < this.maxPopulation`.
  - In extinction safety floor check, check `this.agents.length < this.minPopulationFloor` and pass `this.minPopulationFloor` to `reseedFromElites()`.
- Telemetry:
  - In `stats`, include `maxPopulation: this.maxPopulation`, `minPopulationFloor: this.minPopulationFloor`.

### 3. UI & HUD Controls (`index.html`, `style.css`, `js/main.js`)
- Add a new control cluster in `#top-hud` (or inside the sidebar) for Population Management:
  - Dynamic display: `Pop: <span id="stat-pop">0</span> / <span id="stat-pop-max">800</span>` (floor indicator in hover/tooltip).
  - Quick buttons: `+50` / `+100` Spawn buttons to instantly inject parallel exploring agents.
  - Interactive modal or sidebar sliders for `Pop Floor` (20 - 400) and `Pop Cap` (100 - 1500).
- Wire listeners in `js/main.js` to update `sim.setMinPopulationFloor()` and `sim.setMaxPopulation()`, and trigger `sim.spawnBatch()`.

---

## Test Plan

1. **Headless Ticking Test**: Run Node.js test simulating 1000 ticks with 500 agents: verify that population floor is respected, reproduction adheres to cap, and no unhandled exceptions or NaN values occur.
2. **Browser Verification**:
   - Load `http://localhost:8080`.
   - Verify initial world loads with 200 agents.
   - Verify the HUD displays `Pop: X / 800`.
   - Click `+100`: verify population immediately increases by 100 with agents placed on valid terrain.
   - Run in 5x / Turbo speed: verify population stays above the 100 floor and fluctuates up to cap without FPS degradation.
   - Adjust slider/settings to test custom floor and cap values.

---

## Acceptance Criteria

- [x] `CONFIG.MAX_POPULATION` is 800, `CONFIG.INITIAL_POPULATION` is 200, and `CONFIG.MIN_POPULATION_FLOOR` is 100.
- [x] Simulation dynamically enforces `maxPopulation` and `minPopulationFloor` without hardcoded magic numbers.
- [x] `spawnBatch(count)` places healthy agents onto valid cells with elite lineage or new brains.
- [x] HUD displays current population vs cap and offers quick-spawn and capacity adjustment controls.
- [x] Zero regressions to canvas rendering, agent inspection, or simulation performance.
