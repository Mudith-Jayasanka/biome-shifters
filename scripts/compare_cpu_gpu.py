#!/usr/bin/env python3
"""
Biome Shifters — Simulation Dynamics Parity Analyzer
Compares granular CPU and GPU simulation dynamics from FlightRecorder traces.
Analyzes action distributions, collision rates, graze efficiencies, caloric balances,
and population/biomass equilibrium.
"""

import sys
import os
import json
import math
from pathlib import Path

# ANSI colors for terminal output
RESET = "\033[0m"
BOLD = "\033[1m"
DIM = "\033[2m"
RED = "\033[31m"
GREEN = "\033[32m"
YELLOW = "\033[33m"
BLUE = "\033[34m"
CYAN = "\033[36m"
WHITE = "\033[37m"

def mean_std(values):
    if not values:
        return 0.0, 0.0
    n = len(values)
    m = sum(values) / n
    variance = sum((x - m) ** 2 for x in values) / max(1, n - 1)
    return m, math.sqrt(variance)

def load_traces(args):
    files = []
    if len(args) > 1:
        for arg in args[1:]:
            p = Path(arg)
            if p.exists():
                files.append(p)
            else:
                print(f"{RED}Error: File not found: {arg}{RESET}", file=sys.stderr)
                sys.exit(1)
    else:
        # Check default debug/trace_latest.json
        base_dir = Path(__file__).resolve().parent.parent
        latest = base_dir / "debug" / "trace_latest.json"
        if latest.exists():
            files.append(latest)
        else:
            debug_dir = base_dir / "debug"
            if debug_dir.exists():
                traces = sorted(debug_dir.glob("trace_*.json"), key=os.path.getmtime, reverse=True)
                if traces:
                    files.append(traces[0])

    if not files:
        print(f"{RED}Error: No trace file provided and none found in debug/.{RESET}", file=sys.stderr)
        print("Usage: python3 scripts/compare_cpu_gpu.py [trace1.json] [trace2.json]", file=sys.stderr)
        sys.exit(1)

    all_events = []
    for f in files:
        try:
            with open(f, 'r', encoding='utf-8') as fh:
                data = json.load(fh)
                events = data.get('events', [])
                all_events.extend(events)
        except Exception as e:
            print(f"{RED}Error reading {f}: {e}{RESET}", file=sys.stderr)
            sys.exit(1)

    return files, all_events

def extract_dynamics(events):
    cpu_snapshots = []
    gpu_snapshots = []

    for ev in events:
        if ev.get('category') == 'sim_dynamics' or ev.get('action') == 'DYNAMICS_SNAPSHOT':
            payload = ev.get('payload', {})
            engine = payload.get('engine', '').lower()
            if engine == 'cpu':
                cpu_snapshots.append(payload)
            elif engine == 'gpu':
                gpu_snapshots.append(payload)
            else:
                # If engine not tagged, infer or check worker label
                lbl = ev.get('worker', '')
                if 'gpu' in lbl.lower():
                    gpu_snapshots.append(payload)
                else:
                    cpu_snapshots.append(payload)

    return cpu_snapshots, gpu_snapshots

