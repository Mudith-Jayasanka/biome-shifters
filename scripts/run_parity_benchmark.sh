#!/usr/bin/env bash
# Biome Shifters — Automated CPU vs. GPU Parity Benchmark Harness
# Executes test_parity.html in headless browser or instructs manual load,
# then runs scripts/compare_cpu_gpu.py to evaluate dynamics divergence.

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

PORT=8080
TICKS=${1:-300}
SEED=${2:-1337}
URL="http://localhost:${PORT}/test_parity.html?ticks=${TICKS}&seed=${SEED}&autoExit=true"

# 1. Ensure server.py is running
if ! python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:${PORT}/api/version', timeout=1)" >/dev/null 2>&1; then
    echo "⚡ Starting background server.py on port ${PORT}..."
    python3 server.py >/dev/null 2>&1 &
    SERVER_PID=$!
    sleep 1
fi

BEFORE_MTIME=0
if [ -f "debug/trace_latest.json" ]; then
    BEFORE_MTIME=$(stat -c %Y "debug/trace_latest.json" 2>/dev/null || echo 0)
fi

# 2. Attempt headless browser launch
CHROME_BIN=$(which google-chrome google-chrome-stable chromium chromium-browser brave-browser 2>/dev/null | head -n 1 || true)

NEW_CAPTURED=0

if [ -n "$CHROME_BIN" ]; then
    echo "🚀 Running headless WebGPU benchmark (${CHROME_BIN})..."
    echo "   URL: ${URL}"
    "$CHROME_BIN" \
        --headless=new \
        --no-sandbox \
        --disable-gpu-sandbox \
        --enable-unsafe-webgpu \
        --use-angle=vulkan \
        --enable-features=Vulkan,DefaultANGLEVulkan \
        "${URL}" >/dev/null 2>&1 &
    BROWSER_PID=$!

    # Wait up to 20 seconds for new trace_latest.json
    echo "⏳ Waiting for benchmark execution to complete..."
    for i in $(seq 1 40); do
        sleep 0.5
        if [ -f "debug/trace_latest.json" ]; then
            CUR_MTIME=$(stat -c %Y "debug/trace_latest.json" 2>/dev/null || echo 0)
            if [ "$CUR_MTIME" -gt "$BEFORE_MTIME" ]; then
                echo "✓ New trace captured!"
                NEW_CAPTURED=1
                break
            fi
        fi
    done
    kill $BROWSER_PID 2>/dev/null || true
fi

# If headless didn't capture, wait for manual browser run
if [ "$NEW_CAPTURED" -eq 0 ]; then
    echo ""
    echo "ℹ️  Headless browser did not produce a trace (or WebGPU headless is disabled by hardware)."
    echo "👉 Please open the following URL in your WebGPU-capable browser to run the benchmark:"
    echo "   ${URL}"
    echo ""
    echo "⏳ Waiting for trace upload from browser (press Ctrl+C to cancel)..."
    for i in $(seq 1 120); do
        sleep 1
        if [ -f "debug/trace_latest.json" ]; then
            CUR_MTIME=$(stat -c %Y "debug/trace_latest.json" 2>/dev/null || echo 0)
            if [ "$CUR_MTIME" -gt "$BEFORE_MTIME" ]; then
                echo "✓ New trace captured from browser!"
                NEW_CAPTURED=1
                break
            fi
        fi
    done
fi

# 3. Analyze trace
if [ "$NEW_CAPTURED" -eq 1 ]; then
    python3 scripts/compare_cpu_gpu.py debug/trace_latest.json
else
    echo "❌ Error: No new trace was captured. Benchmark aborted."
    exit 1
fi
