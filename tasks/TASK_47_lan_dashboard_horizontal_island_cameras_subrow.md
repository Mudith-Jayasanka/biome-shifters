# Task 47: LAN Cluster Dashboard Horizontal Island Cameras Sub-Row

## Status
`DONE`

---

## Goal
Restructure the Distributed LAN Cluster Dashboard table so that island cameras are displayed in a dedicated horizontal sub-row directly underneath each node record, eliminating vertical bloating caused by narrow multi-camera columns, resolving duplicate column headers, and treating each node and its camera bar as a single unified record.

---

## Context
In previous revisions, island camera buttons were placed inside a dedicated table column ("Simulated Islands"). When a machine simulates multiple islands (e.g. 4, 8, or 16 islands), all camera buttons wrap vertically inside that narrow column, causing each node row to expand significantly in height. Furthermore, a duplication error during recent layout updates resulted in redundant table headers and data cells in the DOM.

The user requested:
1. Remove the island cameras column from the main table record row.
2. Render the island cameras on a dedicated line directly below each record.
3. Align the cameras horizontally (`- Camera 1 - Camera 2 - Camera 3 - Camera 4 ...`).
4. Ensure the main record and its camera sub-row are unified as one record (shared row hover, record boundary borders, and cohesive styling).

---

## Files to Create / Modify
- `[NEW]` `tasks/TASK_47_lan_dashboard_horizontal_island_cameras_subrow.md` — Task specification document.
- `[MODIFY]` `tasks/README.md` — Register Task 47 in roadmap and catalog.
- `[MODIFY]` `index.html` — Clean up duplicated `<th>` elements and remove the "Simulated Islands" column from the table header.
- `[MODIFY]` `js/main.js` — Clean up duplicated `<td>` elements in `refreshClusterNodes()`, remove the island column from the primary row, output a second sub-row (`tr.node-cams-row`) with `colspan="9"` containing horizontal camera buttons, and handle camera click / radiation interactions.
- `[MODIFY]` `style.css` — Style `.node-main-row`, `.node-cams-row`, `.col-node-cams-cell`, `.node-cams-container`, `.node-cams-heading`, `.node-cams-list`, `.node-cam-btn`, and unified record hover states with `:has()`.

---

## Detailed Specification

### 1. `index.html`
- Remove all duplicate `<th>` tags in `.cluster-nodes-table thead`.
- Standardize the 9 table columns:
  1. `Machine / Device` (`col-node-name`)
  2. `Role` (`col-node-role`)
  3. `IP Address` (`col-node-ip`)
  4. `Cores` (`col-node-cores`)
  5. `Current TPS` (`col-node-tps`)
  6. `Population` (`col-node-pop`)
  7. `Performance` (`col-node-perf`)
  8. `Status` (`col-node-status`)
  9. `Actions` (`col-node-actions`)

### 2. `js/main.js`
- In `refreshClusterNodes()`:
  - Generate the primary record row `<tr class="node-main-row ${rowClass}">` with exactly 9 `<td>` elements matching the columns above.
  - Generate the secondary sub-row `<tr class="node-cams-row ${rowClass}">` with `<td colspan="9" class="col-node-cams-cell">`.
  - Inside the camera sub-row, render:
    - Heading: `📹 Cameras:`
    - Horizontal list of camera buttons: `📹 Camera 1`, `📹 Camera 2`, ... (`node-cam-btn`).
    - Radioactive islands display `☢️ Camera X` with `.irradiated` class and `RAD` badge.
  - In `tbody` click handler:
    - Support clicks on `.node-cam-btn` to open the live satellite camera dialog (`openIslandCam(islandId, nodeName, nodeIp)`).
    - If user clicks the radiation badge or toggle on the button, toggle radiation without opening the camera dialog.

### 3. `style.css`
- Record grouping:
  - `.node-main-row td`: border-bottom none, compact padding.
  - `.node-cams-row td`: border-bottom 1px solid border color, compact padding.
  - Shared hover: hovering either `.node-main-row` or `.node-cams-row` highlights both rows simultaneously using `:has()`.
- Horizontal camera bar:
  - `.node-cams-container`: flex row, align items center, gap 10px.
  - `.node-cams-list`: flex row, flex-wrap, align items center, gap 6px.
  - `.node-cam-btn`: compact monospace button with camera icon, label, hover glow, and irradiated pulsing state.

---

## Test Plan
1. **DOM & Column Integrity**:
   - Verify that `.cluster-nodes-table thead` has exactly 9 columns without duplication.
   - Verify that each contributor / host entry in the table renders as a pair of rows (`tr.node-main-row` and `tr.node-cams-row`).
2. **Horizontal Camera Layout**:
   - Open Distributed LAN Cluster Dashboard.
   - Verify that island cameras are displayed on a line below each machine's record.
   - Verify camera buttons sit horizontally in a row without vertical stacking.
3. **Interactive Functionality**:
   - Click a camera button (e.g. `📹 Camera 1` or `📹 Camera 2`).
   - Verify the live satellite camera modal opens for that specific island.
   - Toggle radiation mode and verify the corresponding camera button reflects the irradiated style.
4. **Visual Record Cohesion**:
   - Hover over either the main row or the camera row and confirm both rows highlight together as one record.

---

## Acceptance Criteria
- [x] No duplicate `<th>` or `<td>` elements in the cluster nodes table.
- [x] "Simulated Islands" column removed from the primary table header and data row.
- [x] Cameras displayed in a horizontal line directly below each record (`tr.node-cams-row`).
- [x] Hovering either row highlights the entire node record.
- [x] Clicking any camera button opens the live Satellite Cam modal for that specific island.
