# Task 17: Auto-Save System & Categorized Save Tabs

## Status
`DONE`

---

## Goal
Implement a configurable auto-save engine that periodically saves simulation state directly to the `saves/` folder on disk via the REST API, and add a multi-tab Save/Load modal separating manual saves from autosaves.

---

## Context
Long-running simulations in turbo mode can crash or be closed without manual saving.
Users need:
1. Configurable periodic auto-saving with toggle and interval options (e.g. 1m, 2m, 5m, 10m, 15m).
2. All saves must be stored strictly as real `.json` files in the project's `saves/` folder on disk (never in browser `localStorage` or `IndexedDB`).
3. When browsing saves in the Save/Load modal, manual snapshots should appear in the primary tab, while rolling autosaves appear in a separate tab to prevent clutter.

---

## Files to Create / Modify
- `[NEW]` `tasks/TASK_17_autosave_system_and_categorized_save_tabs.md` — Task specification document.
- `[MODIFY]` `tasks/README.md` — Update task roadmap.
- `[MODIFY]` `server.py` — Support `isAutosave` metadata in POST and GET endpoints for `saves/`.
- `[MODIFY]` `js/storage.js` — Support `isAutosave` flag in `StorageManager.saveSimulation` and add batch clear helper.
- `[MODIFY]` `index.html` — Add modal tab bar, auto-save settings controls, and HUD auto-save badge.
- `[MODIFY]` `style.css` — Styling for tabs, badges, auto-save settings, and status indicators.
- `[MODIFY]` `js/main.js` — Auto-save background timer, modal tab switching, and save list filtering.

---

## Detailed Specification

### 1. `server.py`
- In `_handle_save()`:
  - If `data.get('isAutosave')` is `True`, prefix file with `autosave_` if not already present.
  - Save `data['isAutosave'] = bool(data.get('isAutosave', False))`.
- In `_handle_list_saves()`:
  - Return `'isAutosave': data.get('isAutosave', False) or file_path.name.startswith('autosave_')`.

### 2. `js/storage.js`
- `StorageManager.saveSimulation(simulation, customName = '', isAutosave = false)`:
  - Add `isAutosave` property to JSON payload sent to `POST /api/saves`.
- `StorageManager.clearAutosaves()`:
  - Iterate and delete all files tagged with `isAutosave === true`.

### 3. `index.html` & `style.css`
- Modal dialog:
  - Header: Tab bar:
    - `<button id="tab-manual-saves" class="modal-tab active">💾 Manual Saves <span id="badge-manual-count" class="tab-badge">0</span></button>`
    - `<button id="tab-auto-saves" class="modal-tab">⏱️ Auto-Saves <span id="badge-auto-count" class="tab-badge">0</span></button>`
  - Auto-save controls row:
    - Checkbox: `<input type="checkbox" id="autosave-toggle"> Auto-Save`
    - Interval: `<select id="autosave-interval"><option value="1">1 min</option><option value="2" selected>2 min</option><option value="5">5 min</option><option value="10">10 min</option></select>`
    - Next autosave countdown / status readout.
- HUD Header:
  - `<button id="hud-autosave-indicator" class="btn btn-secondary" title="Auto-Save Status">⏱️ Auto: ON (2m)</button>`

### 4. `js/main.js`
- Auto-save loop:
  - Checks if enabled and interval has elapsed:
    `if (this.autoSaveEnabled && Date.now() - this.lastAutoSaveTime >= this.autoSaveIntervalMs)`
  - Saves file as `autosave_tick_${this.simulation.tickCount}_${timestamp}.json` directly to `saves/` via `StorageManager.saveSimulation()`.
- Modal tabs:
  - Tracks `currentSaveTab = 'manual' | 'auto'`.
  - Filters `saves.filter(s => !s.isAutosave)` for manual tab and `saves.filter(s => s.isAutosave)` for autosave tab.
  - "Clear All Auto-Saves" button in the auto-save tab.

---

## Test Plan
1. **Server Headless Test**:
   - Save manual simulation -> verify stored in `saves/` with `isAutosave: false`.
   - Save autosave simulation -> verify stored in `saves/` with `isAutosave: true` and filename `autosave_...`.
   - List saves -> verify `isAutosave` flags are correctly segregated.
2. **Client Auto-Save Test**:
   - Verify periodic save triggers, files are created on disk in `saves/`, and tabs correctly filter saves.
3. **UI Verification**:
   - Load in browser, toggle auto-save on/off, change interval, switch tabs.

---

## Acceptance Criteria
- [x] Auto-save toggle enables/disables periodic saving to disk.
- [x] Auto-save interval is configurable (1m, 2m, 5m, 10m, 15m).
- [x] Zero simulation state is saved in browser storage; all files are saved in `saves/` folder on disk.
- [x] Save/Load modal displays separate tabs for Manual Saves and Auto-Saves.
- [x] Manual Saves tab only lists user-created manual saves.
- [x] Auto-Saves tab only lists automated periodic saves with tick and timestamp.
- [x] Both types of saves can be loaded and deleted seamlessly.
