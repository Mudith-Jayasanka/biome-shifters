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

git add -A
git commit -m "$ACTION"
git push
echo "[safe_git] Successfully committed and pushed: $ACTION"
