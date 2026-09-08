# Task 32: Host Cluster Nodes Dashboard & LAN Sharing UI

## Status: `DONE`

## Goal
Implement a dedicated **Cluster Nodes Dashboard** modal for the Host/Admin displaying all connected LAN clients, their dedicated CPU cores, assigned island IDs, and real-time TPS, alongside a 1-click shareable LAN invite link.

## Context
As the host of the distributed simulation, the admin needs full visibility into who is connected to the session, how much compute each machine is contributing, and the overall health of the cluster. This task adds a `🌐 Cluster` button to the top HUD (visible only to the host) and a rich modal dashboard that live-updates connected client statistics.

## Files to Create/Modify
- `[MODIFY]` `index.html` — Add `#btn-cluster-hud` to the top HUD header and create the `#modal-cluster-nodes` dashboard structure.
- `[MODIFY]` `style.css` — Styling for the Cluster HUD button, invite link card with copy animation, cluster overview metrics, and connected nodes table.
- `[MODIFY]` `js/main.js` — Wire up Cluster button click, fetch `/api/cluster/nodes` on interval while modal is open, populate the table, and implement the 1-click clipboard copy for the LAN link.
- `[MODIFY]` `tasks/README.md` — Register TASK_32 in task catalog and dependency graph.

## Detailed Specification

### 1. Host HUD Button (`index.html`)
In the top HUD action buttons group (only displayed when in Host mode):
```html
<button id="btn-cluster-hud" class="btn btn-secondary" title="View Connected Cluster Nodes & LAN Link">
  🌐 Cluster <span id="badge-cluster-nodes-count" class="tab-badge">1</span>
</button>
```

### 2. Cluster Nodes Dashboard Modal (`#modal-cluster-nodes`)
Modal dialog containing:
1. **Modal Header**:
   - Title: `🌐 Distributed LAN Cluster Dashboard`
   - Close button (`✕`)
2. **Invite Link Banner**:
   - Displays the detected LAN URL: `http://<LAN_IP>:8080`
   - Quick instructions: *"Share this link with friends on your local WiFi to pool CPU cores!"*
   - Button: `[ 📋 Copy Invite Link ]` (copies URL to clipboard and briefly changes text to `"✓ Copied!"`).
3. **Cluster Metrics Ribbon**:
   - Total Connected Machines (e.g. `3 Nodes`)
   - Total Dedicated Cores (e.g. `16 Cores`)
   - Total Parallel Islands (e.g. `16 Islands`)
   - Combined Cluster TPS (e.g. `14,200 TPS`)
   - Total Cluster Population (e.g. `3,200 Agents`)
4. **Connected Nodes Table**:
   - Columns: `Node / Machine`, `Role`, `IP Address`, `Cores`, `Simulated Islands`, `Current TPS`, `Population`, `Status`
   - Row 1: Always the Host (Islands 0–7, 8 Cores, `👑 Host Admin`)
   - Row 2..N: Connected contributor clients with live ping/liveness dots (`🟢 Active`, `🟡 Delayed`).

### 3. Dynamic Polling & Clipboard API (`js/main.js`)
- When the Cluster modal is open, query `GET /api/cluster/nodes` every 2 seconds.
- Calculate sum of TPS and Population across all reported nodes and update header ribbon.
- Use `navigator.clipboard.writeText(lanUrl)` with fallback to `document.execCommand('copy')` to guarantee 1-click copy works across all modern browsers.

## Test Plan
1. **Host Dashboard Button**: Open `http://localhost:8080` and verify `🌐 Cluster` button is present in the HUD.
2. **Modal Display**: Click `🌐 Cluster` button; verify the modal opens with the invite link displaying the detected host LAN IP.
3. **Invite Link Copy**: Click `📋 Copy Invite Link` and verify the clipboard contains the valid LAN URL, and the button shows `"✓ Copied!"`.
4. **Live Client Update**: Connect a secondary browser tab via LAN link. Verify the Cluster Nodes table immediately shows the new node with its dedicated core count and assigned island range.

## Acceptance Criteria
- [x] `🌐 Cluster` button appears in HUD only for Host on localhost.
- [x] Dashboard modal displays accurate host LAN join URL with working 1-click clipboard copy.
- [x] Live table updates dynamically as new client machines join or disconnect.
- [x] Aggregate cluster metrics (total cores, total islands, cluster TPS, cluster population) calculate and display accurately.

