# Task 30: Client Join Dialog, Host Detection & Contributor Feature Gating

## Status: `DONE`

## Goal
Implement client role detection (Host on localhost vs Contributor on LAN), a Join Modal for LAN guests to configure their device name and dedicated CPU cores, and UI feature gating that disables administrative controls for guests while rendering their locally simulated islands.

## Context
When friends connect to the simulation over WiFi via the host's LAN IP, they act as worker contributors rather than session administrators. To maintain global synchronization and prevent accidental world resets, guest clients must configure their dedicated CPU cores upon arrival, after which administrative buttons (play/pause, speed, save/load, reset, ecosystem sliders) are disabled/hidden. Contributor clients see an island switcher bar showing only their assigned islands, which they simulate and render locally with full tile and agent inspection capabilities.

## Files to Create/Modify
- `[MODIFY]` `index.html` — Add `#cluster-join-modal` (client name input, CPU core selector, join button), contributor connection HUD badge, and role badges.
- `[MODIFY]` `style.css` — Style the Join Modal, disabled HUD control states, contributor badges, and dynamic island switcher.
- `[MODIFY]` `js/main.js` — Detect host vs client mode (`localhost` check or `/api/cluster/status`). For guests, show Join Modal, spawn `IslandManager` with allocated `islandIds`, populate island bar with assigned islands, and gate administrative controls.
- `[MODIFY]` `tasks/README.md` — Register TASK_30 in task catalog and dependency graph.

## Detailed Specification

### 1. Host vs Contributor Detection
In `js/main.js`:
```js
const isLocalhost = window.location.hostname === 'localhost' || 
                    window.location.hostname === '127.0.0.1' || 
                    window.location.hostname === '[::1]';
```
- If `isLocalhost` is `true`:
  - Node operates as `Host / Admin`.
  - Instantiates default 8 workers (Islands 0..7).
  - All HUD controls, save/load, reset, speed buttons, and sliders are fully enabled.
  - Displays HUD badge: `👑 Host Admin • 8 Cores`.
- If `isLocalhost` is `false`:
  - Node operates as `Contributor Client`.
  - Pauses execution of main rendering loop until Join Modal is submitted.
  - Displays `#cluster-join-modal`.

### 2. Contributor Join Modal (`#cluster-join-modal`)
Dialog in `index.html`:
- Title: **"Join Distributed Island Cluster"**
- Subtitle: *"Contribute your CPU cores to simulate parallel islands on this network."*
- Fields:
  - **Node Display Name**: Text input (e.g. "Alex's Laptop"), defaults to random tag (e.g. `Node-4821`).
  - **Dedicated CPU Cores**: Segmented selector or buttons: `[1 Core]`, `[2 Cores]`, `[4 Cores]`, `[8 Cores]`.
    - Auto-selects `Math.max(1, Math.min(8, Math.floor((navigator.hardwareConcurrency || 4) / 2)))`.
  - **Cluster Status Preview**: Displays host IP and current cluster status fetched from `/api/cluster/status`.
  - **Action Button**: `[ 🚀 Join & Start Simulating ]`.

### 3. Contributor Feature Gating & Dynamic Island Bar
When a guest joins:
- Calls `clusterClient.join(name, selectedCores)` $\to$ returns allocated `islandIds` (e.g. `[8, 9, 10, 11]`).
- Instantiates `IslandManager({ islandIds })`.
- Updates the Top Island Bar (`#island-bar`):
  - Clears hardcoded Islands 1–8 buttons.
  - Dynamically creates buttons only for the assigned islands (e.g., "Island 9", "Island 10", "Island 11", "Island 12").
  - Binds click and number keys 1–N to switch between assigned islands.
- Disables / hides administrative controls:
  - `#btn-pause`, `.speed-group`, `#btn-reset`, `#btn-save`, `#btn-load-list`, `#btn-autosave-hud`, `#slider-pop-cap`, `#slider-pop-floor`, `#btn-spawn-50`, `#btn-spawn-100`, `#btn-quick-spawn`, `#btn-migrate-now`.
  - Adds disabled visual styling (`opacity: 0.4; pointer-events: none; cursor: not-allowed;`).
- Updates HUD status:
  - Displays `💻 Contributor: [Node Name] • [X] Cores • 🟢 Synced`.
- Keeps fully active:
  - Layer dropdown (Biomes, Elevation, Water, Biomass, Trails, Scent).
  - Canvas pan, zoom, click-to-inspect tile and agent.
  - Complete Inspector Sidebar (Tile Cell, Neural Agent, RNN brain graph, live telemetry graphs).

## Test Plan
1. **Host Verification**: Load `http://localhost:8080`. Verify full admin UI is displayed, all buttons are interactive, and no join modal appears.
2. **Guest Verification**: Open `http://<LAN_IP>:8080` (or `http://127.0.0.1:8080` alias simulated as non-localhost). Verify Join Modal appears immediately.
3. **Core Selection & Join**: Enter a test name, select 2 cores, click Join. Verify:
   - Island bar populates with exactly 2 buttons corresponding to assigned island IDs (e.g. Island 9, Island 10).
   - Canvas renders the assigned island at 60 FPS.
   - Play/Pause, speed, save, load, and reset buttons are visibly disabled/locked.
   - Clicking tiles and agents on the assigned island opens inspector details and displays brain activity.

## Acceptance Criteria
- [x] Localhost access immediately loads full administrative interface without join modal.
- [x] LAN IP access prompts user with Join Modal requesting display name and core allocation.
- [x] Assigned island IDs dynamically populate the island navigation bar for the contributor.
- [x] Contributor nodes cannot pause, change speed, save, load, or reset the simulation.
- [x] Contributor nodes retain full local canvas rendering, pan/zoom, layer switching, and inspection tools.

