# TASK_11: Inspector Vertical Cropping & Flex Shrink Layout Fix

- **Status**: `DONE`
- **Goal**: Fix vertical cropping across all inspector cards by preventing flex-shrink on cards and card elements, fixing range slider thumb clipping, and ensuring clean, unclipped vertical scrolling.
- **Context**: In CSS flexbox, flex items with `overflow: hidden` default to an automatic minimum height of 0. Because `.sidebar-content` has `display: flex; flex-direction: column`, all `.inspector-card` elements were compressed vertically to squeeze into the viewport height, causing the bottoms of every section (sliders, action buttons, stat rows, and brain graph) to be vertically cut off.

---

## Files to Create / Modify

- `[NEW]` `tasks/TASK_11_inspector_vertical_cropping_fix.md`
- `[MODIFY]` `tasks/README.md`
- `[MODIFY]` `style.css`
- `[MODIFY]` `index.html`
- `[MODIFY]` `js/main.js`

---

## Detailed Specification

### 1. Card Flex Sizing & Scrollability (`style.css`)
- Set `.inspector-card`:
  - `flex-shrink: 0;` (cards never compress vertically to fit viewport)
  - `min-height: max-content;`
  - Ensure smooth scrolling in `.sidebar-content` with adequate bottom padding (`padding: 14px 14px 40px 14px`).
- Set `.card-header` and `.card-body`:
  - `flex-shrink: 0;`

### 2. Inner Row & Section Unclipping (`style.css`)
- Set `.stat-row`:
  - `flex-shrink: 0;`
  - `min-height: 20px;`
  - `line-height: 1.4;`
- Set `.slider-control-group`:
  - `flex-shrink: 0;`
- Fix `.custom-range`:
  - Set input height to `18px` with transparent background and vertical margin `2px 0`.
  - Style `::-webkit-slider-runnable-track` and `::-moz-range-track` with `height: 6px`.
  - Position thumb with `margin-top: -5px` in WebKit so the 14px thumb is centered and never clipped.
- Set `.energy-section` and `.brain-section`:
  - `flex-shrink: 0;`
  - Ensure `#brain-canvas` and `.canvas-wrapper` maintain proper aspect ratio without vertical cropping.

### 3. Accordion Collapse Interaction (`index.html`, `js/main.js`, `style.css`)
- Added `.card-collapse-icon` (`▾`) to card headers.
- Clicking any card header toggles `.card-collapsed` (`display: none` on `.card-body`) with rotated arrow for quick compacting.

---

## Test Plan

1. **Inspector Card Layout Test**:
   - Open browser at `http://localhost:8080`.
   - Verify Population & Capacity card is fully visible without cropped sliders or buttons.
   - Verify Tile Cell card displays all 8 metrics with uncropped text descenders.
   - Click an agent: verify Agent card displays all details, energy meter, and full neural network canvas without cropping.
2. **Scroll Test**:
   - Resize window height down to 700px, 600px, and 500px.
   - Verify cards maintain their full natural heights and the sidebar scrolls smoothly to reach all sections.

---

## Acceptance Criteria

- [x] `.inspector-card` has `flex-shrink: 0` and `min-height: max-content`.
- [x] No section or card in the inspector is vertically clipped or cropped.
- [x] Sliders render thumbs cleanly without clipping.
- [x] Entire inspector sidebar scrolls cleanly when content exceeds viewport height.
- [x] Interactive card collapse/expand accordion provides smooth control over visible cards.
