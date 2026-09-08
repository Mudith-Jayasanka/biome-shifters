# Task 39: Per-Node Performance Limiter (Eco, Standard, Turbo)

## Status: `DONE`

## Goal
Implement a remote performance limiter allowing the Host to assign individual execution policies (Eco ~30 TPS, Standard 60 TPS, or Turbo uncapped) to specific contributor machines to regulate CPU heat and power consumption.

## Context
Different contributor devices have varying cooling capabilities (e.g. lightweight laptops vs desktop workstations). Allowing the Host to throttle specific machines prevents hardware thermal throttling and fan noise while keeping the distributed cluster balanced.

## Files to Create/Modify
- `[MODIFY]` `server.py` — Add `perfMode` attribute to node state and `POST /api/cluster/node/perf` endpoint.
- `[MODIFY]` `js/cluster-client.js` — Relay performance mode from heartbeat and emit `'perf_mode_change'`.
- `[MODIFY]` `js/island-manager.js` — Apply TPS limiter / throttle delay to worker threads based on assigned mode.
- `[MODIFY]` `js/workers/island.worker.js` — Handle `SET_PERF_MODE` and pace loop step delay accordingly.
- `[MODIFY]` `index.html` — Add `Perf Mode` column to `#modal-cluster-nodes` table.
- `[MODIFY]` `style.css` — Styling for `.select-cluster-perf` dropdown.
- `[MODIFY]` `js/main.js` — Render performance mode dropdown (Eco / Standard / Turbo) in Host dashboard.

## Detailed Specification

### 1. Backend: `server.py`
- In `ClusterManager.register_node()`:
  - Add `'perfMode': 'standard'` to initial `node_info`.
- In `ClusterManager.heartbeat()`:
  - Include `'perfMode': 'standard'` in auto-heal node dictionary if missing.
  - Return `'perfMode': node.get('perfMode', 'standard')` inside `nodeState`.
- In `ClusterManager.get_all_nodes()`:
  - Include `'perfMode': n.get('perfMode', 'standard')` in each node record.
- Add class method `ClusterManager.set_node_perf(cls, node_id: str, perf_mode: str) -> dict`:
  - Validate `perf_mode in ('eco', 'standard', 'turbo')`.
  - Update `cls.nodes[node_id]['perfMode'] = perf_mode`.
- Add endpoint routing in `do_POST`:
  - `if path in ('/api/cluster/node/perf', '/api/cluster/node/perf/'): self._handle_cluster_node_perf()`
  - Parse JSON body `{'nodeId': ..., 'perfMode': ...}` and call `ClusterManager.set_node_perf()`.

### 2. Client Coordinator: `js/cluster-client.js`
- Initialize `this.perfMode = 'standard'`.
- In `sendHeartbeat()`:
  - Check `data.nodeState.perfMode`. If different from `this.perfMode`, update `this.perfMode`, emit `'perf_mode_change'`, and call `this.islandManager.setPerfMode(this.perfMode)`.
- Add `async setNodePerf(nodeId, perfMode)`:
  - `POST /api/cluster/node/perf` with `{ nodeId, perfMode }`.

### 3. Island Manager: `js/island-manager.js`
- Initialize `this.perfMode = 'standard'`.
- Add `setPerfMode(perfMode)`:
  - Updates `this.perfMode`.
  - Dispatches `{ type: 'SET_PERF_MODE', perfMode: this.perfMode }` to all workers in `this.workerMap`.
- In `init()`, pass or post `SET_PERF_MODE` to each newly spawned worker.

### 4. Island Worker: `js/workers/island.worker.js`
- Maintain `let perfMode = 'standard'`.
- On message `SET_PERF_MODE`: set `perfMode = msg.perfMode || 'standard'`.
- In `runLoopStep()`:
  - If `perfMode === 'eco'`: run 1 tick, `delay = 33` (~30 TPS).
  - If `perfMode === 'standard'`: run 1 tick, `delay = 16` (~60 TPS).
  - If `perfMode === 'turbo'`:
    - If `isTurbo`: run batch of 25 ticks, `delay = 0`.
    - Else: run `speed` ticks, `delay = 16`.

### 5. UI: `index.html`, `style.css`, `js/main.js`
- `index.html`:
  - Add `<th>Performance</th>` before `<th>Status</th>` in `.cluster-nodes-table`.
- `style.css`:
  - Add styles for `.select-cluster-perf` (compact dark select with badge indicators).
- `js/main.js`:
  - In `refreshClusterNodes()`:
    - If Host: render `<span class="perf-badge host">Host (Default)</span>`.
    - If Contributor: render `<select class="select-cluster-perf" data-id="${n.nodeId}">` with options:
      - `<option value="eco" ${n.perfMode === 'eco' ? 'selected' : ''}>🌱 Eco (~30 TPS)</option>`
      - `<option value="standard" ${(!n.perfMode || n.perfMode === 'standard') ? 'selected' : ''}>⚡ Standard (60 TPS)</option>`
      - `<option value="turbo" ${n.perfMode === 'turbo' ? 'selected' : ''}>🚀 Turbo (Max)</option>`
  - Add change event listener for `.select-cluster-perf` to call `this.clusterClient.setNodePerf(nodeId, newMode)` and refresh the dashboard.

## Test Plan
- Verify setting a contributor to "Eco" caps worker TPS at ~30.
- Verify setting a contributor to "Standard" maintains ~60 TPS.
- Verify setting to "Turbo" removes throttle.

## Acceptance Criteria
- [x] Host can toggle performance mode per contributor from the cluster dashboard.
- [x] Worker loop throttles accordingly on contributor machine.
- [x] Heartbeat sync reliably delivers perfMode changes without dropping connections.
