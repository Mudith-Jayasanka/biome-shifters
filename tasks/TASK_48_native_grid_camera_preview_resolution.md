# Task 48: Native Grid Camera Preview Resolution & Fixed Quality

## Status
`DONE`

---

## Goal
Upgrade the satellite camera preview system across local islands and distributed cluster contributor nodes to use the native simulation grid resolution (128×128) with a standardized, fixed image quality, eliminating downsampling blur while preserving the current 1.5s refresh framerate.

---

## Context
Currently, the satellite camera snapshot generator downsamples the 128×128 world grid into a 64×64 thumbnail image using `toDataURL('image/jpeg', 0.65)`. When displayed inside the 320×320 camera snooper modal, each pixel is blown up 5×, causing noticeable blockiness and losing individual tile details.

The user requested:
1. Use native grid resolution (128×128) so each simulation tile maps 1:1 to a pixel.
2. Use a fixed, consistent quality for all cameras (local and cluster).
3. Do not increase framerate (keep the existing 1.5s polling interval / ~0.67 FPS).

---

## Files to Create / Modify
- `[NEW]` `tasks/TASK_48_native_grid_camera_preview_resolution.md` — Task specification document.
- `[MODIFY]` `tasks/README.md` — Register Task 48 in roadmap and catalog.
- `[MODIFY]` `js/config.js` — Add `SNAPSHOT_WIDTH`, `SNAPSHOT_HEIGHT`, and `SNAPSHOT_QUALITY` constants.
- `[MODIFY]` `js/workers/island.worker.js` — Update `generateSnapshot()` and `REQUEST_SNAPSHOT` message handler to default to native grid dimensions (`CONFIG.SNAPSHOT_WIDTH`, `CONFIG.SNAPSHOT_HEIGHT`).
- `[MODIFY]` `js/island-manager.js` — Import `CONFIG`, default `requestIslandSnapshot()` to native dimensions, and encode snapshots using `CONFIG.SNAPSHOT_QUALITY`.
- `[MODIFY]` `js/cluster-client.js` — Import `CONFIG` and request native grid snapshots during remote dispatch.
- `[MODIFY]` `js/main.js` — Pass `CONFIG.SNAPSHOT_WIDTH` and `CONFIG.SNAPSHOT_HEIGHT` to `requestIslandSnapshot()`.

---

## Detailed Specification

### 1. `js/config.js`
Add configuration constants to `CONFIG`:
```javascript
// Satellite Camera Preview Snapshots
SNAPSHOT_WIDTH: 128,          // Native 1:1 simulation grid width
SNAPSHOT_HEIGHT: 128,         // Native 1:1 simulation grid height
SNAPSHOT_QUALITY: 0.75,       // Fixed quality factor for JPEG encoding (0.0 to 1.0)
```

### 2. `js/workers/island.worker.js`
- Set `generateSnapshot(targetWidth = CONFIG.SNAPSHOT_WIDTH || 128, targetHeight = CONFIG.SNAPSHOT_HEIGHT || 128)`.
- When `targetWidth === gridW` and `targetHeight === gridH` (128×128), `scaleX` and `scaleY` are 1.0, giving exact 1:1 tile mapping and accurate agent positions.
- In `case 'REQUEST_SNAPSHOT'`:
  `generateSnapshot(msg.width || CONFIG.SNAPSHOT_WIDTH || 128, msg.height || CONFIG.SNAPSHOT_HEIGHT || 128);`

### 3. `js/island-manager.js`
- Import `{ CONFIG } from './config.js';`
- Update `requestIslandSnapshot(islandId, width = CONFIG.SNAPSHOT_WIDTH || 128, height = CONFIG.SNAPSHOT_HEIGHT || 128, timeoutMs = 2500)`
- In `case 'SNAPSHOT_READY'`:
  - Canvas width and height use `w = msg.width || CONFIG.SNAPSHOT_WIDTH || 128;` and `h = msg.height || CONFIG.SNAPSHOT_HEIGHT || 128;`
  - Compress canvas to data URL using fixed quality: `dataUrl = this.snapshotCanvas.toDataURL('image/jpeg', CONFIG.SNAPSHOT_QUALITY || 0.75);`

### 4. `js/cluster-client.js`
- Import `{ CONFIG } from './config.js';`
- In `dispatchRequestedSnapshot(islandId)`:
  - Call `this.islandManager.requestIslandSnapshot(islandId, CONFIG.SNAPSHOT_WIDTH || 128, CONFIG.SNAPSHOT_HEIGHT || 128);`

### 5. `js/main.js`
- In `refreshIslandCamFeed(forceLoading = false)`:
  - Call `this.islandManager.requestIslandSnapshot(islandId, CONFIG.SNAPSHOT_WIDTH || 128, CONFIG.SNAPSHOT_HEIGHT || 128);`

---

## Test Plan
1. **Module & Syntax Check**:
   - Verify that all modified files import cleanly and have valid ES6 syntax using `node --check`.
2. **Snapshot Resolution & Output Dimensions**:
   - Verify `CONFIG.SNAPSHOT_WIDTH` and `CONFIG.SNAPSHOT_HEIGHT` equal 128.
   - Verify `generateSnapshot()` creates a buffer of `128 * 128 * 4 = 65536` bytes.
3. **Fixed Quality & Data URL Generation**:
   - Confirm JPEG quality parameter is consistently driven by `CONFIG.SNAPSHOT_QUALITY` (0.75).
4. **Framerate Stability**:
   - Confirm the polling interval in `main.js` remains 1500ms (1.5s).

---

## Acceptance Criteria
- [x] `CONFIG` defines `SNAPSHOT_WIDTH: 128`, `SNAPSHOT_HEIGHT: 128`, and `SNAPSHOT_QUALITY: 0.75`.
- [x] Island worker generates 128×128 native grid snapshots by default.
- [x] IslandManager encodes snapshot canvas at 128×128 with fixed 0.75 quality.
- [x] Main controller and cluster client request native 128×128 snapshots.
- [x] Framerate is preserved at 1 frame per 1.5s (~0.67 FPS).