def compute_engine_metrics(snapshots):
    if not snapshots:
        return None

    # Time series
    populations = [s.get('population', 0) for s in snapshots]
    energies = [s.get('avgEnergy', 0) for s in snapshots]
    biomasses = [s.get('totalBiomass', 0) for s in snapshots]
    max_gens = [s.get('maxGen', 1) for s in snapshots]
    avg_gens = [s.get('avgGen', 1) for s in snapshots]

    # Aggregates across snapshots
    total_actions = {
        'idle': 0, 'move': 0, 'moveCollisions': 0,
        'graze': 0, 'grazeFailures': 0,
        'digTrench': 0, 'moundEarth': 0,
        'emitScent': 0, 'sowSeeds': 0, 'sowFailures': 0
    }
    
    total_births = 0
    total_starvations = 0
    total_age_deaths = 0
    total_cal_graze = 0.0
    total_cal_roots = 0.0
    total_cal_metabolism = 0.0
    total_cal_movement = 0.0

    for s in snapshots:
        total_births += s.get('births', 0)
        total_starvations += s.get('deathsStarvation', 0)
        total_age_deaths += s.get('deathsAge', 0)
        total_cal_graze += s.get('caloriesGainedGraze', 0)
        total_cal_roots += s.get('caloriesGainedRoots', 0)
        total_cal_metabolism += s.get('caloriesBurnedMetabolism', 0)
        total_cal_movement += s.get('caloriesBurnedMovement', 0)

        acts = s.get('actions', {})
        for k in total_actions:
            total_actions[k] += acts.get(k, 0)

    # Action frequencies (% of total attempts)
    grand_total_actions = sum(total_actions[k] for k in ['idle', 'move', 'graze', 'digTrench', 'moundEarth', 'emitScent', 'sowSeeds'])
    action_pcts = {}
    for k in ['idle', 'move', 'graze', 'digTrench', 'moundEarth', 'emitScent', 'sowSeeds']:
        action_pcts[k] = (total_actions[k] / max(1, grand_total_actions)) * 100.0

    move_attempts = total_actions['move']
    move_collision_rate = (total_actions['moveCollisions'] / max(1, move_attempts)) * 100.0

    graze_attempts = total_actions['graze']
    graze_success_rate = ((graze_attempts - total_actions['grazeFailures']) / max(1, graze_attempts)) * 100.0

    sow_attempts = total_actions['sowSeeds']
    sow_success_rate = ((sow_attempts - total_actions['sowFailures']) / max(1, sow_attempts)) * 100.0

    total_deaths = total_starvations + total_age_deaths
    starvation_rate = (total_starvations / max(1, total_deaths)) * 100.0

    total_cal_in = total_cal_graze + total_cal_roots
    total_cal_out = total_cal_metabolism + total_cal_movement
    caloric_ratio = (total_cal_in / max(0.001, total_cal_out))

    mean_pop, std_pop = mean_std(populations)
    mean_bio, std_bio = mean_std(biomasses)
    mean_energy, _ = mean_std(energies)
    mean_max_gen, _ = mean_std(max_gens)
    mean_avg_gen, _ = mean_std(avg_gens)

    return {
        'snapshot_count': len(snapshots),
        'mean_pop': mean_pop,
        'std_pop': std_pop,
        'mean_bio': mean_bio,
        'std_bio': std_bio,
        'mean_energy': mean_energy,
        'mean_max_gen': mean_max_gen,
        'mean_avg_gen': mean_avg_gen,
        'action_pcts': action_pcts,
        'move_collision_rate': move_collision_rate,
        'graze_success_rate': graze_success_rate,
        'sow_success_rate': sow_success_rate,
        'starvation_rate': starvation_rate,
        'caloric_ratio': caloric_ratio,
        'total_actions': grand_total_actions,
        'total_births': total_births,
        'total_deaths': total_deaths
    }

