#!/usr/bin/env python3
"""
Biome Shifters — Flight Recorder Trace Analyzer
Decodes black-box JSON traces captured by FlightRecorder, prints a unified
chronological timeline, and automatically flags state oscillations, 404s, and UI ping-pongs.
"""

import sys
import os
import json
import glob
from pathlib import Path

# ANSI colors for terminal output
RESET = "\033[0m"
BOLD = "\033[1m"
DIM = "\033[2m"
RED = "\033[31m"
GREEN = "\033[32m"
YELLOW = "\033[33m"
BLUE = "\033[34m"
MAGENTA = "\033[35m"
CYAN = "\033[36m"
WHITE = "\033[37m"

CATEGORY_COLORS = {
    'system': WHITE,
    'network': CYAN,
    'ui': GREEN,
    'mutation': MAGENTA,
    'worker': BLUE,
    'console': RED,
    'state': YELLOW
}


def find_trace_file(arg_path=None) -> Path:
    if arg_path:
        p = Path(arg_path)
        if p.exists():
            return p
        print(f"{RED}Error: File not found: {arg_path}{RESET}", file=sys.stderr)
        sys.exit(1)

    # Check debug/trace_latest.json
    base_dir = Path(__file__).resolve().parent.parent
    latest = base_dir / "debug" / "trace_latest.json"
    if latest.exists():
        return latest

    # Check debug/*.json
    debug_dir = base_dir / "debug"
    if debug_dir.exists():
        files = sorted(debug_dir.glob("trace_*.json"), key=os.path.getmtime, reverse=True)
        if files:
            return files[0]

    print(f"{RED}Error: No trace files found in debug/ directory.{RESET}", file=sys.stderr)
    print("Record a session first in the browser via the ⏺️ Trace button.", file=sys.stderr)
    sys.exit(1)


def format_payload_summary(category: str, action: str, p: dict) -> str:
    if not isinstance(p, dict):
        return str(p)

    if category == 'network':
        if action == 'FETCH_REQUEST':
            body_str = f" body={json.dumps(p.get('body'))}" if p.get('body') else ""
            return f"{BOLD}{p.get('method', 'GET')}{RESET} {p.get('url', '')}{body_str}"
        elif action == 'FETCH_RESPONSE':
            status = p.get('status', 0)
            s_color = GREEN if status < 400 else RED
            body_preview = ""
            if p.get('body'):
                b = p['body']
                if isinstance(b, dict):
                    # Highlight interesting cluster/gpu flags
                    highlights = []
                    for k in ('gpuEnabled', 'isPaused', 'speed', 'isTurbo', 'status'):
                        if k in b:
                            highlights.append(f"{k}:{b[k]}")
                    if 'globalState' in b and isinstance(b['globalState'], dict):
                        for k in ('gpuEnabled', 'isPaused'):
                            if k in b['globalState']:
                                highlights.append(f"global.{k}:{b['globalState'][k]}")
                    body_preview = " {" + ", ".join(highlights) + "}" if highlights else f" {str(b)[:80]}"
                else:
                    body_preview = f" {str(b)[:80]}"
            return f"{s_color}{status} {p.get('statusText', '')}{RESET} ({p.get('durationMs', 0)}ms){body_preview}"
        elif action == 'FETCH_ERROR':
            return f"{RED}FAILED ({p.get('durationMs', 0)}ms): {p.get('error')}{RESET}"

    elif category == 'ui':
        text = f" \"{p.get('text')}\"" if p.get('text') else ""
        sel = p.get('selector', '')
        return f"{action}: {BOLD}{sel}{RESET}{text}"

    elif category == 'mutation':
        target = p.get('targetId') or 'element'
        text = f" text=\"{p.get('text')}\"" if p.get('text') else ""
        attr = f" [{p.get('attributeName')}='{p.get('oldValue')}']" if p.get('attributeName') else ""
        return f"Target: {BOLD}#{target}{RESET}{attr}{text}"

    elif category == 'worker':
        worker = p.get('worker', 'worker')
        msg_type = p.get('type', 'MSG')
        data = p.get('data', {})
        data_preview = ""
        if isinstance(data, dict):
            parts = [f"{k}={v}" for k, v in data.items() if k not in ('grid', 'telemetry', 'agents')][:4]
            data_preview = " (" + ", ".join(parts) + ")" if parts else ""
        return f"[{worker}] {action} -> {BOLD}{msg_type}{RESET}{data_preview}"

    elif category == 'console':
        msg = p.get('message', '')
        stack = f"\n      {DIM}Stack: {p.get('stack')}{RESET}" if p.get('stack') else ""
        return f"{msg}{stack}"

    elif category == 'state':
        return f"{p.get('state')}: {RED}{p.get('from')}{RESET} -> {GREEN}{p.get('to')}{RESET}"

    elif category == 'system':
        return json.dumps(p)

    return json.dumps(p)[:120]


