# Task 53: Build Version Generator, Cache-Busting Headers & Version Endpoints

## Status
`DONE`

---

## Goal
Implement automated build version generation on Git commits via `./scripts/commit_task.sh` following the `MAJOR.MINOR.PATCH` (e.g. `1.1.1`) format starting at baseline `1.1.0`, serve build version metadata and `/api/version` endpoints from `server.py`, prevent stale browser caching of ES6 modules via `Cache-Control` headers, and embed the current server build version inside cluster heartbeat responses.

---

## Context
As the simulation is updated across the LAN cluster, client browsers (contributor machines or host tabs) frequently run out-of-date JavaScript code if they do not perform a hard reload. To detect version mismatches and coordinate cluster-wide synchronization:
1. Every commit pushed to Git must embed an unambiguous, sequential semantic build version (`MAJOR.MINOR.PATCH`, starting at `1.1.0` baseline) and timestamp (`version.json`).
2. `server.py` must expose this build version via `/api/version` and in `/api/cluster/heartbeat` telemetry responses so clients learn of updates with zero added network latency.
3. `server.py` must send `Cache-Control: no-cache, must-revalidate` for static `.js`, `.html`, and `.css` files so browsers never hold onto obsolete cached versions when reloaded.

---

## Gaps Identified in Existing Implementation
1. **No Static Build Version Tracking**: The repo has no auto-generated build file or static version record.
2. **Aggressive Browser Caching of ES6 Modules**: `SimpleHTTPRequestHandler` serves files with default caching headers, meaning browsers keep stale `.js` files cached in memory/disk across normal page reloads.
3. **Absence of Version Broadcast**: The cluster heartbeat API (`/api/cluster/heartbeat` and `/api/cluster/status`) communicates simulation state (`isPaused`, `speed`, `migrationEpoch`), but contains no code version information, leaving clients oblivious to new software releases.

---

## Files to Create / Modify
- `[MODIFY]` `scripts/commit_task.sh` — Before staging and committing, generate/update `version.json` with auto-incremented SemVer `patch` (`1.1.x`), build commit count, ISO timestamp, and commit action description.
- `[NEW]` `version.json` — Initial build version record file (`1.1.0` baseline).
- `[MODIFY]` `server.py` — Load `version.json` (with dynamic fallback), add `GET /api/version`, add `Cache-Control: no-cache, must-revalidate` to static files, and broadcast `buildVersion` in `/api/cluster/status`, `/api/cluster/join`, and `/api/cluster/heartbeat`.

---

## Detailed Specification

### 1. Build Version Generation: `scripts/commit_task.sh`
Before `git add -A`, execute an inline Python snippet to read existing `version.json`, auto-increment patch (`1.1.0` -> `1.1.1`, etc.), calculate build count via `git rev-list --count HEAD`, and write updated JSON:
```bash
python3 - <<EOF
import json, os, subprocess
from datetime import datetime, timezone

version_file = "version.json"
data = {"major": 1, "minor": 1, "patch": 0, "build": 10, "version": "1.1.0"}
if os.path.exists(version_file):
    try:
        with open(version_file, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        pass

try:
    count_str = subprocess.check_output(["git", "rev-list", "--count", "HEAD"], stderr=subprocess.DEVNULL).decode().strip()
    build_num = int(count_str) + 1
except Exception:
    build_num = data.get("build", 10) + 1

override = os.environ.get("NEW_VERSION") or os.environ.get("VERSION")
if override:
    parts = override.strip().split(".")
    major = int(parts[0]) if len(parts) > 0 and parts[0].isdigit() else data.get("major", 1)
    minor = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else data.get("minor", 1)
    patch = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else 0
else:
    major = data.get("major", 1)
    minor = data.get("minor", 1)
    patch = data.get("patch", 0) + 1

version_str = f"{major}.{minor}.{patch}"
updated = {
    "major": major,
    "minor": minor,
    "patch": patch,
    "build": build_num,
    "version": version_str,
    "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "action": "$ACTION"
}
with open(version_file, "w", encoding="utf-8") as f:
    json.dump(updated, f, indent=2)
    f.write("\n")
print(f"[safe_git] Updated version.json -> v{version_str} (build #{build_num})")
EOF
```

### 2. Version Storage & Serving: `server.py`
- Add a helper method `get_build_version()`:
  ```python
  VERSION_FILE = BASE_DIR / "version.json"
  
  def get_build_version() -> dict:
      if VERSION_FILE.exists():
          try:
              with open(VERSION_FILE, 'r', encoding='utf-8') as f:
                  return json.load(f)
          except Exception:
              pass
      return {
          "major": 1,
          "minor": 1,
          "patch": 0,
          "build": 10,
          "version": "1.1.0",
          "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
          "action": "Baseline"
      }
  ```
- Endpoint `GET /api/version`:
  Returns `_send_json(200, get_build_version())`.
- Cluster endpoints:
  - In `_handle_cluster_status()`: include `"buildVersion": get_build_version()`.
  - In `_handle_cluster_join()`: include `"buildVersion": get_build_version()`.
  - In `ClusterManager.heartbeat()`: return `"buildVersion": get_build_version()`.
- Static file caching header:
  In `BiomeShiftersRequestHandler`:
  ```python
  def end_headers(self):
      # Enforce revalidation for all static frontend assets
      if not any(b'cache-control' in h.lower() for h in getattr(self, '_headers_buffer', [])):
          self.send_header('Cache-Control', 'no-cache, must-revalidate')
      super().end_headers()
  ```

---

## Test Plan
1. Run `./scripts/commit_task.sh --heal` or verify `version.json` generation.
2. Query `GET http://localhost:8080/api/version` and verify JSON response with `major`, `minor`, `patch`, `build`, `version`, `timestamp`.
3. Query `GET http://localhost:8080/api/cluster/status` and verify `buildVersion` object is present.
4. Verify HTTP response headers on `GET /js/main.js` include `Cache-Control: no-cache, must-revalidate`.

---

## Acceptance Criteria
- [x] `scripts/commit_task.sh` generates/updates `version.json` before commit.
- [x] `version.json` adheres to `MAJOR.MINOR.PATCH` format (e.g. `1.1.1`), containing `major`, `minor`, `patch`, `build`, `version`, `timestamp`, and `action`.
- [x] `server.py` serves `/api/version` returning full version object.
- [x] `server.py` includes `buildVersion` in `/api/cluster/status`, `/api/cluster/join`, and `/api/cluster/heartbeat`.
- [x] Static asset responses (`.js`, `.html`, `.css`) include `Cache-Control: no-cache, must-revalidate`.


