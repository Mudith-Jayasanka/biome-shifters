# TASK_64: Fix Heartbeat PerfMode Reconciliation and Turbo Mode Loop Persistence

- **Status**: IN PROGRESS
- **Date**: 2026-09-09
- **Goal**: Prevent Turbo ("Boost") mode from being automatically throttled and disabled after 2 seconds by fixing the backend node `perfMode` registration default, synchronizing `isTurbo` with node `perfMode`, preventing heartbeat reconciliation from clobbering Turbo mode, and updating the speed button UI on cluster sync.
- **Context**: In Turbo mode, workers run an uncapped zero-latency `MessageChannel` microtask pump requiring `perfMode === 'turbo'`. However, `server.py` registers every new client with `perfMode = 'standard'`. Every 2 seconds, the heartbeat response returns `nodeState.perfMode: 'standard'`, which calls `islandManager.setPerfMode('standard')` and forces all workers out of Turbo mode into 30 TPS standard stepping.

---

## Files to Modify

- `server.py` `[MODIFY]`
  - In `ClusterManager.register_node`: Set `perfMode: 'turbo'` for host/localhost connections.
  - In `_handle_cluster_control`: When `isTurbo: true` is received, also update the host node's `perfMode` to `'turbo'`.
- `js/cluster-client.js` `[MODIFY]`
  - In `syncRemoteState`: If `globalState.isTurbo` is `true`, prevent stale `nodeState.perfMode: 'standard'` from terminating Turbo mode.
- `js/main.js` `[MODIFY]`
  - In the `.btn-speed` click handler: When activating Turbo mode, notify the cluster backend of `setNodePerf(nodeId, 'turbo')` and update `this.perfMode = 'turbo'`.
  - In `clusterClient.on('speed_change')`: Synchronize the active CSS class on `.btn-speed` buttons so the UI accurately displays cluster speed and Turbo state.

---

## Detailed Specification

### 1. `server.py` Host Default & Control Synchronization
In `ClusterManager.register_node`:
```python
is_admin_ip = client_ip in ('127.0.0.1', '::1', 'localhost', get_lan_ip()) or client_ip.startswith('127.')
initial_perf_mode = 'turbo' if (is_admin_ip or not cls.nodes) else 'standard'
```
In `_handle_cluster_control`:
When `data.get('isTurbo') is True`:
Update `perfMode` for all host-associated nodes or the active host node in `cls.nodes`.

### 2. `js/cluster-client.js` Heartbeat Guarding
In `syncRemoteState(globalState)`:
When `data.nodeState.perfMode` arrives in heartbeat:
If `this.isTurbo` is currently `true` or `globalState.isTurbo` is `true`, do not downgrade local `perfMode` from `'turbo'` to `'standard'`.

### 3. `js/main.js` UI State Synchronization
In `clusterClient.on('speed_change', ({ speed, isTurbo }) => ...)`:
Update `.btn-speed` active classes:
```javascript
const speedButtons = document.querySelectorAll('.btn-speed');
speedButtons.forEach(btn => {
  const isMatch = isTurbo ? (btn.dataset.speed === 'turbo') : (parseInt(btn.dataset.speed, 10) === speed);
  btn.classList.toggle('active', isMatch);
});
```

---

## Test Plan

1. Start simulation and verify it runs at 1x speed (60 TPS).
2. Click **⚡ Turbo**:
   - Verify `⚡ Turbo` highlights active.
   - Verify TPS surges to 200–300+ TPS.
   - Wait 10 seconds (spanning at least 5 heartbeat intervals).
   - Verify `⚡ Turbo` remains active and TPS does **not** drop back to 30 TPS.
3. Click **1x**:
   - Verify speed returns to 60 TPS smoothly.

---

## Acceptance Criteria

- [x] `server.py` registers the Host admin node with `perfMode = 'turbo'`.
- [x] Heartbeat responses do not overwrite `perfMode = 'turbo'` with `'standard'` when Turbo mode is active.
- [x] Activating `⚡ Turbo` keeps `isTurbo` and `perfMode` persistent across continuous 2-second heartbeats.
- [x] Cluster `speed_change` updates the visual active state on `.btn-speed` and `.btn-turbo` buttons.
- [ ] User manual verification in browser that `⚡ Turbo` stays on continuously.
