# TASK_09: UI & CSS Fixes (HUD Overflows, Inspector Unhide & Neural Net Cropping)

- **Status**: `DONE`
- **Goal**: Resolve HUD UI elements overflowing off-screen on compact displays, add persistent unhide functionality when the inspector sidebar is collapsed, and eliminate clipping/cropping of the neural network visualization.
- **Context**: Polish phase resolving critical layout and inspector usability bugs reported during interactive testing.

---

## Files to Create / Modify

- `[MODIFY]` `style.css`
- `[MODIFY]` `index.html`
- `[MODIFY]` `js/main.js`

---

## Detailed Specification

### 1. Top HUD Responsiveness & Overflow Prevention
- Make `#top-hud` responsive with flexible gaps, compact padding, and horizontal scroll fallback (`overflow-x: auto; overflow-y: hidden`) with sleek scrollbar styling so no control buttons are ever pushed off-screen.
- Adjust `#main-container` to `flex: 1; min-height: 0;` (instead of fixed `calc(100vh - 58px)`) to prevent vertical container overflow when HUD adapts.
- Add responsive media queries (`@media (max-width: 1200px)` and `@media (max-width: 900px)`) to compact telemetry items and button padding smoothly.

### 2. Inspector Sidebar Collapse & Unhide
- Add a floating toggle tab `#btn-unhide-sidebar` (`.sidebar-unhide-btn`) pinned to the top-right corner of the canvas viewport, visible only when the sidebar is collapsed.
- Update sidebar header close button icon to `▶` with title "Hide Inspector (I)".
- Update `js/main.js` to manage both `#btn-toggle-sidebar` and `#btn-unhide-sidebar`, and bind the `I` key shortcut for quick inspector toggling.

### 3. Neural Net Inspector Visibility & Aspect Ratio
- Fix `.sidebar-content` with `min-height: 0;` and ample bottom padding (`padding: 14px 14px 28px 14px`) to prevent scroll truncation at the bottom of the card.
- Add `.agent-details { display: flex; flex-direction: column; gap: 8px; }` to maintain vertical spacing.
- Fix `#brain-canvas` styling with `width: 100%; height: auto; aspect-ratio: 280 / 140; max-height: 140px;` inside `.canvas-wrapper` to prevent vertical compression, clipping, or distortion.
- Align `.brain-legend` padding to match input, hidden, and output node columns.
- Adjust `--sidebar-width` to `340px` for optimal canvas and stat layout.

---

## Test Plan

1. **HUD Viewport Test**: Resize browser window to 1024px, 1200px, and 1440px widths. Verify all HUD controls (Pause, Speeds, Layer dropdown, Save, Load, Reset) remain accessible and properly formatted without overflowing off-screen.
2. **Sidebar Collapse & Unhide Test**:
   - Click `▶` in the inspector header: sidebar slides off-screen, and `◀ Inspector` floating button appears on the canvas.
   - Click `◀ Inspector`: sidebar slides back into view and the floating button hides.
   - Press `I` on the keyboard: verify sidebar toggles smoothly.
3. **Neural Net Inspection Test**:
   - Click on an agent in the canvas to pin inspection.
   - Verify agent details, energy gauge, neural network mini-graph, and legend render fully without any vertical or horizontal cropping.
   - Scroll sidebar to verify the neural net section has comfortable breathing room at the bottom.

---

## Acceptance Criteria

- [x] Header controls, telemetry, and action buttons fit cleanly on standard screen sizes and scroll cleanly if viewport is narrow.
- [x] Collapsed inspector provides an intuitive unhide button (`◀ Inspector`) and keyboard shortcut (`I`).
- [x] Inspector neural net canvas and legend render completely without distortion or cropping.
- [x] Zero regressions to simulation rendering, agent tracking, or existing functionality.
