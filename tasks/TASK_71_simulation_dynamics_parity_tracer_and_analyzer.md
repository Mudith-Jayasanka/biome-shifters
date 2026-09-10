# TASK_71: Simulation Dynamics & Parity Trace Category and Differential Analyzer

- **Status**: DONE
- **Date**: 2026-09-10
- **Goal**: Add a `sim_dynamics` category to `FlightRecorder` to capture granular biological and physical telemetry (action distributions, graze success %, move collisions, metabolic energy balances, starvation vs. senescence mortality, layer totals), and build a comparative analysis tool (`scripts/compare_cpu_gpu.py`) to systematically diagnose CPU vs. GPU simulation divergence.
- **Context**: While the high-level population and biomass curves look similar between CPU and GPU, subtle behavioral divergences (e.g. action preferences, collision penalties, metabolic efficiency) cannot be diagnosed without fine-grained telemetry. This task provides the instrumentation and diffing tools to identify discrepancies quantitatively.
- **Files to Create / Modify**:
  - `[MODIFY]` `js/flight-recorder.js`: Add `sim_dynamics` category, options toggle, and `recordSimDynamics()`.
  - `[MODIFY]` `js/simulation.js`: Aggregate per-interval action histograms, calories in/out, mortality causes, and emit dynamics records.
  - `[MODIFY]` `index.html`, `style.css`: Add "Sim Dynamics" checkbox in Flight Recorder modal.
  - `[NEW]` `scripts/compare_cpu_gpu.py`: Command-line differential analyzer that computes delta statistics between CPU and GPU intervals.
  - `[MODIFY]` `tasks/README.md`: Register TASK_71.

---

## Detailed Specification

### 1. `sim_dynamics` Telemetry Schema
Each dynamics snapshot records:
```javascript
{
  engine: 'cpu' | 'gpu',
  tick: 500,
  population: 340,
  avgEnergy: 142.5,
  maxGen: 12,
  avgGen: 4.8,
  totalBiomass: 4820.0,
  totalWater: 1820.0,
  totalMoisture: 3200.0,
  births: 4,
  deathsStarvation: 2,
  deathsAge: 3,
  caloriesGainedGraze: 42.0,
  caloriesGainedRoots: 12.0,
  caloriesBurnedMetabolism: 68.0,
  caloriesBurnedMovement: 24.0,
  actions: {
    idle: 120,
    move: 180,
    moveCollisions: 14,
    graze: 75,
    grazeFailures: 6,
    digTrench: 12,
    moundEarth: 8,
    emitScent: 15,
    sowSeeds: 10,
    sowFailures: 2
  }
}
```

### 2. `scripts/compare_cpu_gpu.py`
CLI script that:
- Reads a JSON trace exported by `FlightRecorder` containing both CPU and GPU recordings (or two separate trace files).
- Extracts all `sim_dynamics` events grouped by `engine`.
- Computes mean and standard deviations for:
  - Action frequencies (% of total decisions for each of the 10 actions).
  - Move collision rate (`moveCollisions / moveAttempts`).
  - Graze success rate (`(graze - grazeFailures) / grazeAttempts`).
  - Mortality balance (`deathsStarvation / totalDeaths`).
  - Net caloric efficiency (`caloriesGained / caloriesBurned`).
  - Biomass equilibrium and population stability.
- Formats a side-by-side comparative table with percent delta and flags any metric deviating by $> 15\%$.

---

## Test Plan

1. Verify syntax:
   - `node -c js/flight-recorder.js`
   - `node -c js/simulation.js`
   - `python3 -m py_compile scripts/compare_cpu_gpu.py`
2. Test trace capture:
   - Run simulation for 100 ticks on CPU, toggle to GPU for 100 ticks with recorder active.
   - Verify `sim_dynamics` events appear in exported JSON trace.
3. Test analyzer:
   - Run `python3 scripts/compare_cpu_gpu.py trace.json` and verify delta table output.

---

## Acceptance Criteria

- [x] `js/flight-recorder.js` supports `sim_dynamics` category.
- [x] `js/simulation.js` accumulates and emits dynamics snapshots for both CPU and GPU ticks.
- [x] `scripts/compare_cpu_gpu.py` parses traces and produces side-by-side delta comparisons.
- [x] Registered in `tasks/README.md`.
