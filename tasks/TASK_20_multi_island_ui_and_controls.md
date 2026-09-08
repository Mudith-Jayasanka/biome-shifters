# Task 20: 8-Island UI Switcher, Multi-Core Dashboard & HUD Controls

## Status
`DONE`

## Goal
Build the user interface elements for interacting with all 8 islands: an interactive 8-island switcher bar with live telemetry badges, keyboard switching (`1`-`8`), a Multi-Island Overview inspector card, migration trigger and countdown display, and full integration into the main animation loop.

## Context
With 8 islands running in parallel across 8 CPU cores, the user needs an intuitive, high-performance UI to monitor all islands at a glance, switch viewports instantly, track cross-island speciation, and trigger or observe genetic migrations.

## Files to Create/Modify
- `index.html` [MODIFY]: Add Island Selector bar below HUD, migration countdown pill, manual "Migrate Now" button, and Multi-Island Overview card in inspector.
- `style.css` [MODIFY]: Styling for island buttons, active glowing ring, migration pulse banner, and multi-island telemetry table.
- `js/renderer.js` [MODIFY]: Allow rendering from both live `Simulation` instance or worker `frameData` packet.
- `js/main.js` [MODIFY]: Connect `App` to `IslandManager`, bind island switching events and shortcuts `1-8`, wire migration controls, and update inspector cards.

## Detailed Specification

### 1. `index.html`
- Below `#top-hud` or inside header, add `#island-bar`:
  ```html
  <div id="island-bar" class="island-bar">
    <button class="btn-island active" data-island="0">🏝️ Island 1 <span class="island-badge" id="badge-island-0">Gen 1</span></button>
    <button class="btn-island" data-island="1">🏝️ Island 2 <span class="island-badge" id="badge-island-1">Gen 1</span></button>
    ...
    <button class="btn-island" data-island="7">🏝️ Island 8 <span class="island-badge" id="badge-island-7">Gen 1</span></button>
  </div>
  ```
- In `#top-hud`, add migration control pill:
  ```html
  <div class="migration-hud-group">
    <button id="btn-migrate-now" class="btn btn-accent" title="Trigger Cross-Island Genetic Migration Now">🧬 Migrate Now</button>
    <span id="migration-timer-text" class="mono text-xs">Next: 800t</span>
  </div>
  ```
- In `#inspector-sidebar`, add Multi-Island Overview card:
  - Table of all 8 islands with columns: Island, Gen Peak, Pop, TPS, Immigrants.
  - Overall aggregate multi-core TPS: `Combined Multi-Core TPS: 12,450`.

### 2. `style.css`
- Dark glassmorphic styling for `#island-bar`.
- `.btn-island.active`: Emerald/Cyan glowing outline, elevated z-index.
- `.migration-pulse`: Temporary pulsing animation when cross-island migration completes.
- Clean compact layout for the Multi-Island Overview table.

### 3. `js/renderer.js`
- Ensure `render(frameDataOrSimulation, selectedAgentId, selectedTile)` works seamlessly with worker frame packet (which provides `grid.width`, `grid.height`, typed array layers, `agents`, `stats`).

### 4. `js/main.js`
- Instantiate `this.islandManager = new IslandManager()`.
- Bind click events on `.btn-island` to `this.islandManager.setActiveIsland(index)`.
- Keybinds `1` through `8`: switch to Island `0` through `7`.
- Update HUD and Inspector with active island data as well as multi-island summary table.
- Render loop pulls frame data from active island and paints to canvas.

## Test Plan
- Open application in browser.
- Verify 8 island buttons appear in the top bar.
- Verify pressing 1 through 8 or clicking buttons smoothly switches the viewport to each island.
- Verify that each island has its own unique terrain and population evolving independently.
- Click "Migrate Now" and verify the migration event occurs, immigrant count increments, and foreign brains appear on peer islands.
- Verify that the combined multi-core TPS reflects parallel execution across 8 cores.

## Acceptance Criteria
- [ ] 8 island buttons display live individual status (Gen, Pop, TPS).
- [ ] Viewport smoothly switches between all 8 islands with zero lag or frame drop.
- [ ] Keyboard shortcuts `1` through `8` switch islands instantly.
- [ ] Migration button and countdown show cross-island progress.
- [ ] Multi-Island Overview card displays comparative metrics for all 8 islands.
