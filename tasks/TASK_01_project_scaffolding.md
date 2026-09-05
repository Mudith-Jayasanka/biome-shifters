# TASK_01: Project Scaffolding & UI Layout

- **Status**: `DONE`
- **Goal**: Build the responsive HTML5/CSS dark-mode application shell, canvas viewport, heads-up display (HUD), toolbar controls, and inspector sidebar.
- **Context**: Foundation task establishing the visual layout and user controls before simulation modules are written.

---

## Files to Create / Modify

- `[NEW]` `index.html`
- `[NEW]` `style.css`

---

## Detailed Specification

### `index.html`:
Must include:
1. Canvas viewport `<canvas id="sim-canvas"></canvas>` filling the main viewport.
2. Top HUD Bar (`#top-hud`):
   - Title: **Biome Shifters**
   - Tick Counter & TPS (Ticks Per Second) display.
   - Population count, Biomass counter, Water coverage %.
   - Play/Pause toggle button (`#btn-pause`).
   - Speed buttons: `1x`, `2x`, `5x`, `10x`, `Turbo` (uncapped).
   - Layer Switcher dropdown (`#layer-select`):
     - `Biome Map` (Default)
     - `Elevation Topography`
     - `Water & Hydrology`
     - `Biomass Vegetation`
     - `Trampled Trails`
     - `Pheromone Scent`
   - Save / Load buttons (`#btn-save`, `#btn-load-list`).
3. Right Inspector Sidebar (`#inspector-sidebar`):
   - Tile Inspector: Coordinates, Elevation, Water, Moisture, Biomass, Compaction, Scent.
   - Agent Inspector: ID, Age, Generation, Energy bar, Facing, State, Neural brain miniature weight graph.
4. Clean modern dark-theme typography and CSS styling (`style.css`).

---

## Test Plan

1. Run `python3 server.py 8080`.
2. Open `http://localhost:8080` in Chrome/Firefox.
3. Verify that the canvas fills the viewport, the top HUD is aligned, buttons are clickable, and the sidebar inspector is cleanly styled.

---

## Acceptance Criteria

- [x] `index.html` loads cleanly with zero console errors.
- [x] CSS dark theme renders with high contrast and responsive layout.
- [x] Canvas responds to window resize events.
- [x] Layer dropdown, speed buttons, and inspector placeholders are in place.
