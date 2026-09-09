# TASK_59 — GPU Cluster Propagation: Host Admin Control for Contributor Nodes

**Status**: `DONE`

---

## Goal

Allow the Host admin to enable or disable GPU acceleration for any contributor node's islands via the Cluster Nodes dashboard, using the same server-mediated broadcast pattern as Radiation Lab and Performance Mode.

---

## Context

TASK_58 gave the Host a local GPU toggle.  This task extends it across the LAN cluster:
- The Host's `server.py` gets a new API endpoint and a new field in its global state.
- `ClusterClient.js` polls this new field in heartbeat responses and applies GPU mode to local workers.
- The Host's Cluster Nodes dashboard gets a "GPU" toggle column in the actions row.

---

## Files to Modify

| Action | File |
|--------|------|
| `[MODIFY]` | `server.py` |
| `[MODIFY]` | `js/cluster-client.js` |
| `[MODIFY]` | `js/main.js` |
| `[MODIFY]` | `index.html` |
| `[MODIFY]` | `style.css` |

---

## Detailed Specification

### `server.py` Changes

#### 1. New class-level state in `ClusterManager`:

```python
gpu_enabled = False   # Global GPU flag pushed to ALL nodes
```

#### 2. Add `gpuEnabled` to every `globalState` dict that is returned by the heartbeat endpoint and the `/api/cluster/state` endpoint.  Pattern to follow is identical to `irradiatedIslands`:

In every place in `server.py` where `globalState` is returned, add:
```python
'gpuEnabled': cls.gpu_enabled,
```

#### 3. New API endpoint `POST /api/cluster/gpu`:

```python
# POST /api/cluster/gpu
# Body: { "enabled": true|false }
# Response: { "ok": true, "gpuEnabled": <bool> }
```

Implementation (add inside the request handler's routing block):
```python
elif path == '/api/cluster/gpu' and method == 'POST':
    body = json.loads(request_body)
    enabled = bool(body.get('enabled', False))
    with ClusterManager._lock:
        ClusterManager.gpu_enabled = enabled
    response_data = {'ok': True, 'gpuEnabled': enabled}
    send_json(response_data)
```

Do NOT add any terminal print for this endpoint (follows TASK_34 heartbeat silence convention).

### `js/cluster-client.js` Changes

#### 1. Handle `gpuEnabled` in `syncGlobalState(globalState)`:

In `syncGlobalState`, after the existing `irradiatedIslands` sync block, add:

```js
// Synchronize GPU acceleration mode
if (typeof globalState.gpuEnabled === 'boolean') {
  const wantGpu = globalState.gpuEnabled;
  if (this.islandManager && this.islandManager.isGpuGlobal !== wantGpu) {
    this.islandManager.setAllIslandsGpu(wantGpu);
    this.emit('gpu_mode_change', wantGpu);
  }
}
```

#### 2. New method `toggleClusterGpu(enabled)`:

```js
/**
 * Host administration: enable/disable GPU for all cluster nodes.
 * @param {boolean} enabled
 */
async toggleClusterGpu(enabled) {
  // Apply locally for instant response
  if (this.islandManager) {
    this.islandManager.setAllIslandsGpu(enabled);
  }

  const resp = await fetch(`${this.apiBase}/api/cluster/gpu`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: Boolean(enabled) })
  });

  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to set cluster GPU mode: ${resp.statusText}`);
  }

  this.emit('gpu_mode_change', enabled);
  return await resp.json();
}
```

### `index.html` Changes

In the Cluster Nodes dashboard table, add a **GPU** column header and per-node GPU status indicator in the actions row.  Follow the exact same structure as the Radiation toggle column.

```html
<!-- In the cluster nodes table header row -->
<th>GPU</th>

<!-- In each node's actions row (dynamically rendered by main.js) -->
<td>
  <button class="node-gpu-btn" data-node-id="..." title="Toggle GPU acceleration for this node's islands">
    ⚡ GPU
  </button>
</td>
```

> **Note**: Per-node GPU toggle is cosmetic only at this level — under the hood, the server's `gpuEnabled` is a **global** flag (simpler and safer for this iteration). The per-node button in the UI calls `toggleClusterGpu()` which affects all nodes. A future task can add per-node granularity if needed. Display the button as toggled based on `ClusterManager.gpu_enabled`.

### `js/main.js` Changes

#### 1. When rendering the Cluster Nodes dashboard rows, add a GPU toggle button per node.

In the function that builds node rows in the cluster dashboard (search for where Radiation toggle buttons are built and follow the same pattern):

```js
// GPU toggle button in node actions
const gpuBtn = document.createElement('button');
gpuBtn.textContent = clusterGpuEnabled ? '⚡ ON' : '⚡ OFF';
gpuBtn.className = 'node-gpu-btn' + (clusterGpuEnabled ? ' gpu-active' : '');
gpuBtn.title = 'Toggle GPU acceleration for all cluster nodes';
gpuBtn.addEventListener('click', async () => {
  const newState = !clusterGpuEnabled;
  try {
    await clusterClient.toggleClusterGpu(newState);
    clusterGpuEnabled = newState;
    // Button state will update on next dashboard refresh
  } catch (err) {
    console.error('[GPU] Failed to toggle cluster GPU:', err);
  }
});
actionsCell.appendChild(gpuBtn);
```

Track `clusterGpuEnabled` in `main.js` as a module-level variable, updated by the `clusterClient.on('gpu_mode_change', ...)` event.

#### 2. Update the Host-local `⚡ GPU` HUD button (from TASK_58) to call `clusterClient.toggleClusterGpu()` when a cluster client is active, instead of just `islandManager.setAllIslandsGpu()`.

---

## Test Plan

**Multi-machine test:**
1. Start Host. Start Contributor on second PC, join the cluster.
2. In Host's Cluster Nodes dashboard, find the Contributor node row. Click the `⚡ GPU` button.
3. On the Contributor machine's browser console, observe: `[Simulation] GPU environment active (island N)` for each of its islands.
4. Observe that Contributor's TPS increases (visible in Host dashboard TPS column).
5. Click `⚡ GPU` again to disable. Contributor console logs CPU revert.

**Single-machine test (no cluster):**
1. Host-only run. Click `⚡ GPU: OFF` in HUD.
2. Verify all 8 local islands switch to GPU mode (console logs).

---

## Acceptance Criteria

- [x] `POST /api/cluster/gpu` endpoint exists in `server.py` and updates `ClusterManager.gpu_enabled`.
- [x] `gpuEnabled` field is present in every `globalState` response dict in `server.py`.
- [x] `ClusterClient.syncGlobalState()` reads `gpuEnabled` and calls `islandManager.setAllIslandsGpu()` accordingly on Contributor machines.
- [x] `ClusterClient.toggleClusterGpu()` exists and correctly POSTs to the server.
- [x] Cluster Nodes dashboard shows a `⚡ GPU` button per node row.
- [x] Host HUD `⚡ GPU` button routes through `toggleClusterGpu()` when in cluster mode.
- [x] No GPU-related terminal spam in `server.py`.
- [x] CPU-only path remains fully functional with no changes needed on machines where WebGPU is unavailable — GPU init simply fails silently and the simulation keeps running on CPU.

