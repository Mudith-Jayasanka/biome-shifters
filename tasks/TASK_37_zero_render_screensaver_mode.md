# Task 37: Zero-Render Contributor Screen Saver Mode

## Status: `DONE`

## Goal
Implement a zero-render "Screen Saver" mode for contributor nodes when hidden by Host, completely bypassing Canvas rasterization, world rendering, and DOM updates to save 100% of GPU/render processing power while displaying a locked, aesthetic animated telemetry screen saver.

## Context
Running visual canvas rendering and agent/biome blitting on contributor laptops consumes substantial GPU/CPU resources. When the Host clicks "Hide Visuals", the contributor's rendering engine should be completely muted, freeing all CPU cycles for background Web Worker simulation while displaying a captivating, non-interactive cybernetic activity screen saver.

## Files to Create/Modify
- `[MODIFY]` `index.html` — Add `#worker-screensaver-overlay` HTML structure (status indicator, animated radar/waveform canvas, live telemetry grid, continuous loading bar, lock notice).
- `[MODIFY]` `style.css` — Styling for the cybernetic screen saver overlay, animations, progress bar shimmer, and lock overlay.
- `[MODIFY]` `js/cluster-client.js` — Process `nodeState.isHidden` in heartbeat response and emit `'visibility_change'`.
- `[MODIFY]` `js/main.js` — Implement `isVisualsHidden` flag, throttle render loop (bypassing `drawWorld()`, blitting, inspector DOM), animate the screen saver canvas, and update live telemetry in the screen saver.

## Detailed Specification

### 1. Screen Saver Overlay (`index.html` & `style.css`)
- Fullscreen fixed overlay (`z-index: 10000`) with dark gradient backdrop (`radial-gradient(...)`).
- Cybernetic HUD card:
  - Header: Pulsing emerald dot + `🟢 BACKGROUND WORKER ACTIVE` + `⚡ ZERO-RENDER MODE`.
  - Activity radar canvas: animated waveform / pulse scanline.
  - Telemetry grid: Assigned Islands, Processing TPS, Active Population, Hardware Profile (`100% CPU Dedicated`).
  - Animated progress bar: Continuous flowing gradient sweep showing active generations.
  - Notice: `🔒 Visual canvas rendering suspended by Host Admin to dedicate 100% compute cycles to island simulations. Awaiting Host Unhide signal...`

### 2. Zero-Render Throttling (`js/main.js`)
- In `renderLoop(timestamp)`:
  - If `this.isVisualsHidden`:
    - Do NOT call `this.islandManager.requestActiveFrame()`.
    - Do NOT call `this.renderer.render()`.
    - Do NOT update HUD stats or inspector charts.
    - Animate screen saver radar at ~25 FPS consuming <0.5% CPU.
    - Update screen saver text metrics from `this.islandManager` telemetry.
  - If `!this.isVisualsHidden`:
    - Normal full-frame visual simulation rendering.

### 3. State Synchronization
- In `cluster-client.js`:
  - When `nodeState.isHidden` differs from `this.isHidden`:
    - `this.isHidden = Boolean(nodeState.isHidden)`.
    - `this.emit('visibility_change', this.isHidden)`.
- In `main.js`:
  - `this.clusterClient.on('visibility_change', (hidden) => this.setVisualsHidden(hidden))`.

## Test Plan
1. **Headless Verification**: Verify `isVisualsHidden` flag correctly bypasses `drawWorld()` in headless test runner.
2. **Browser Verification**:
   - Host toggles "Hide Visuals" for contributor.
   - Contributor viewport instantly transitions to the cybernetic screen saver.
   - Verify browser dev tools show zero canvas draw calls.
   - Verify simulation workers continue ticking and reporting high TPS.
   - Host clicks "Unhide Sim" -> contributor immediately returns to full visual simulation.

## Acceptance Criteria
- [x] Screen saver displays with live telemetry (islands, TPS, population) and animated progress bar.
- [x] Contributor canvas rendering is 100% bypassed when hidden, saving GPU/CPU overhead.
- [x] Background island worker threads continue running at full speed.
- [x] Contributor cannot interact with simulation controls while hidden.
- [x] Unhide smoothly restores standard visual rendering.