def print_comparison_table(cpu, gpu):
    print("\n" + "=" * 84)
    print(f"{BOLD}{CYAN}  BIOME SHIFTERS — CPU vs GPU SIMULATION DYNAMICS COMPARISON{RESET}")
    print("=" * 84)

    header = f"{'Metric':<32} | {'CPU Engine':<16} | {'GPU Engine':<16} | {'Delta %':<12} | Status"
    print(header)
    print("-" * 84)

    divergence_count = 0

    def row(label, cpu_val, gpu_val, is_pct=False, threshold=15.0):
        nonlocal divergence_count
        cpu_str = f"{cpu_val:.1f}%" if is_pct else f"{cpu_val:.2f}"
        gpu_str = f"{gpu_val:.1f}%" if is_pct else f"{gpu_val:.2f}"

        if cpu_val == 0 and gpu_val == 0:
            delta_str = "0.0%"
            status = f"{GREEN}MATCH{RESET}"
        elif cpu_val == 0:
            delta_str = "N/A"
            status = f"{YELLOW}DIFF{RESET}"
        else:
            delta = ((gpu_val - cpu_val) / abs(cpu_val)) * 100.0
            delta_str = f"{delta:+.1f}%"
            if abs(delta) > threshold:
                divergence_count += 1
                status = f"{RED}WARN (> {threshold:.0f}%){RESET}"
            else:
                status = f"{GREEN}PASS{RESET}"

        print(f"{label:<32} | {cpu_str:<16} | {gpu_str:<16} | {delta_str:<12} | {status}")

    # Population & Ecosystem
    row("Mean Population", cpu['mean_pop'], gpu['mean_pop'], threshold=25.0)
    row("Mean Biomass", cpu['mean_bio'], gpu['mean_bio'], threshold=25.0)
    row("Average Agent Energy", cpu['mean_energy'], gpu['mean_energy'], threshold=20.0)
    row("Max Generation", cpu['mean_max_gen'], gpu['mean_max_gen'], threshold=30.0)
    row("Average Generation", cpu['mean_avg_gen'], gpu['mean_avg_gen'], threshold=30.0)

    print("-" * 84)
    print(f"{BOLD}Action Distribution (% of Total Decisions):{RESET}")

    for act in ['idle', 'move', 'graze', 'digTrench', 'moundEarth', 'emitScent', 'sowSeeds']:
        c_pct = cpu['action_pcts'].get(act, 0.0)
        g_pct = gpu['action_pcts'].get(act, 0.0)
        row(f"  Action: {act}", c_pct, g_pct, is_pct=True, threshold=20.0)

    print("-" * 84)
    print(f"{BOLD}Physical Mechanics & Success Rates:{RESET}")
    row("Move Collision Rate", cpu['move_collision_rate'], gpu['move_collision_rate'], is_pct=True, threshold=25.0)
    row("Graze Success Rate", cpu['graze_success_rate'], gpu['graze_success_rate'], is_pct=True, threshold=20.0)
    row("Sow Success Rate", cpu['sow_success_rate'], gpu['sow_success_rate'], is_pct=True, threshold=25.0)

    print("-" * 84)
    print(f"{BOLD}Sample Counts:{RESET}")
    print(f"  CPU Dynamics Snapshots: {cpu['snapshot_count']}  (Total Decisions: {cpu['total_actions']:,})")
    print(f"  GPU Dynamics Snapshots: {gpu['snapshot_count']}  (Total Decisions: {gpu['total_actions']:,})")
    print("=" * 84)

    if divergence_count == 0:
        print(f"{BOLD}{GREEN}✓ PARITY VERIFIED: CPU and GPU dynamics match within parity tolerance thresholds.{RESET}\n")
    else:
        print(f"{BOLD}{YELLOW}⚠️  DIVERGENCE DETECTED: {divergence_count} metric(s) deviated by > tolerance threshold.{RESET}")
        print("Review the marked metrics above to fine-tune WGSL shader constants.\n")

def main():
    files, events = load_traces(sys.argv)
    print(f"{BOLD}{WHITE}Loaded {len(events)} events from {len(files)} trace file(s).{RESET}")

    cpu_snaps, gpu_snaps = extract_dynamics(events)
    print(f"Found {len(cpu_snaps)} CPU dynamics snapshots and {len(gpu_snaps)} GPU dynamics snapshots.")

    if not cpu_snaps and not gpu_snaps:
        print(f"{RED}Error: No sim_dynamics snapshots found in trace.{RESET}")
        print("Ensure 'Sim Dynamics' channel is enabled in Flight Recorder before tracing.", file=sys.stderr)
        sys.exit(1)

    if not cpu_snaps:
        print(f"{YELLOW}Warning: Only GPU snapshots found. Showing GPU summary only.{RESET}")
        gpu_m = compute_engine_metrics(gpu_snaps)
        print(json.dumps(gpu_m, indent=2))
        return

    if not gpu_snaps:
        print(f"{YELLOW}Warning: Only CPU snapshots found. Showing CPU summary only.{RESET}")
        cpu_m = compute_engine_metrics(cpu_snaps)
        print(json.dumps(cpu_m, indent=2))
        return

    cpu_metrics = compute_engine_metrics(cpu_snaps)
    gpu_metrics = compute_engine_metrics(gpu_snaps)

    print_comparison_table(cpu_metrics, gpu_metrics)

if __name__ == '__main__':
    main()