def analyze_oscillations(events: list):
    """Detect alternating UI button text or cluster state changes within short windows."""
    button_states = {} # target -> [(relMs, text)]
    oscillations = []

    for evt in events:
        cat = evt.get('category')
        p = evt.get('payload', {})
        rel = evt.get('relMs', 0.0)

        # Track button mutations
        if cat == 'mutation' and p.get('text'):
            target = p.get('targetId') or 'btn'
            if target not in button_states:
                button_states[target] = []
            history = button_states[target]
            text = p.get('text', '')
            if not history or history[-1][1] != text:
                history.append((rel, text))
                # Check for ping-pong (A -> B -> A in <= 3 seconds)
                if len(history) >= 3:
                    t0, s0 = history[-3]
                    t1, s1 = history[-2]
                    t2, s2 = history[-1]
                    if s0 == s2 and s0 != s1 and (t2 - t0) <= 3500:
                        oscillations.append({
                            'target': target,
                            'pattern': f"{s0} -> {s1} -> {s2}",
                            'duration': t2 - t0,
                            'endRelMs': t2
                        })

    return oscillations


def analyze_errors(events: list):
    errors = []
    for evt in events:
        cat = evt.get('category')
        act = evt.get('action')
        p = evt.get('payload', {})
        if cat == 'console' and act == 'CONSOLE_ERROR':
            errors.append(f"[Console Error @ {evt.get('relMs')}ms]: {p.get('message')}")
        elif cat == 'network' and act == 'FETCH_RESPONSE' and p.get('status', 0) >= 400:
            errors.append(f"[HTTP {p.get('status')} @ {evt.get('relMs')}ms]: {p.get('method')} {p.get('url')}")
        elif cat == 'network' and act == 'FETCH_ERROR':
            errors.append(f"[Network Failure @ {evt.get('relMs')}ms]: {p.get('method')} {p.get('url')} - {p.get('error')}")
    return errors


def main():
    target_file = find_trace_file(sys.argv[1] if len(sys.argv) > 1 else None)
    print(f"{BOLD}🔍 Analyzing Flight Trace:{RESET} {CYAN}{target_file}{RESET}\n")

    try:
        with open(target_file, 'r', encoding='utf-8') as f:
            trace = json.load(f)
    except Exception as e:
        print(f"{RED}Failed to read trace file: {e}{RESET}", file=sys.stderr)
        sys.exit(1)

    meta = trace.get('metadata', {})
    events = trace.get('events', [])

    duration_s = (meta.get('durationMs', 0) or 0) / 1000.0
    print(f"  📅 Started At:  {meta.get('startedAt')}")
    print(f"  ⏱️  Duration:    {duration_s:.2f}s")
    print(f"  📊 Event Count: {meta.get('eventCount', len(events))} events")
    print(f"  ⚙️  Options:     {json.dumps(meta.get('options', {}))}")
    print("=" * 80)

    # 1. Timeline
    print(f"\n{BOLD}📜 Chronological Event Timeline:{RESET}")
    for evt in events:
        rel_s = evt.get('relMs', 0.0) / 1000.0
        cat = evt.get('category', 'unknown')
        act = evt.get('action', '')
        p = evt.get('payload', {})

        color = CATEGORY_COLORS.get(cat, WHITE)
        prefix = f"[{cat[:3].upper()}]"
        summary = format_payload_summary(cat, act, p)

        time_str = f"+{rel_s:06.3f}s"
        print(f"{DIM}{time_str}{RESET} {color}{prefix:5s}{RESET} {summary}")

    print("\n" + "=" * 80)

    # 2. Automated Diagnostics
    oscillations = analyze_oscillations(events)
    errors = analyze_errors(events)

    print(f"\n{BOLD}🔬 Automated Diagnostics Report:{RESET}")
    if oscillations:
        print(f"\n{RED}{BOLD}🚨 [ALERT] State Oscillation Ping-Pong Detected ({len(oscillations)} occurrences):{RESET}")
        for osc in oscillations:
            print(f"   • Element: {BOLD}#{osc['target']}{RESET}")
            print(f"     Pattern:  {YELLOW}{osc['pattern']}{RESET}")
            print(f"     Time:     at +{osc['endRelMs']/1000.0:.3f}s (cycle duration: {osc['duration']:.0f}ms)")
    else:
        print(f"\n{GREEN}✅ No rapid state oscillations detected.{RESET}")

    if errors:
        print(f"\n{RED}{BOLD}⚠️ [ALERT] Detected Errors/Failures ({len(errors)} occurrences):{RESET}")
        for err in errors:
            print(f"   • {RED}{err}{RESET}")
    else:
        print(f"{GREEN}✅ No HTTP or console errors recorded.{RESET}")

    print("\n" + "=" * 80 + "\n")


if __name__ == '__main__':
    main()

