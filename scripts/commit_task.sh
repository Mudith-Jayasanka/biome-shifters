#!/usr/bin/env bash
set -e

# Self-healing: Check if .git/index is empty (0-byte) or corrupted
if [ -f .git/index ] && [ ! -s .git/index ]; then
  echo "[safe_git] Detected 0-byte index. Rebuilding index from HEAD..."
  rm -f .git/index
  git reset --quiet
  echo "[safe_git] Git index healed."
fi

# Verify .git is writable (prevents sandbox from truncating index)
if [ ! -w .git ]; then
  echo "[safe_git] ERROR: .git directory is not writable (running inside sandbox)." >&2
  echo "[safe_git] All git write commands must be run with BypassSandbox: true." >&2
  exit 1
fi

ACTION="$1"
if [ -z "$ACTION" ]; then
  echo "Usage: ./scripts/commit_task.sh \"TASK_XX: <commit message>\""
  echo "   or: ./scripts/commit_task.sh --heal"
  exit 1
fi

if [ "$ACTION" = "--heal" ]; then
  echo "[safe_git] Git index is healthy."
  git status -s
  exit 0
fi

# Update version.json with semantic version (MAJOR.MINOR.PATCH) and build count
python3 - "$ACTION" << 'EOF'
import json
import os
import sys
import subprocess
from datetime import datetime, timezone

action = sys.argv[1] if len(sys.argv) > 1 else "Task commit"
version_file = "version.json"
data = {
    "major": 1,
    "minor": 1,
    "patch": 0,
    "build": 10,
    "version": "1.1.0"
}

if os.path.exists(version_file):
    try:
        with open(version_file, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print(f"[safe_git] Warning reading version.json: {e}", file=sys.stderr)

try:
    count_str = subprocess.check_output(["git", "rev-list", "--count", "HEAD"], stderr=subprocess.DEVNULL).decode().strip()
    build_num = int(count_str) + 1
except Exception:
    build_num = int(data.get("build", 10)) + 1

override = os.environ.get("NEW_VERSION") or os.environ.get("VERSION")
if override:
    parts = override.strip().split(".")
    major = int(parts[0]) if len(parts) > 0 and parts[0].isdigit() else data.get("major", 1)
    minor = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else data.get("minor", 1)
    patch = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else 0
else:
    major = int(data.get("major", 1))
    minor = int(data.get("minor", 1))
    patch = int(data.get("patch", 0)) + 1

version_str = f"{major}.{minor}.{patch}"
updated = {
    "major": major,
    "minor": minor,
    "patch": patch,
    "build": build_num,
    "version": version_str,
    "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "action": action
}

with open(version_file, "w", encoding="utf-8") as f:
    json.dump(updated, f, indent=2)
    f.write("\n")

print(f"[safe_git] Updated version.json -> v{version_str} (build #{build_num})")
EOF

git add -A
git commit -m "$ACTION"
git push
echo "[safe_git] Successfully committed and pushed: $ACTION"

