# Task 46: Distributed LAN Cluster Dashboard Wide Layout & Seamless Scrolling

## Status
`DONE`

---

## Goal
Redesign the Distributed LAN Cluster Dashboard modal to utilize wider viewport space (up to 1360px / 95vw), fix awkward column wrapping and text alignment across the 10-column nodes table, and provide seamless, fluid scrolling for large multi-machine clusters.

---

## Context
Currently, `.modal-cluster-dialog` is capped at `max-width: 880px`. Because the cluster nodes table contains 10 columns (Machine Name, Role, IP, Cores, Simulated Islands with pill buttons and cams, TPS, Population, Performance dropdown, Status, and Action buttons), the content is squeezed into narrow cells.
This causes:
1. Multi-line wrapping of action buttons and island pills, inflating row heights and causing the dialog to take up excessive vertical space.
2. Inconsistent column alignments between headers and cells (e.g., Cores, TPS, Population, and Actions).
3. The table scroll container is constrained to a fixed `max-height: 280px` rather than adapting gracefully to viewport height with smooth scrolling.

By widening the dialog to `max-width: 1360px; width: 95vw`, capping the modal height to `90vh`, aligning headers with data cells, preventing awkward wrapping on badges and action buttons, and implementing sleek overflow scrolling, the dashboard provides a spacious, professional command-center experience.

---

## Files to Create / Modify
- `[NEW]` `tasks/TASK_46_cluster_dashboard_wide_layout_and_seamless_scrolling.md` — Task specification document.
- `[MODIFY]` `tasks/README.md` — Register Task 46 in task catalog and roadmap.
- `[MODIFY]` `style.css` — Update `.modal-cluster-dialog`, `.cluster-metrics-ribbon`, `.cluster-table-scroll`, `.cluster-nodes-table`, column alignments, action button row styling, and custom scrollbars.
- `[MODIFY]` `index.html` — Ensure table header alignment classes match cell contents (Cores, TPS, Pop, Performance, Actions).
- `[MODIFY]` `js/main.js` — Ensure table cell rendering adheres to column classes and alignments.

---

## Detailed Specification

### 1. `style.css`
- `.modal-cluster-dialog`:
  - `max-width: 1360px; width: 95vw; max-height: 90vh;`
  - `display: flex; flex-direction: column; overflow: hidden;`
- `.modal-cluster-dialog .modal-body`:
  - `flex: 1 1 auto; overflow-y: auto; max-height: calc(90vh - 65px); padding: 20px 24px;`
  - Sleek custom scrollbars (`scrollbar-width: thin`).
- `.cluster-metrics-ribbon`:
  - `grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));`
- `.cluster-table-container`:
  - `flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column;`
- `.cluster-table-scroll`:
  - `width: 100%; overflow-x: auto; overflow-y: auto; max-height: 520px; min-height: 220px;`
  - `border-radius: var(--radius-sm); scrollbar-width: thin; overscroll-behavior: contain;`
- `.cluster-nodes-table`:
  - `min-width: 1080px; width: 100%;`
  - Sticky header: `th { position: sticky; top: 0; z-index: 3; background: var(--bg-surface-elevated, #161b22); }`
  - Standard column widths and whitespace handling:
    - `.col-node-name`: `min-width: 140px; white-space: nowrap;`
    - `.col-node-role`: `min-width: 125px; white-space: nowrap;`
    - `.col-node-ip`: `min-width: 110px; white-space: nowrap;`
    - `.col-node-cores`: `min-width: 80px; white-space: nowrap; text-align: center;`
    - `.col-node-islands`: `min-width: 220px;`
    - `.col-node-tps`: `min-width: 110px; white-space: nowrap; text-align: right;`
    - `.col-node-pop`: `min-width: 100px; white-space: nowrap; text-align: right;`
    - `.col-node-perf`: `min-width: 135px; white-space: nowrap; text-align: center;`
    - `.col-node-status`: `min-width: 95px; white-space: nowrap;`
    - `.col-node-actions`: `min-width: 240px; white-space: nowrap; text-align: right;`
  - `.cluster-actions-cell`:
    - `display: inline-flex; flex-wrap: nowrap; align-items: center; justify-content: flex-end; gap: 6px;`

---

## Test Plan
1. **DOM & CSS Structure Verification**:
   - Inspect `.modal-cluster-dialog` CSS properties to verify `max-width: 1360px`, `width: 95vw`, and `max-height: 90vh`.
   - Verify that column header alignments match table data cell alignments.
   - Verify sticky header styling prevents column headers from disappearing on scroll.
2. **Browser / Visual Verification**:
   - Launch simulation via `python3 server.py 8080`.
   - Open Distributed LAN Cluster Dashboard modal (`🌐` in HUD).
   - Verify modal occupies wide horizontal layout with generous spacing.
   - Verify metrics ribbon cards fit cleanly without cramped line wraps.
   - Verify table scrolls smoothly both horizontally (if constrained) and vertically with sticky header pinned.

---

## Acceptance Criteria
- [x] Distributed LAN Cluster Dashboard widened to `max-width: 1360px` / `95vw`.
- [x] Modal dialog height bounded at `90vh` with inner scrollbar preventing viewport overflow.
- [x] Column headers and data cells aligned consistently (Cores centered, TPS right-aligned, Population right-aligned, Actions right-aligned).
- [x] Action buttons in contributor rows do not wrap awkwardly into multiple lines.
- [x] Island pill buttons have adequate space and layout cleanly.
- [x] Sticky table headers remain visible when scrolling through nodes list.
