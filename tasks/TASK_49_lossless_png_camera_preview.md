# Task 49: Lossless PNG Camera Preview

## Status
`DONE`

---

## Goal
Switch the satellite camera preview snapshot encoder from lossy JPEG (`image/jpeg`) to lossless PNG (`image/png`), completely eliminating JPEG DCT ringing and chroma subsampling blur for razor-sharp pixel-perfect grid viewing.

---

## Context
In Task 48, the snapshot resolution was set to the native simulation grid size (128×128). However, lossy JPEG compression causes high-frequency ringing and color bleeding around sharp tile boundaries and single-pixel agent dots when enlarged in the 320×320 camera viewport. Switching to lossless PNG compression eliminates 100% of compression artifacts and preserves crisp pixel borders at minimal bandwidth cost (~12 KB/frame at 0.67 FPS = ~8 KB/s).

---

## Files to Create / Modify
- `[NEW]` `tasks/TASK_49_lossless_png_camera_preview.md` — Task specification document.
- `[MODIFY]` `tasks/README.md` — Register Task 49 in roadmap and catalog.
- `[MODIFY]` `js/config.js` — Add `SNAPSHOT_FORMAT: 'image/png'` to `CONFIG`.
- `[MODIFY]` `js/island-manager.js` — Use `toDataURL(CONFIG.SNAPSHOT_FORMAT || 'image/png')` in `case 'SNAPSHOT_READY'`.

---

## Detailed Specification

### 1. `js/config.js`
In `CONFIG`:
```javascript
  // Satellite Camera Preview Snapshots (Native 1:1 Grid & Lossless PNG)
  SNAPSHOT_WIDTH: 128,          // Native 1:1 simulation grid width
  SNAPSHOT_HEIGHT: 128,         // Native 1:1 simulation grid height
  SNAPSHOT_FORMAT: 'image/png'  // Lossless PNG encoding for razor-sharp pixel rendering
```

### 2. `js/island-manager.js`
In `case 'SNAPSHOT_READY'`:
```javascript
dataUrl = this.snapshotCanvas.toDataURL(CONFIG.SNAPSHOT_FORMAT || 'image/png');
```

---

## Test Plan
1. **Module & Syntax Check**:
   - Verify that all modified files import cleanly and have valid ES6 syntax using `node --input-type=module`.
2. **Data URL Format Check**:
   - Verify `CONFIG.SNAPSHOT_FORMAT` is `'image/png'`.
3. **Data URL Generation Check**:
   - Verify that `toDataURL` returns a `data:image/png;base64,...` header.

---

## Acceptance Criteria
- [x] `CONFIG.SNAPSHOT_FORMAT` set to `'image/png'`.
- [x] `island-manager.js` encodes snapshots using `CONFIG.SNAPSHOT_FORMAT || 'image/png'`.
- [x] No syntax errors or broken imports.
