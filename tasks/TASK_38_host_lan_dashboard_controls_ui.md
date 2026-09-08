# Task 38: Host LAN Dashboard Controls UI (Remove, Rename, Hide/Unhide)

## Status: `DONE`

## Goal
Integrate interactive action controls (Rename, Hide/Unhide Visuals, Remove/Kick) into the Host Cluster Nodes Dashboard table for each contributor machine, providing full administrative authority from the Host UI.

## Context
With the backend endpoints, kick protocol, and zero-render screen saver in place, the Host LAN Dashboard needs intuitive action buttons in the connected nodes table to trigger these commands seamlessly.

## Files to Create/Modify
- `[MODIFY]` `index.html` — Add `<th>Actions</th>` to `cluster-nodes-table`.
- `[MODIFY]` `style.css` — Add styles for action buttons in cluster table rows (`.btn-node-rename`, `.btn-node-visibility`, `.btn-node-kick`).
- `[MODIFY]` `js/main.js` — Update `refreshClusterNodes()` to render action buttons on contributor rows and bind event listeners for Rename, Hide/Unhide, and Kick.

## Detailed Specification

### 1. Table Layout (`index.html`)
- In `index.html`, add `<th>Actions</th>` as the final column header in `cluster-nodes-table`.

### 2. Action Buttons Rendering (`js/main.js`)
- In `refreshClusterNodes()`:
  - For Host row: render `<span class="text-muted text-xs">Host Admin</span>`.
  - For Contributor rows:
    - **Rename**: `<button class="btn btn-xs btn-outline-info btn-node-rename" data-id="${n.nodeId}">✏️ Rename</button>`
    - **Visibility**:
      - If `n.isHidden`: `<button class="btn btn-xs btn-outline-success btn-node-vis" data-id="${n.nodeId}" data-hide="false">👁️ Unhide</button>`
      - If `!n.isHidden`: `<button class="btn btn-xs btn-outline-warning btn-node-vis" data-id="${n.nodeId}" data-hide="true">🙈 Hide</button>`
    - **Kick**: `<button class="btn btn-xs btn-outline-danger btn-node-kick" data-id="${n.nodeId}">❌ Remove</button>`
- Attach event delegation:
  - **Rename click**: Prompt user for new name (defaulting to current name). On submit, call `this.clusterClient.renameNode(nodeId, newName)`. Refresh table.
  - **Visibility click**: Call `this.clusterClient.setNodeVisibility(nodeId, isHidden)`. Refresh table.
  - **Kick click**: Confirm removal. On confirm, call `this.clusterClient.kickNode(nodeId)`. Refresh table.

## Test Plan
1. **Browser Verification**:
   - Open Host dashboard with a connected contributor.
   - Click "Rename", enter new name -> verify name updates instantly.
   - Click "Hide" -> verify contributor tab enters screen saver mode, button toggles to "Unhide".
   - Click "Unhide" -> verify contributor tab restores canvas, button toggles to "Hide".
   - Click "Remove" -> verify contributor tab is kicked back to join screen and disappears from active nodes.

## Acceptance Criteria
- [x] Table has an Actions column with Rename, Hide/Unhide, and Remove buttons on contributor rows.
- [x] Renaming updates both the dashboard row and persistent storage.
- [x] Hide/Unhide toggles contributor screen saver and updates button state.
- [x] Remove disconnects contributor and refreshes the dashboard table.
