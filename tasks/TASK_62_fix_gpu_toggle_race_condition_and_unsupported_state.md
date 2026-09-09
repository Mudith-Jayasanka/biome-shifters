# TASK_62: Fix GPU Toggle Async Race Condition & WebGPU Capability Detection

**Status**: `DONE`  
**Goal**: Resolve the GPU toggle oscillation bug by fixing the asynchronous race condition identified in the flight recorder trace, adding in-flight operation locking, and implementing WebGPU capability detection to gracefully handle unsupported hardware.  
**Context**: Diagnostics captured in `debug/trace_latest.json` proved that toggling GPU triggers concurrent asynchronous actions (`POST /api/cluster/gpu` vs. worker failure callbacks) that interleave out-of-order, overwriting failure recovery and causing the HUD button to rapidly bounce between ON and OFF states.

---

## 🔍 Root Cause Analysis (From Flight Recorder Trace)

The black-box flight recorder captured the exact timeline during the toggle glitch:

1. **+012.588s**: User clicks `#btnToggleGpu`. Click handler dispatches `POST /api/cluster/gpu` (`enabled: true`) and posts `SET_GPU_MODE: true` to all 8 island workers.
2. **+012.608s**: Workers fail WebGPU initialization (`navigator.gpu` unsupported/adapter unavailable) and reply with `GPU_MODE_CHANGED { active: false, requested: true }`.
3. **+012.609s**: `IslandManager.handleWorkerMessage` calls `this.onGpuFailure(islandId)`. `onGpuFailure` updates the button to `⚡ GPU: OFF` and dispatches `toggleClusterGpu(false)`.
4. **+012.612s**: The first `POST /api/cluster/gpu` (`enabled: true`) response resolves. The original click handler's `await` finishes and blindly executes:
   ```javascript
   this.clusterGpuEnabled = newState; // true!
   this.updateGpuButtonUI(newState);  // Flips button back to '⚡ GPU: ON'!
   ```
5. **+012.627s**: The second `POST /api/cluster/gpu` (`enabled: false`) response arrives, or subsequent heartbeat reconciles, flipping the button back to `⚡ GPU: OFF`.
6. **Result**: Rapid visual ping-pong oscillation (`OFF` → `OFF` → `ON` → `OFF`) on every click.

---

## Files to Create/Modify

- `tasks/TASK_62_fix_gpu_toggle_race_condition_and_unsupported_state.md` `[NEW]` - This task document.
- `tasks/README.md` `[MODIFY]` - Register TASK_62 in catalog and dependency graph.
- `js/cluster-client.js` `[MODIFY]` - Add request sequence counter / cancellation token so stale network responses cannot overwrite newer states.
- `js/main.js` `[MODIFY]` - Fix `btnToggleGpu` click handler to respect `gpuFailed` / abort latches, add `isGpuToggling` button lock, and perform pre-flight WebGPU capability check.
- `js/island-manager.js` `[MODIFY]` - Ensure `setAllIslandsGpu` and failure callbacks immediately cancel pending enable transitions.
- `js/gpu-environment.js` `[MODIFY]` - Export clean static pre-flight check for WebGPU support in main thread and workers.

---

## Detailed Specification

### 1. WebGPU Capability Pre-Flight Check (`js/gpu-environment.js` & `js/main.js`)
- On initialization, perform an asynchronous pre-flight check `GpuEnvironment.checkSupport()`:
  ```javascript
  static async checkSupport() {
    if (typeof navigator === 'undefined' || !navigator.gpu) return { supported: false, reason: 'navigator.gpu unavailable' };
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return { supported: false, reason: 'No WebGPU adapter found' };
      return { supported: true, adapter };
    } catch (err) {
      return { supported: false, reason: err.message };
    }
  }
  ```
- If unsupported:
  - In `main.js`, configure `#btnToggleGpu`:
    - Text: `⚡ GPU: N/A`
    - Class: `btn hud-btn gpu-btn disabled`
    - Title / Tooltip: `WebGPU is not supported by this browser or graphics card (CPU simulation only)`
    - Disable click handling to prevent triggering impossible transitions.

### 2. Elimination of Async Race in Click Handler (`js/main.js`)
- In `setupUIControls()` for `btnToggleGpu`:
  - Guard with `if (this.isGpuToggling) return;`
  - Set `this.isGpuToggling = true;` and display temporary busy state `⚡ GPU: ...`
  - Execute `toggleClusterGpu(newState)`.
  - After await, check if failure occurred during in-flight request:
    ```javascript
    if (this.clusterClient?.gpuFailed || !this.islandManager?.isGpuGlobal) {
      // Aborted or failed during execution; enforce false
      this.clusterGpuEnabled = false;
      this.updateGpuButtonUI(false);
    } else {
      this.clusterGpuEnabled = newState;
      this.updateGpuButtonUI(newState);
    }
    ```
  - Clear `this.isGpuToggling = false;` in a `finally` block.

### 3. Monotonic Request Sequence Versioning in `ClusterClient` (`js/cluster-client.js`)
- Add `this.gpuRequestSeq = 0;` in `ClusterClient`.
- In `toggleClusterGpu(enabled)`:
  - Increment `const seq = ++this.gpuRequestSeq;`.
  - When fetch resolves, verify `if (seq !== this.gpuRequestSeq) return;` (discard stale response).
  - Do not emit `gpu_mode_change` if the request has been superseded.

### 4. Immediate Server State Sync on Failure (`js/main.js`)
- When `islandManager.onGpuFailure` fires:
  - Immediately set `this.clusterGpuEnabled = false`.
  - Update UI immediately to `⚡ GPU: OFF` (or `⚡ GPU: N/A`).
  - Latch `clusterClient.gpuFailed = true`.
  - Send single fire-and-forget sync to server `POST /api/cluster/gpu { enabled: false }` with superseding sequence number.

---

## Test Plan

1. **Unsupported Hardware Emulation / WebGPU Null Check**:
   - On a machine without WebGPU, verify `#btnToggleGpu` displays `⚡ GPU: N/A` or cleanly stays `⚡ GPU: OFF` without any flickering or rapid state alternation.
2. **Flight Recorder Verification**:
   - Open Flight Recorder, start tracing.
   - Click `#btnToggleGpu`.
   - Verify in trace that:
     - No out-of-order `ON` state mutation occurs after a failure.
     - `DOM_MUTATION` events on `#btnToggleGpu` show zero ping-pong oscillation.
     - `analyze_trace.py` reports zero oscillation alerts on `#btnToggleGpu`.
3. **Cluster Sync Verification**:
   - Check `GET /api/cluster/nodes` and verify `gpuEnabled` remains synchronized and does not flap between `true` and `false`.

---

## Acceptance Criteria

- [x] `#btnToggleGpu` performs a pre-flight check and displays `⚡ GPU: N/A` or disabled state if WebGPU adapter is unavailable.
- [x] Clicking `#btnToggleGpu` has in-flight locking (`isGpuToggling`) preventing concurrent re-triggering.
- [x] Asynchronous race condition between network fetch and worker failure callbacks is eliminated via request sequence numbers (`seq`).
- [x] No visual oscillation / button bouncing occurs when GPU is toggled or when WebGPU initialization fails.
- [x] Trace analysis via `python3 scripts/analyze_trace.py` confirms zero ping-pong oscillations on `#btnToggleGpu`.

