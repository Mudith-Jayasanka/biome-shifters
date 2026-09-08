# Task 26: Save Menu Layout Widening & Loading Spinner Overlay

## Status: `DONE`

## Goal
Widen the Save/Load modal dialog to prevent button wrapping and provide an animated full-screen loading spinner overlay with simulation pause during save file restoration.

## Context
1. With populated save metadata (tick, population, and timestamps), the 480px modal dialog became cramped, causing the Delete button to wrap below the Load button.
2. Loading a 50+ MB multi-island save takes 2–4 seconds of background network fetching and 8-thread Web Worker deserialization. Previously, there was no visual feedback during this delay, and the simulation continued running. Adding an overlay with a spinning wheel and pausing the world clearly communicates progress to the user.

## Files to Create/Modify
- `[MODIFY]` `style.css` — Widen `.modal-dialog` to 660px, style `.save-actions` and `.save-info` with explicit non-wrapping flex rules, and add styles for `.loading-overlay` and `.spinner-ring`.
- `[MODIFY]` `index.html` — Add `#loading-overlay` markup.
- `[MODIFY]` `js/main.js` — Implement `setSimulationPaused()`, `showLoadingOverlay()`, `hideLoadingOverlay()`, and update the load button handler.
- `[MODIFY]` `tasks/README.md` — Register TASK_26 in roadmap.

## Detailed Specification

### 1. Save Menu Widening & Styling (`style.css`)
- `.modal-dialog`: width `660px` (max-width `94vw`).
- `.save-item`: flexbox, space-between, gap `12px`, padding `10px 14px`.
- `.save-info`: flex 1, min-width 0.
- `.save-name-row`: flex items center, gap `8px`, min-width 0.
- `.save-item-name`: text-overflow ellipsis, overflow hidden, white-space nowrap.
- `.save-actions`: `display: flex; align-items: center; gap: 8px; flex-shrink: 0; margin-left: 12px;`.
- `.save-actions button`: `white-space: nowrap; margin-left: 0;`.
- `.loading-overlay`: fixed position, 100vw/100vh, background `rgba(6, 10, 16, 0.78)`, backdrop blur, z-index `2000`.
- `.spinner-ring`: 48px ring with smooth 360-degree rotation animation.

### 2. Overlay Markup (`index.html`)
- Insert `#loading-overlay` with title, spinner ring, status text, and subtext inside the app wrapper.

### 3. Application Logic (`js/main.js`)
- `setSimulationPaused(paused)`: updates `this.isPaused`, UI button state, and `this.islandManager.setPause()`.
- `showLoadingOverlay(title, statusText)`: removes `.hidden`, sets text.
- `hideLoadingOverlay()`: adds `.hidden`.
- `btn-action-load` handler:
  1. Pause simulation.
  2. Close save modal.
  3. Show loading overlay with save name.
  4. Fetch save payload via `StorageManager.loadSave()`.
  5. Deserializes across island workers.
  6. Hide loading overlay.
  7. Restore simulation pause state.

## Test Plan
1. Check CSS and HTML syntax.
2. Check JS syntax with `node -c js/main.js`.
3. Verify modal width is 660px and Load + Delete buttons are aligned horizontally on one row.
4. Verify clicking Load triggers simulation pause, closes modal, displays the spinner overlay with blur, loads the data, and dismisses the overlay upon completion.

## Acceptance Criteria
- [x] Save/Load modal is wider (660px) and buttons fit side-by-side with no wrapping.
- [x] Full-screen spinner overlay appears when a save is being loaded.
- [x] Overlay has low-opacity backdrop with blur and centered spinning ring animation.
- [x] Simulation is paused while the save is loading.
- [x] Overlay automatically hides once deserialization is complete.
- [x] Error handling gracefully hides the overlay and alerts if loading fails.
