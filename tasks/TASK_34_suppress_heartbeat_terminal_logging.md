# Task 34: Suppress Heartbeat Terminal Logging

## Status: `DONE`

## Goal
Silence repetitive heartbeat telemetry requests (`POST /api/cluster/heartbeat`) in the server terminal output to prevent log flooding while preserving terminal logging for other HTTP endpoints.

## Context
In cluster mode, active simulation instances dispatch periodic telemetry heartbeats every 1000ms via `POST /api/cluster/heartbeat`. Because `BiomeShiftersRequestHandler` inherits from Python's standard `http.server.SimpleHTTPRequestHandler` without overriding request logging, each heartbeat produces a console log line in `sys.stderr` every second. This pollutes the terminal and obscures important server messages, errors, and save operations.

## Files to Create/Modify
- `[MODIFY]` `server.py` — Override `log_message` in `BiomeShiftersRequestHandler` to suppress log output for `/api/cluster/heartbeat` requests.

## Detailed Specification

### `server.py`
In `BiomeShiftersRequestHandler`:
- Override `log_message(self, format, *args)`:
  - Check if `getattr(self, 'path', '')` contains `'/api/cluster/heartbeat'`, or if any argument in `args` contains `'/api/cluster/heartbeat'`.
  - If matched, return immediately without logging.
  - Otherwise, delegate to `super().log_message(format, *args)`.

```python
    def log_message(self, format, *args):
        """Suppress noisy periodic heartbeat telemetry logs from flooding the terminal."""
        if getattr(self, 'path', '') and '/api/cluster/heartbeat' in self.path:
            return
        if args and any('/api/cluster/heartbeat' in str(arg) for arg in args):
            return
        super().log_message(format, *args)
```

## Test Plan
1. **Automated Verification**:
   - Run a test script using `io.StringIO` to capture `sys.stderr` while simulating a `POST /api/cluster/heartbeat` request and a `GET /api/cluster/status` request against `BiomeShiftersRequestHandler`.
   - Verify that `sys.stderr` captures zero output for the heartbeat request and captures standard log output for the status request.
2. **Server Syntax and Runtime Check**:
   - Run `python3 -m py_compile server.py` to confirm syntax correctness.

## Acceptance Criteria
- [x] `POST /api/cluster/heartbeat` does not produce log lines in the server terminal output.
- [x] Non-heartbeat requests (e.g. `/api/cluster/status`, `/api/saves`, static files) continue to be logged normally.
- [x] `server.py` compiles and executes cleanly without regression.

