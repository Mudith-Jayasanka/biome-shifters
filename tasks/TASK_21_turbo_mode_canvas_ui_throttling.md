# Task 21: Turbo Mode Canvas & UI Throttling (4 FPS)

## Status
`DONE`

## Goal
Throttle canvas rendering, UI DOM updates, and worker frame polling to ~4 FPS (250ms interval) while Turbo mode is active, dedicating maximum CPU processing power and worker throughput to simulation physics and neural evaluation.

## Context
In Turbo mode, the 8 island workers run simulation ticks at maximum uncapped throughput (`setTimeout(..., 0)` batching). However, the main thread was previously invoking `requestActiveFrame()` and repainting the full canvas, HUD, inspector cards, and telemetry at 60+ FPS via `requestAnimationFrame`. Serializing 128×128 grid buffers and agent arrays across `postMessage` 60 times per second severely bottlenecked the active island worker and saturated main thread CPU cores. Throttling visual updates to 4 FPS during Turbo mode dramatically cuts IPC overhead and UI thread contention while maintaining real-time visual progress.

## Files to Create/Modify
- `js/config.js` `[MODIFY]` — Add `TURBO_UI_FPS: 4` constant to simulation configuration.
- `js/main.js` `[MODIFY]` — Add `this.lastTurboRenderTime` tracking and throttle `renderLoop(timestamp)` to ~4 FPS when `this.isTurbo` is enabled; reset timestamp on mode/island switch for instant responsiveness.
- `index.html` `[MODIFY]` — Update Turbo mode button tooltip to describe 4 FPS canvas throttling for maximum simulation throughput.

## Detailed Specification

### 1. Configuration (`js/config.js`)
Add the following key to `CONFIG`:
```javascript
  // Performance & Turbo Mode
  TURBO_UI_FPS: 4,           // Canvas & UI refresh rate in Turbo mode to maximize worker compute
```

### 2. Main Render Loop Throttling (`js/main.js`)
In `constructor`:
```javascript
    this.isTurbo = false;
    this.lastTurboRenderTime = 0;
```

In `renderLoop(timestamp)`:
```javascript
  renderLoop(timestamp) {
    if (this.isTurbo) {
      const minInterval = 1000 / (CONFIG.TURBO_UI_FPS || 4);
      if (timestamp - this.lastTurboRenderTime < minInterval) {
        requestAnimationFrame((t) => this.renderLoop(t));
        return;
      }
      this.lastTurboRenderTime = timestamp;
    }

    // 1. Request latest render frame from the active island worker
    this.islandManager.requestActiveFrame(this.selectedAgentId, this.selectedTile);
    const frame = this.islandManager.activeFrame;
...
```

Reset `this.lastTurboRenderTime = 0` whenever user triggers an immediate UI state change (switching speed buttons, pressing `T`, switching active island `1-8`, or clicking to inspect an agent/tile) so there is zero perceptible lag when interacting.

## Test Plan
1. Open the application in browser or run Node syntax validation on `js/config.js` and `js/main.js`.
2. Verify normal modes (1x, 2x, 5x, 10x) render unthrottled at monitor refresh rate (~60 FPS).
3. Switch to Turbo mode (click `⚡ Turbo` or press `T`).
4. Verify that canvas and UI refreshes occur at ~4 FPS (every 250ms), and TPS (ticks per second) increases significantly due to reduced IPC overhead.
5. Verify clicking islands (1-8) or clicking agents/tiles immediately updates without waiting for a delay.
6. Switch back to 1x and verify full 60 FPS rendering resumes immediately.

## Acceptance Criteria
- [x] `CONFIG.TURBO_UI_FPS` is defined and configurable (defaulting to 4).
- [x] In Turbo mode, `requestActiveFrame`, canvas rendering, HUD updates, and inspector updates run at ~4 FPS.
- [x] In non-Turbo modes (1x, 2x, 5x, 10x), canvas rendering and UI updates continue unthrottled at 60 FPS.
- [x] Mode switches, island switches, and inspection clicks remain responsive without lag.
- [x] No regressions or console errors in simulation, worker coordination, or canvas rendering.
