# Task 52: Island Worker MessageChannel Turbo Pump for Maximum CPU Saturation

## Status
`DONE`

---

## Goal
Replace the browser-clamped `setTimeout(..., 0)` execution mechanism in `island.worker.js` with a dedicated, zero-latency `MessageChannel` pump during Turbo mode, restoring 100% CPU core saturation, maximum throughput, and multi-thousand TPS.

---

## Context
In the original single-threaded architecture (commit `77ff835`), Turbo mode used a `MessageChannel` microtask pump to run ticks continuously without timer latency, pegging the CPU core at 100% capacity. When simulation islands were migrated into Web Workers (`TASK_18`), the worker loop relied on `setTimeout(runLoopStep, delay)`. 

In all major browser engines (per the WHATWG HTML5 specification), nested `setTimeout` calls (depth >= 5) enforce an artificial **minimum delay of 4ms**. This timer clamp introduces idle CPU periods between batches, preventing the worker thread from utilizing the full compute potential of the host CPU core.

---

## Gaps Identified in Existing Implementation
1. **WHATWG 4ms Timer Clamping Gap**:
   `setTimeout(runLoopStep, 0)` is clamped to 4ms after 5 iterations. At 25 ticks per batch, the theoretical execution rate is capped at ~6,250 TPS, but OS thread scheduling and browser timer quantization frequently reduce this to 2,000–3,000 TPS, leaving the CPU core partially idle.
2. **Worker Message Queue Interleaving Gap**:
   A raw synchronous `while (true)` loop cannot be used inside Web Workers because it permanently blocks the worker's message event loop, preventing coordinator messages (`GET_FRAME`, `SET_PAUSE`, `SET_SPEED`, `EXPORT_ELITES`, `SERIALIZE`) from being received. The `MessageChannel` pump solves this by batching ticks and dispatching the next batch via `channel.port2.postMessage(null)`, interleaving incoming coordinator events with zero timer delay.
3. **Loop Mode Transition Cleanliness Gap**:
   When toggling between paused, normal speed (`setTimeout`), and Turbo (`MessageChannel`), `island.worker.js` must safely clear `loopTimer` and prevent race conditions where multiple pumps run simultaneously.

---

## Files to Create / Modify
- `[MODIFY]` `js/workers/island.worker.js` — Implement a dedicated `MessageChannel` pump (`turboChannel`) in the worker scope, activate it exclusively when `isTurbo && perfMode === 'turbo'`, and safely transition between timer-based pacing and zero-latency channel pumping.
- `[MODIFY]` `js/config.js` — Add `TURBO_BATCH_SIZE: 50` to fine-tune worker batch execution granularity.

---

## Detailed Specification

### 1. Worker MessageChannel Pump: `js/workers/island.worker.js`
- Create a dedicated channel in worker scope:
  ```javascript
  const turboChannel = new MessageChannel();
  let isTurboPumping = false;
  ```
- Listen on `turboChannel.port1.onmessage`:
  ```javascript
  turboChannel.port1.onmessage = function() {
    if (!isRunning || isPaused || !isTurbo || perfMode !== 'turbo') {
      isTurboPumping = false;
      return;
    }

    const batchSize = CONFIG.TURBO_BATCH_SIZE || 50;
    for (let i = 0; i < batchSize; i++) {
      if (!isRunning || isPaused || !isTurbo || perfMode !== 'turbo') break;
      simulation.tick();
      tickCounter++;
    }

    measureTpsAndSendTelemetry();

    if (isRunning && !isPaused && isTurbo && perfMode === 'turbo') {
      turboChannel.port2.postMessage(null);
    } else {
      isTurboPumping = false;
    }
  };
  ```
- In `runLoopStep()` / loop scheduler:
  - If `isTurbo && perfMode === 'turbo'`:
    - Cancel any active `loopTimer`.
    - If `!isTurboPumping`:
      - `isTurboPumping = true;`
      - `turboChannel.port2.postMessage(null);`
    - Do not schedule `setTimeout`.
  - Otherwise (normal speeds or eco/standard limits):
    - `isTurboPumping = false;`
    - Execute step and schedule via `setTimeout(runLoopStep, delay)`.

- On `SET_SPEED`, `SET_PAUSE`, `SET_PERF_MODE`:
  - When switching into Turbo mode, immediately trigger the pump.
  - When switching out of Turbo mode or pausing, reset `isTurboPumping = false` and ensure `runLoopStep()` picks up timer-based scheduling.

---

## Test Plan
1. Start `server.py` and open the app in Chrome/Firefox.
2. Select Turbo mode (`⚡ Turbo` or press `T`).
3. Monitor OS CPU utilization (e.g. `htop` or Chrome Task Manager).
4. Verify that worker thread CPU utilization rises to near 100% of its assigned core.
5. Verify that TPS scales to 4,000–8,000+ TPS depending on CPU speed, without freezing frame requests or UI controls.
6. Toggle between 1x and Turbo multiple times to verify smooth, leak-free loop mode transitions.

---

## Acceptance Criteria
- [x] `MessageChannel` pump operates inside `island.worker.js` without timer clamping.
- [x] Worker thread maximizes CPU core capacity during Turbo mode.
- [x] Coordinator messages (`GET_FRAME`, `SET_PAUSE`, `SET_SPEED`) are processed without starvation.
- [x] Toggling between normal speeds, pause, and Turbo transitions cleanly without duplicate loops or CPU leaks.
