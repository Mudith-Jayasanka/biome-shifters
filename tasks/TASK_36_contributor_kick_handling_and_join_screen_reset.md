# Task 36: Contributor Kick Handling & Join Screen Reset

## Status: `DONE`

## Goal
Implement contributor client detection of Host kick/removal signals in `cluster-client.js` and gracefully terminate local Web Worker islands, reset state, and return the contributor user to the initial Join Screen.

## Context
When a Host clicks "Remove" on a contributor node in the LAN cluster dashboard, the contributor must cleanly dismantle its active simulation threads and return to the join modal where they can pick a new core count or name if desired.

## Files to Create/Modify
- `[MODIFY]` `js/cluster-client.js` — Detect `res.kicked` in `sendHeartbeat()`, stop heartbeat loop, emit `'kicked'`, and add helper methods for Host kick/rename/visibility endpoints.
- `[MODIFY]` `js/island-manager.js` — Add `terminateAll()` alias.
- `[MODIFY]` `js/main.js` — Implement `handleClusterKicked()`, terminating `islandManager` workers, resetting HUD and island bar, and re-opening `setupJoinModal()`.

## Detailed Specification

### `js/cluster-client.js`
- In `sendHeartbeat()`:
  - If response returns `data.kicked` or `data.status === 'kicked'`:
    - Call `this.stopHeartbeat()`.
    - Set `this.nodeId = null`.
    - Emit `'kicked', data.error || 'Removed by Host Admin'`.
    - Return null.
- Add client helper methods:
  - `kickNode(nodeId)`: calls `POST /api/cluster/node/kick`.
  - `renameNode(nodeId, name)`: calls `POST /api/cluster/node/rename`.
  - `setNodeVisibility(nodeId, isHidden)`: calls `POST /api/cluster/node/visibility`.

### `js/main.js`
- Listen for `this.clusterClient.on('kicked', (reason) => this.handleClusterKicked(reason))`.
- In `handleClusterKicked(reason)`:
  - Display user notification/toast indicating disconnection.
  - Terminate all Web Worker threads: `if (this.islandManager) { this.islandManager.terminateAll(); this.islandManager = null; }`.
  - Reset active island index, camera, and HUD role badges.
  - Clear `#island-bar-container`.
  - Hide `#worker-screensaver-overlay` if active.
  - Call `this.setupJoinModal()` so contributor is back at the join modal with core selection.

## Test Plan
1. **Headless Verification**: Test `ClusterClient` mock heartbeat receiving `{ kicked: true }` verifying that `'kicked'` event is emitted and heartbeat timer is cleared.
2. **Browser Verification**: Join cluster from a second tab/window, kick that node from host dashboard, verify contributor tab instantly terminates simulation, clears island bar, and presents the Join Screen.

## Acceptance Criteria
- [x] Contributor heartbeat detects kicked status and terminates polling immediately.
- [x] Local Web Worker threads are completely terminated without memory leaks.
- [x] Contributor viewport returns to the initial Join Dialog allowing re-joining with core selection.
