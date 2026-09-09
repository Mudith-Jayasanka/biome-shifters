# TASK_60: Fix GPU Toggle Oscillation and Worker Shader Path Resolution

**Status**: `DONE`  
**Goal**: Fix the bug where the ⚡ GPU On/Off toggle button automatically oscillates back and forth between enabled and disabled.  
**Context**: Following the introduction of WebGPU acceleration in tasks 56–59, toggling GPU mode causes the button to rapidly switch on and off. Root cause analysis identified two issues:
1. Web Workers executing in `/js/workers/` attempt to load WGSL shaders with relative paths (`./js/wgsl/...`), resulting in HTTP 404s and initialization failure in workers.
2. When workers report initialization failure and fall back to CPU, the local client state turns off, but the coordinator server's `ClusterManager.gpu_enabled` flag remains `true`. Periodic heartbeat sync sees `isGpuGlobal !== wantGpu` and repeatedly forces workers to retry, creating an infinite oscillation loop.

---

## Files to Create/Modify

- `js/gpu-environment.js` `[MODIFY]` - Resolve WGSL shader URLs relative to `import.meta.url` with fallbacks.
- `js/island-manager.js` `[MODIFY]` - Provide clean `onGpuFailure` callback without direct DOM access.
- `js/cluster-client.js` `[MODIFY]` - Track `gpuFailed` flag to suppress repeating sync loops, and clear it on manual toggle or remote turn-off.
- `js/main.js` `[MODIFY]` - Wire `islandManager.onGpuFailure` to synchronize UI and notify coordinator via `clusterClient.toggleClusterGpu(false)`. Fix `refreshClusterNodes()` inspecting node object instead of response data.
- `server.py` `[MODIFY]` - Include `'gpuEnabled': ClusterManager.gpu_enabled` in `GET /api/cluster/nodes` response.
- `tasks/README.md` `[MODIFY]` - Register TASK_60 in the catalog and dependency chain.

---

## Detailed Specification

1. **Shader URL Resolution (`js/gpu-environment.js`)**:
   - Web Workers run at `/js/workers/island.worker.js`.
   - Use `new URL('./wgsl/' + name + '.wgsl', import.meta.url).href` (which resolves against `gpu-environment.js`'s actual location `/js/`) with fallbacks to `/js/wgsl/${name}.wgsl` and `../wgsl/${name}.wgsl`.

2. **Headless Failure Propagation (`js/island-manager.js`)**:
   - Add `this.onGpuFailure = null;` to constructor.
   - Remove direct DOM element queries (`document.getElementById('btnToggleGpu')`) in `handleWorkerMessage`.
   - When all islands fail GPU initialization, reset `isGpuGlobal = false` and invoke `this.onGpuFailure(id)`.

3. **Client Heartbeat Loop Guard (`js/cluster-client.js`)**:
   - Add `this.gpuFailed = false;` in constructor.
   - In `syncRemoteState(globalState)`: if `wantGpu` is false, reset `this.gpuFailed = false`. Only command `setAllIslandsGpu(wantGpu)` if `!wantGpu || !this.gpuFailed`.
   - In `toggleClusterGpu(enabled)`: reset `this.gpuFailed = false` on manual enable.
   - In `fetchNodes()` fallback: return `gpuEnabled: false`.

4. **UI and Session Wiring (`js/main.js`)**:
   - In `initHostSession()`: wire `this.islandManager.onGpuFailure` to update HUD button UI, set `clusterGpuEnabled = false`, and call `clusterClient.toggleClusterGpu(false)` to reset the server state.
   - In `initContributorSession()`: wire `this.islandManager.onGpuFailure` to set `this.clusterClient.gpuFailed = true`.
   - In `refreshClusterNodes()`: read `data.gpuEnabled` from response instead of non-existent `n.gpuEnabled`.

5. **Server Endpoint (`server.py`)**:
   - In `_handle_cluster_nodes()`: include `'gpuEnabled': ClusterManager.gpu_enabled`.

---

## Test Plan

1. Verify WGSL shader files are fetched successfully by workers without 404 errors.
2. If WebGPU is supported by the browser/OS, clicking `⚡ GPU: OFF` toggles to `⚡ GPU: ON` and remains ON steadily across heartbeats (no oscillation).
3. If WebGPU is not supported or fails, it cleanly falls back to CPU, button displays `⚡ GPU: OFF`, and no repeated oscillation occurs.
4. Verify `python3 -m py_compile server.py` passes without syntax errors.
5. Verify `node --check js/gpu-environment.js`, `node --check js/island-manager.js`, `node --check js/cluster-client.js`, `node --check js/main.js` pass.

---

## Acceptance Criteria

- [x] WebGPU shaders load with valid URLs from Web Workers.
- [x] `IslandManager` is completely headless without DOM dependencies.
- [x] GPU toggle button remains stable in requested state without oscillating.
- [x] Server and client state stay synchronized on GPU failure.
- [x] Unit syntax checks pass for all modified files.
