# Task 54: Client Auto-Disconnect, Auto-Reconnect & Version Mismatch Synchronization

## Status
`DONE`

---

## Goal
Implement client-side resilience features:
1. **Auto Disconnect (3-min Pause)**: If continuous connection to the server is lost for >3 minutes (180s), automatically pause local simulation workers to conserve CPU/battery without tearing down the contributor session.
2. **Auto Connect & Resume (3s Retry)**: While disconnected, poll the server every 3 seconds. Once reconnected, auto-heal session with the coordinator and resume simulations with the user's previously chosen CPU cores.
3. **Version Mismatch Handling**:
   - **Host Admin**: Display a persistent HUD notification banner informing the user of the new build so they can save their simulation before reloading.
   - **Contributor Nodes**: Display a dramatic countdown overlay (e.g. 5 seconds) before automatically executing a cache-busting hard reload (`?v=<version>`), immediately restoring saved cores from `localStorage`, and continuing simulation.

---

## Context
When contributor machines run unattended simulations over the LAN:
- If the host machine or network goes down, local contributor workers shouldn't spin at 100% CPU forever in an orphaned state; pausing after 3 minutes preserves resources while keeping the session intact.
- When the server comes back up, nodes must seamlessly rejoin and unpause without requiring manual intervention.
- When the host pushes a new Git build, running differing code versions can desynchronize neural models or CA physics. Contributor nodes should automatically reload with cache-busting, while the Host should be given a persistent notification so they have full control to save their active run before updating.

---

## Files to Create / Modify
- `[MODIFY]` `js/cluster-client.js` — Track `lastHeartbeatSuccessTime`, implement 180s disconnect threshold, 3s retry interval on failure, and emit `auto_disconnect_pause`, `reconnected_from_pause`, and `version_mismatch`.
- `[MODIFY]` `js/main.js` — Handle pause/resume on auto-disconnect, persist contributor session to `localStorage`, render Host persistent update banner with save prompt, render Contributor dramatic countdown overlay and cache-busting reload.
- `[MODIFY]` `style.css` — Styles for persistent HUD update banner and contributor dramatic countdown overlay.
- `[MODIFY]` `index.html` — DOM structures for `#hud-version-banner` and `#version-countdown-overlay`.
- `[MODIFY]` `server.py` — Ensure `next_island_id` in auto-heal updates to prevent duplicate island ID allocation upon server restarts.

---

## Detailed Specification

### 1. ClusterClient Disconnect & Reconnect Logic: `js/cluster-client.js`
- Attributes:
  - `this.lastHeartbeatSuccessTime = Date.now();`
  - `this.isAutoPausedDueToDisconnect = false;`
  - `this.clientBuildVersion = null;`
  - `this.retryIntervalMs = 3000;`
- In `sendHeartbeat()`:
  - **On Successful HTTP 200**:
    - `this.lastHeartbeatSuccessTime = Date.now();`
    - Check version mismatch:
      ```javascript
      if (data.buildVersion && data.buildVersion.version) {
        if (!this.clientBuildVersion) {
          this.clientBuildVersion = data.buildVersion.version;
        } else if (this.clientBuildVersion !== data.buildVersion.version) {
          this.emit('version_mismatch', data.buildVersion);
        }
      }
      ```
    - Check auto-reconnect:
      ```javascript
      if (this.isAutoPausedDueToDisconnect) {
        this.isAutoPausedDueToDisconnect = false;
        this.emit('reconnected_from_pause');
      }
      ```
  - **On HTTP Failure / Catch**:
    - `const offlineDuration = Date.now() - this.lastHeartbeatSuccessTime;`
    - If `offlineDuration >= 180000 && !this.isAutoPausedDueToDisconnect`:
      - `this.isAutoPausedDueToDisconnect = true;`
      - `this.emit('auto_disconnect_pause', { offlineDuration });`

### 2. Main Simulation & UI Orchestration: `js/main.js`
- **Contributor Session Persistence**:
  - Save `localStorage.setItem('biome_contributor_session', JSON.stringify({ name: reg.name, cores: this.selectedCores, perfMode: this.islandManager.perfMode }));`
  - On page boot, if `mode-contributor` and `biome_contributor_session` is found with URL query param `?v=`, automatically join and spin up those cores!
- **Auto-Disconnect Handling**:
  - On `auto_disconnect_pause`:
    - Pause simulation: `this.islandManager.setPause(true);`
    - Update HUD: `🔴 Server Unreachable (3m+). Local simulation paused. Retrying every 3s...`
  - On `reconnected_from_pause`:
    - Resume simulation: `this.islandManager.setPause(false);`
    - Restore HUD badge.
- **Version Mismatch Handling**:
  - On `version_mismatch` (payload: `{ build, version, timestamp, action }`):
    - **Host**:
      - Show persistent `#hud-version-banner`:
        `📢 New Build #{build} available! Please save your simulation before reloading. [💾 Quick Save] [🔄 Reload Now] [✕ Dismiss]`
    - **Contributor**:
      - Show `#version-countdown-overlay`:
        Dramatic countdown starting at 5s: "🚀 Simulation Update Detected (Build #{build})! Reloading in 5s..."
        Ticking 5... 4... 3... 2... 1... 
        Executes `window.location.replace(window.location.pathname + '?v=' + payload.version);`
        Includes `[⚡ Reload Immediately]` and `[⏳ Postpone (60s)]` buttons.

### 3. Server Next Island ID Safeguard: `server.py`
- In `ClusterManager.heartbeat()` auto-heal branch:
  ```python
  if allocated_islands:
      cls.next_island_id = max(cls.next_island_id, max(allocated_islands) + 1)
  ```

---

## Test Plan
1. **Build Version Detection**: Simulate a build version increment and verify the Host displays the persistent notification banner.
2. **Contributor Dramatic Countdown**: Verify contributor node displays countdown overlay and triggers `window.location.replace('?v=...')` upon completion.
3. **Auto-Disconnect Simulation**: Disconnect the network / kill the server. Fast-forward clock or test threshold to verify workers pause at 3 minutes with proper HUD status.
4. **Auto-Reconnect Simulation**: Restart the server. Verify contributor auto-heals, unpauses workers, and continues simulating without manual re-join.

---

## Acceptance Criteria
- [x] Simulation workers automatically pause if server heartbeat fails continuously for 3 minutes.
- [x] Simulation workers automatically unpause and resume simulating when server reconnects.
- [x] Host receives persistent HUD notification on version mismatch allowing safe simulation saving before reloading.
- [x] Contributor receives dramatic countdown overlay and cache-busting automatic reload on version mismatch.
- [x] Contributor auto-joins with previously selected cores after cache-busting reload.


