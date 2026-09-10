# TASK_65: Fix WebGPU Storage Buffer Limit Request in Device Acquisition

- **Status**: DONE
- **Date**: 2026-09-10
- **Goal**: Request adequate `maxStorageBuffersPerShaderStage` in `requestDevice()` so WebGPU can successfully allocate 10 storage buffers per compute stage without validation errors.
- **Context**: In `js/gpu-environment.js`, 10 storage buffers are bound in `@group(0)` (`elevation`, `baseElevation`, `water`, `moisture`, `fertility`, `biomass`, `trample`, `scent`, `coastal`, and `tmp_a`). When calling `adapter.requestDevice()` without specifying `requiredLimits`, WebGPU clamps the device limits to the default specification baseline (`maxStorageBuffersPerShaderStage = 8`). Consequently, `createBindGroupLayout` fails with validation errors across all worker threads, causing WebGPU initialization to fail and forcing all islands back to CPU execution.
- **Files to Modify**:
  - `js/gpu-environment.js` `[MODIFY]`

---

## Detailed Specification

### `js/gpu-environment.js`
In `GpuEnvironment.prototype.init`:
Before calling `this.adapter.requestDevice()`, inspect `this.adapter.limits.maxStorageBuffersPerShaderStage`.
If available and `>= 10`, specify `requiredLimits: { maxStorageBuffersPerShaderStage: Math.min(maxStorage, 16) }`.
If `< 10`, log a descriptive warning and return `false` cleanly to prevent uncaptured WebGPU validation errors.

```javascript
// Request requiredLimits if supported by the adapter.
// WebGPU baseline defaults maxStorageBuffersPerShaderStage to 8.
// Since our bindGroupLayout requires 10 storage buffers (bindings 0-9),
// we must request at least 10 (or the adapter maximum, e.g. 16) if available.
const requiredLimits = {};
const maxStorage = this.adapter.limits?.maxStorageBuffersPerShaderStage;
if (maxStorage && maxStorage >= 10) {
  requiredLimits.maxStorageBuffersPerShaderStage = Math.min(maxStorage, 16);
} else if (maxStorage && maxStorage < 10) {
  console.warn(`[GpuEnvironment] WebGPU adapter supports max ${maxStorage} storage buffers per stage (10 required) — falling back to CPU.`);
  return false;
}

this.device = await this.adapter.requestDevice({ requiredLimits });
```

---

## Test Plan

1. Verify JavaScript syntax via `node -c js/gpu-environment.js`.
2. Verify browser behavior:
   - Launch Biome Shifters (`http://localhost:8080`).
   - Click `⚡ GPU` in the Host HUD or toggle GPU mode.
   - Confirm in DevTools console and worker logs that `[GpuEnvironment] All 8 compute pipelines compiled asynchronously` and `[GpuEnvironment] init() complete` appear with zero WebGPU validation errors.
   - Confirm telemetry shows `isGpuActive: true` and the GPU toggle remains active without dropping back to CPU.

---

## Acceptance Criteria

- [x] `js/gpu-environment.js` inspects `this.adapter.limits.maxStorageBuffersPerShaderStage` during `init()`.
- [x] `requestDevice` is called with `{ requiredLimits: { maxStorageBuffersPerShaderStage: ... } }`.
- [x] Adapters with `< 10` supported storage buffers fall back to CPU gracefully with an informative log.
- [x] JavaScript syntax check passes cleanly.
- [ ] User manual verification in browser that `⚡ GPU` toggles and stays active without errors.
