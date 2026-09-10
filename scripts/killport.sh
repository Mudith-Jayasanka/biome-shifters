#!/usr/bin/env bash
# Biome Shifters — Helper script to terminate processes listening on a port (default: 8080)

PORT=${1:-8080}
echo "🔍 Checking for processes on port ${PORT}..."

KILLED=0

# 1. Try fuser if available
if command -v fuser >/dev/null 2>&1; then
    PIDS=$(fuser "${PORT}/tcp" 2>/dev/null || true)
    if [ -n "$PIDS" ]; then
        echo "Found process via fuser. Killing port ${PORT}..."
        fuser -k -9 "${PORT}/tcp" 2>/dev/null || true
        KILLED=1
    fi
fi

# 2. Try lsof if available
if command -v lsof >/dev/null 2>&1; then
    PIDS=$(lsof -ti ":${PORT}" 2>/dev/null || true)
    if [ -n "$PIDS" ]; then
        echo "Killing PID(s) holding port ${PORT}: ${PIDS}"
        echo "$PIDS" | xargs -r kill -9 2>/dev/null || true
        KILLED=1
    fi
fi

# 3. Fallback: kill any python3 server.py if killing port 8080
if [ "$PORT" -eq 8080 ]; then
    SERVER_PIDS=$(pgrep -f "python3.*server\.py" 2>/dev/null || true)
    if [ -n "$SERVER_PIDS" ]; then
        echo "Found background server.py instance(s): ${SERVER_PIDS}. Terminating..."
        pkill -9 -f "python3.*server\.py" 2>/dev/null || true
        KILLED=1
    fi
fi

sleep 0.5

# Verify port release
if command -v lsof >/dev/null 2>&1; then
    STILL_OPEN=$(lsof -ti ":${PORT}" 2>/dev/null || true)
    if [ -n "$STILL_OPEN" ]; then
        echo "⚠️ Warning: Port ${PORT} still seems occupied by PID(s): ${STILL_OPEN}"
        exit 1
    fi
fi

echo "✅ Port ${PORT} is clear."

