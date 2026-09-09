# TASK_57 — GPU/CPU Toggle in Island Worker & Simulation Core

**Status**: `DONE`

---

## Goal

Wire `GpuEnvironment` into `js/simulation.js` so that each `Simulation` instance can switch between GPU and CPU environment ticking **at runtime** with a single method call, with full safety fallback to CPU if the GPU is unavailable.

---

## Context

TASK_56 created `GpuEnvironment` as a standalone module.  This task plugs it into `Simulation.tick()` and adds the runtime toggle mechanism used by the island worker loop.  The CPU path (`environment.js`) must remain 100% unchanged and active by default.

---

## Files to Modify

| Action | File |
|--------|------|
| `[MODIFY]` | `js/simulation.js` |
| `[MODIFY]` | `js/workers/island.worker.js` |

---

## Detailed Specification

### `js/simulation.js` Changes

#### 1. New import (top of file, conditional):

```js
// Dynamic import — only resolves if WebGPU is available.
// Kept lazy so headless Node.js or non-WebGPU environments never fail.
let GpuEnvironment = null;
async function loadGpuEnvironment() {
  if (GpuEnvironment) return GpuEnvironment;
  try {
    const mod = await import('./gpu-environment.js');
    GpuEnvironment = mod.GpuEnvironment;
  } catch (e) {
    GpuEnvironment = null;
  }
  return GpuEnvironment;
}
```

#### 2. New instance properties in `constructor()`:

```js
this.gpuEnvironment = null;       // GpuEnvironment instance when active
this.useGpu = false;               // Whether GPU mode is currently active
this.gpuInitPending = false;       // Guard against double-init
```

#### 3. New public method `async enableGpu()`:

```js
/**
 * Attempt to enable GPU-accelerated environment ticking.
 * @returns {Promise<boolean>} true if GPU mode is now active, false if CPU fallback.
 */
async enableGpu() {
  if (this.useGpu) return true; // Already enabled
  if (this.gpuInitPending) return false;
  this.gpuInitPending = true;

  const Cls = await loadGpuEnvironment();
  if (!Cls || !Cls.isSupported()) {
    console.warn('[Simulation] WebGPU not supported — staying on CPU.');
    this.gpuInitPending = false;
    return false;
  }

  const gpuEnv = new Cls(this.grid);
  const ok = await gpuEnv.init();
  if (!ok) {
    console.warn('[Simulation] GpuEnvironment.init() failed — staying on CPU.');
    gpuEnv.destroy();
    this.gpuInitPending = false;
    return false;
  }

  this.gpuEnvironment = gpuEnv;
  this.useGpu = true;
  this.gpuInitPending = false;
  console.log('[Simulation] GPU environment active (island', this.islandId, ')');
  return true;
}
```

#### 4. New public method `disableGpu()`:

```js
/**
 * Disable GPU mode and return to CPU environment ticking.
 */
disableGpu() {
  if (this.gpuEnvironment) {
    this.gpuEnvironment.destroy();
    this.gpuEnvironment = null;
  }
  this.useGpu = false;
  this.gpuInitPending = false;
  console.log('[Simulation] Reverted to CPU environment (island', this.islandId, ')');
}
```

#### 5. Modify `tick()` — replace the one `environment.tick()` call:

**Before:**
```js
// 1. Environmental Cellular Automata update
this.environment.tick();
```

**After:**
```js
// 1. Environmental Cellular Automata update (GPU or CPU path)
if (this.useGpu && this.gpuEnvironment) {
  this.gpuEnvironment.tick();
} else {
  this.environment.tick();
}
```

#### 6. Modify `disableGpu()` to also be called inside `fromJSON()` to ensure a deserialized simulation always starts in CPU mode (GPU must be explicitly re-enabled after load).

### `js/workers/island.worker.js` Changes

#### 1. Handle new `SET_GPU_MODE` message:

```js
case 'SET_GPU_MODE': {
  const enable = Boolean(msg.enable);
  if (!simulation) break;

  if (enable) {
    simulation.enableGpu().then(ok => {
      self.postMessage({
        type: 'GPU_MODE_CHANGED',
        islandId,
        active: ok,
        requested: true
      });
    });
  } else {
    simulation.disableGpu();
    self.postMessage({
      type: 'GPU_MODE_CHANGED',
      islandId,
      active: false,
      requested: false
    });
  }
  break;
}
```

#### 2. Include `isGpuActive` in `TELEMETRY` messages:

Add `isGpuActive: simulation ? simulation.useGpu : false` to the existing `TELEMETRY` postMessage payload inside `measureTpsAndSendTelemetry()`.

---

## Test Plan

1. Load the simulation in the browser.
2. Open the browser console and run:
   ```js
   // Get the island manager from the global scope
   window._islandManager.workerMap.get(0).postMessage({ type: 'SET_GPU_MODE', enable: true });
   ```
3. Observe console output: `[Simulation] GPU environment active (island 0)` (or the fallback warning if WebGPU is missing).
4. Observe that the simulation continues running — agents keep moving, biomass keeps growing.
5. Post `{ type: 'SET_GPU_MODE', enable: false }` and verify the CPU path resumes without any error.
6. Verify TPS is **higher** when GPU is active vs CPU (observable in the island HUD).

---

## Acceptance Criteria

- [x] `Simulation.enableGpu()` and `Simulation.disableGpu()` exist and work.
- [x] `Simulation.tick()` routes to `gpuEnvironment.tick()` when `useGpu === true`.
- [x] The CPU path (`environment.tick()`) is called when `useGpu === false` and works identically to the pre-task behavior.
- [x] The island worker handles `SET_GPU_MODE` and responds with `GPU_MODE_CHANGED`.
- [x] TELEMETRY messages include `isGpuActive` boolean.
- [x] `fromJSON()` always initializes with `useGpu = false` (no GPU auto-start on save load).
- [x] No console errors when GPU is unavailable — graceful fallback only.

