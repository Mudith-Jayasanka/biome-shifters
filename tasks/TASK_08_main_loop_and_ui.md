# TASK_08: Main Loop, Turbo Execution & UI Inspector

- **Status**: `TODO`
- **Goal**: Implement `js/main.js` wiring together the simulation, renderer, heads-up controls, turbo pump, and live agent/tile inspector.
- **Context**: Final Phase 1 task completing the fully playable, inspectable interactive simulation.

---

## Files to Create / Modify

- `[NEW]` `js/main.js`

---

## Detailed Specification

### Key Features:
1. **Decoupled Main Loop**:
   - `requestAnimationFrame` for 60 FPS rendering and UI responsiveness.
   - `MessageChannel` microtask pump for uncapped **Turbo Mode** (>1000 TPS).
2. **Interactive Selection**:
   - Canvas click selects agent or tile by persistent ID / coordinate.
   - Pinned inspection: Selected agent remains tracked across ticks even when other agents die.
3. **Inspector Panel**:
   - Displays real-time vitals: Energy, Age, Generation, Lineage, Current Action.
   - Visualizes live mini-graph of neural network weights and activations.
4. **Save/Load UI Hooks**:
   - Quick save to `server.py` REST endpoint `/api/saves`.
   - Save modal listing historical snapshots.

---

## Test Plan

1. Open `http://localhost:8080`.
2. Verify agents move, eat vegetation, reproduce, and leave trails.
3. Click an agent: verify inspector updates live without flickering.
4. Click Turbo: verify simulation accelerates to hundreds of TPS while UI remains responsive.

---

## Acceptance Criteria

- [ ] Complete simulation loop runs seamlessly in browser.
- [ ] Turbo mode achieves high TPS without freezing browser tab.
- [ ] Persistent entity inspection works reliably across agent deaths.
- [ ] Live HUD metrics reflect current population, biomass, and TPS.
