# TASK_58 — GPU Toggle: IslandManager API & Host-Local Control

**Status**: `TODO`

---

## Goal

Add `IslandManager.setIslandGpu(islandId, enable)` and a **GPU toggle button** in the Host HUD that turns GPU acceleration on or off for all **local** islands simultaneously.

---

## Context

TASK_57 taught the island worker to handle `SET_GPU_MODE`.  This task exposes that control from the `IslandManager` (coordinator layer) and wires it into the Host UI as a single toggle button — matching the style of the existing Radiation Lab toggle.

The cluster/contributor propagation comes in TASK_59. This task is **Host-local only**.

---

## Files to Modify

| Action | File |
|--------|------|
| `[MODIFY]` | `js/island-manager.js` |
| `[MODIFY]` | `js/main.js` |
| `[MODIFY]` | `index.html` |
| `[MODIFY]` | `style.css` |

---

## Detailed Specification

### `js/island-manager.js` Changes

#### 1. New constructor property:

```js
// Track which islands have GPU mode active
this.gpuIslands = new Set();
this.isGpuGlobal = false; // Whether host requested GPU for all local islands
```

#### 2. New method `setIslandGpu(islandId, enable)`:

```js
/**
 * Enable or disable GPU acceleration for a specific local island.
 * @param {number} islandId
 * @param {boolean} enable
 */
setIslandGpu(islandId, enable) {
  const worker = this.workerMap.get(islandId);
  if (!worker) return;
  worker.postMessage({ type: 'SET_GPU_MODE', enable: Boolean(enable) });
  if (enable) {
    this.gpuIslands.add(islandId);
  } else {
    this.gpuIslands.delete(islandId);
  }
}
```

#### 3. New method `setAllIslandsGpu(enable)`:

```js
/**
 * Toggle GPU mode for ALL locally managed islands at once.
 * @param {boolean} enable
 */
setAllIslandsGpu(enable) {
  this.isGpuGlobal = Boolean(enable);
  for (const id of this.islandIds) {
    this.setIslandGpu(id, enable);
  }
}
```

#### 4. Update worker telemetry handler to track `isGpuActive`:

In the existing `worker.onmessage` handler where `TELEMETRY` messages are processed, read `msg.isGpuActive` and store it in `this.telemetry[islandId].isGpuActive`.

Also handle the `GPU_MODE_CHANGED` message from the worker:
```js
case 'GPU_MODE_CHANGED': {
  // Update the tracked state to reflect what the worker actually achieved
  const id = msg.islandId;
  if (msg.active) {
    this.gpuIslands.add(id);
  } else {
    this.gpuIslands.delete(id);
  }
  // If init failed for any island, reflect that in isGpuGlobal
  if (this.isGpuGlobal && !msg.active) {
    console.warn(`[IslandManager] GPU init failed for island ${id}, using CPU fallback`);
  }
  break;
}
```

### `index.html` Changes

Add a GPU toggle button in the HUD controls section, adjacent to the existing Radiation Lab toggle button:

```html
<!-- GPU Acceleration Toggle (Host admin only) -->
<button id="btnToggleGpu" class="hud-btn gpu-btn" title="Toggle WebGPU Acceleration for all islands">
  ⚡ GPU: OFF
</button>
```

### `style.css` Changes

```css
.gpu-btn {
  background: #1a3a1a;
  color: #4ade80;
  border: 1px solid #166534;
}
.gpu-btn.gpu-active {
  background: #064e3b;
  color: #6ee7b7;
  border-color: #34d399;
  box-shadow: 0 0 8px rgba(52, 211, 153, 0.4);
}
```

### `js/main.js` Changes

#### 1. On DOM ready — bind the GPU toggle button:

```js
const btnToggleGpu = document.getElementById('btnToggleGpu');
if (btnToggleGpu) {
  btnToggleGpu.addEventListener('click', () => {
    const newState = !islandManager.isGpuGlobal;
    islandManager.setAllIslandsGpu(newState);
    btnToggleGpu.textContent = newState ? '⚡ GPU: ON' : '⚡ GPU: OFF';
    btnToggleGpu.classList.toggle('gpu-active', newState);
  });
}
```

#### 2. Hide the GPU button for Contributor clients:

Add the GPU button to the host-only feature gating block (alongside other buttons hidden from contributors):
```js
// In the contributor feature-gating section:
if (btnToggleGpu) btnToggleGpu.style.display = 'none';
```

---

## Test Plan

1. Open the Host browser. Verify the `⚡ GPU: OFF` button appears in the HUD.
2. Click the button. It should change to `⚡ GPU: ON` with green glow.
3. Observe the browser console: each island worker should log `[Simulation] GPU environment active (island N)`.
4. Monitor the TPS counter for all islands — TPS should increase on Intel GPU machines.
5. Click again to toggle off. Button reverts to `⚡ GPU: OFF`, console logs CPU revert messages.
6. Open a Contributor browser — verify the `⚡ GPU` button is not visible.

---

## Acceptance Criteria

- [ ] `IslandManager.setIslandGpu()` and `setAllIslandsGpu()` exist and send correct worker messages.
- [ ] `isGpuGlobal` state correctly tracked on the manager.
- [ ] `⚡ GPU: OFF` / `⚡ GPU: ON` button appears for Host only.
- [ ] Button click toggles all local islands' GPU mode.
- [ ] Visual style (green glow on active) applied correctly.
- [ ] Telemetry cache stores `isGpuActive` per island.
- [ ] No UI regressions: Radiation Lab, Turbo Mode, Perf Limiter buttons unaffected.

