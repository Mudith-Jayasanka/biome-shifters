# TASK_61: Flight Recorder Diagnostics System & Trace Analyzer

**Status**: `DONE`  
**Goal**: Build an end-to-end telemetry and diagnostics "Flight Recorder" that can capture network calls, UI interactions, DOM button state mutations, and worker IPC, exporting them to JSON and saving to the server for automated timeline analysis.  
**Context**: Complex distributed simulations involve concurrent state reconciliation across browser workers, main thread UI, and server endpoints. A flight recorder enables deterministic capture of intermittent bugs (such as toggle oscillations) with stack traces pinpointing the exact triggers.

---

## Files to Create/Modify

- `js/flight-recorder.js` `[NEW]` - Core telemetry recorder module with configurable interceptors for network, UI/DOM, worker IPC, and console.
- `server.py` `[MODIFY]` - Add `POST /api/debug/trace` endpoint to store trace recordings in `debug/`.
- `index.html` `[MODIFY]` - Add HUD record button and diagnostics configuration modal with category checkboxes.
- `style.css` `[MODIFY]` - Add styling for recording indicator, HUD button, and diagnostics modal.
- `js/main.js` `[MODIFY]` - Wire recording UI, timer updates, and flight recorder hooks.
- `scripts/analyze_trace.py` `[NEW]` - CLI timeline analyzer with automated ping-pong detection and error diagnosis.
- `tasks/README.md` `[MODIFY]` - Register TASK_61 in the catalog and dependency chain.

---

## Detailed Specification

1. **Recorder Core (`js/flight-recorder.js`)**:
   - Class `FlightRecorder`:
     - Configurable options: `network` (intercept `window.fetch`), `ui` (capture `click`/`input` + `MutationObserver` on tracked HUD/modal buttons), `worker` (intercept `worker.postMessage` / `onmessage`), `console` (intercept `warn`/`error`).
     - Stores events with relative timestamp (`relMs`), wall clock (`timestamp`), `category`, `action`, `payload`, and optional caller `stack`.
     - `start(options)`, `stop()`, `exportJson()`, `uploadToServer(apiBase)`.

2. **Backend Storage (`server.py`)**:
   - Ensure `debug/` directory exists.
   - Endpoint `POST /api/debug/trace`:
     - Reads JSON payload, writes to `debug/trace_<timestamp>.json` and symlinks/copies to `debug/trace_latest.json`.
     - Returns `{ status: 'ok', filename: ..., eventCount: ... }`.

3. **User Interface (`index.html` & `style.css`)**:
   - HUD button `#btn-flight-recorder` (`⏺️ Trace`). When recording, pulses with a red dot.
   - Modal `#modal-flight-recorder`:
     - Checkbox options for the 4 recording channels.
     - Live status badge: `⏺️ REC [00:12] (45 events)`.
     - Toggle start/stop button and direct download link.

4. **UI Integration (`js/main.js`)**:
   - Bind modal open/close, start/stop recording.
   - Forward worker instances to `FlightRecorder` when workers are spawned or active.

5. **Trace Analyzer Script (`scripts/analyze_trace.py`)**:
   - Loads trace JSON (`debug/trace_latest.json` by default).
   - Formats a chronological event timeline.
   - Heuristics:
     - Detects oscillation loops: checks if any DOM element or state toggles between states within 2 seconds.
     - Detects network HTTP errors (>400).
     - Identifies the caller stack that performed unexpected DOM mutations.

---

## Test Plan

1. Verify server endpoint `POST /api/debug/trace` writes JSON files to `debug/`.
2. Verify `analyze_trace.py` parses trace files and outputs formatted timelines.
3. Open browser, click `⏺️ Trace` button, select categories, start recording, click buttons, stop recording, and verify JSON export and upload.
4. Verify `node --check` and `python3 -m py_compile` pass on all files.

---

## Acceptance Criteria

- [x] `FlightRecorder` intercepts network, UI events, DOM mutations, and worker IPC without throwing errors.
- [x] In-app modal allows toggling recording channels and shows live event counter.
- [x] Trace is exported to browser download and saved to `debug/` on the server.
- [x] `scripts/analyze_trace.py` decodes the log into a readable chronological timeline.
- [x] All unit and syntax checks pass.
