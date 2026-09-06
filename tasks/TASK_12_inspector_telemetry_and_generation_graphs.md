# TASK_12: Inspector World Telemetry & Generation Statistics Graphs

- **Status**: `DONE`
- **Goal**: Move world telemetry (Tick, TPS, Pop, Biomass, Water) from the top header into the inspector sidebar, and add real-time graphical statistical charts for population/biomass history and generation distribution.
- **Context**: The user requested decluttering the top header and adding comprehensive graphical statistics to clearly understand what is happening across evolutionary generations and carrying capacity over time.

---

## Files to Create / Modify

- `[NEW]` `tasks/TASK_12_inspector_telemetry_and_generation_graphs.md`
- `[MODIFY]` `tasks/README.md`
- `[MODIFY]` `js/simulation.js`
- `[MODIFY]` `index.html`
- `[MODIFY]` `style.css`
- `[MODIFY]` `js/renderer.js`
- `[MODIFY]` `js/main.js`

---

## Detailed Specification

### 1. Telemetry & Generation Analytics in Simulation (`js/simulation.js`)
- Maintain pre-allocated circular ring buffers (length: 120 samples) for:
  - `history.pop` (`Uint16Array(120)`)
  - `history.biomass` (`Float32Array(120)`)
  - `history.maxGen` (`Uint16Array(120)`)
  - `history.avgGen` (`Float32Array(120)`)
  - `history.count` & `history.head`
- Record history samples every 10 simulation ticks in `tick()` with zero GC allocations.
- In `updateStats()`:
  - Calculate `avgEnergy`, `generationMax`, `generationAvg` (weighted average generation of active agents).
  - Calculate `generationHistogram`: map or array of agent counts grouped by generation (e.g. `{ [gen]: count }`).
  - Calculate `elitesCount`: length of `eliteArchive`.

### 2. Header Decluttering & Inspector Cards (`index.html`)
- In `#top-hud`:
  - Remove `.hud-telemetry` container. Keep branding on left, controls (pause, speeds, quick spawn, layer select, save/load/reset) on right.
- In `#inspector-sidebar .sidebar-content`:
  - **New Card 1: World & Ecosystem (`#card-telemetry`)**:
    - Compact 2x3 telemetry grid: Tick, TPS, Population (`pop / max [floor]`), Biomass, Water %, Avg Energy.
    - Mini canvas `#telemetry-canvas` (280x90) with legend for Population (cyan) and Biomass (green) time series.
  - **New Card 2: Evolution & Generations (`#card-evolution`)**:
    - Stat rows: Max Generation, Average Generation, Living Generations Count, Elites Archived.
    - Mini canvas `#generation-canvas` (280x90) displaying live generation distribution bars and evolutionary progress.
  - Keep Population & Capacity, Tile Cell, and Neural Agent cards.

### 3. Canvas Graph Renderers (`js/renderer.js`)
- `Renderer.renderTelemetryGraph(canvas, simulation)`:
  - Zero-allocation canvas drawing of historical Population curve (cyan `#79c0ff`) and Biomass curve (green `#7ee787`) with background gridlines, fill gradients, and live value endpoints.
- `Renderer.renderGenerationGraph(canvas, simulation)`:
  - Draws dynamic bar histogram of active generation distribution with generation labels and percentage fills, plus max generation indicator.

### 4. Styling (`style.css`)
- Style `.telemetry-grid`: compact 2-column key-value grid for Tick, TPS, Pop, Biomass, Water, Energy.
- Style `.graph-wrapper` and canvas sizing (`aspect-ratio: 280 / 90; max-height: 90px`).
- Style `.graph-legend` with color indicators for curves and bars.

### 5. Main Loop Integration (`js/main.js`)
- Update `updateHUD()` to write telemetry to the new inspector elements.
- In `updateInspectorUI()`: invoke `Renderer.renderTelemetryGraph` and `Renderer.renderGenerationGraph` every frame.

---

## Test Plan

1. **Headless Tests**: Run Node.js test to verify that `history` buffers fill properly over hundreds of ticks and `generationAvg` and `generationHistogram` compute without NaN or error.
2. **Visual Verification**:
   - Open `http://localhost:8080`.
   - Verify top header is clean with only branding and control buttons.
   - Verify World & Ecosystem card shows Tick, TPS, Pop, Biomass, Water, Energy, and live scrolling dual-curve graph.
   - Verify Evolution & Generations card shows Max Gen, Avg Gen, and live generation distribution bars.
   - Run in 5x / Turbo speed: observe generation histogram shift rightward as older agents die and newer generations emerge.

---

## Acceptance Criteria

- [x] Top HUD header is decluttered with no inline telemetry strip.
- [x] World Telemetry card in inspector displays all live metrics and a dual-curve history canvas graph.
- [x] Evolution & Generations card displays generation stats and live generation distribution histogram.
- [x] History sampling and graph rendering run with zero per-tick allocations.
- [x] All inspector cards remain collapsible with unclipped scrolling.
