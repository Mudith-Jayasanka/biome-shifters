#!/usr/bin/env python3
"""
Fast, token-efficient telemetry extractor for Biome Shifters saves.
Usage:
    python3 scripts/extract_save_stats.py                  # inspects latest save in saves/
    python3 scripts/extract_save_stats.py <path-to-json>   # inspects specified save
    python3 scripts/extract_save_stats.py --list           # lists recent 10 saves
"""

import sys
import os
import glob
import json
import time

SAVES_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'saves')

def get_latest_save():
    pattern = os.path.join(SAVES_DIR, '*.json')
    files = glob.glob(pattern)
    if not files:
        return None
    return max(files, key=os.path.getmtime)

def list_saves(limit=10):
    pattern = os.path.join(SAVES_DIR, '*.json')
    files = sorted(glob.glob(pattern), key=os.path.getmtime, reverse=True)
    if not files:
        print(f"No saves found in {SAVES_DIR}")
        return

    print(f"{'Filename':<48} {'Size (MB)':<10} {'Modified'}")
    print("-" * 75)
    for f in files[:limit]:
        fname = os.path.basename(f)
        size_mb = os.path.getsize(f) / (1024 * 1024)
        mtime = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(os.path.getmtime(f)))
        print(f"{fname:<48} {size_mb:<10.2f} {mtime}")

def median(lst):
    if not lst:
        return 0
    s = sorted(lst)
    n = len(s)
    mid = n // 2
    return (s[mid] if n % 2 != 0 else (s[mid - 1] + s[mid]) / 2)

def extract_stats(filepath):
    if not os.path.exists(filepath):
        print(f"File not found: {filepath}")
        sys.exit(1)

    fname = os.path.basename(filepath)
    size_mb = os.path.getsize(filepath) / (1024 * 1024)
    mtime = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(os.path.getmtime(filepath)))

    with open(filepath, 'r') as f:
        data = json.load(f)

    is_multi = data.get('isMultiIsland', False) or ('islands' in data)

    print(f"\n=== SAVE TELEMETRY: {fname} ({size_mb:.1f} MB | {mtime}) ===")

    if is_multi:
        islands = data.get('islands', [])
        epoch = data.get('migrationEpoch', 0)
        migrants = data.get('totalMigrantsExchanged', 0)
        total_pop = sum(len(isl.get('agents', [])) for isl in islands)
        total_ticks = max((isl.get('tick', 0) for isl in islands), default=0)

        print(f"Mode: Multi-Island ({len(islands)} islands) | Max Tick: {total_ticks:,} | Total Pop: {total_pop}")
        print(f"Migration: Epoch {epoch:,} | Migrants Exchanged: {migrants:,}")
        print()
        print(f"{'Isl':<4} {'Tick':<8} {'Pop':<5} {'MaxGen':<8} {'AllTime':<8} {'AvgGen':<7} {'MedAge':<7} {'MaxAge':<7} {'MedE':<6} {'Biomass':<9} {'Rich%':<6}")
        print("-" * 84)

        all_time_top_gen = 0
        top_gen_island = -1

        for idx, isl in enumerate(islands):
            tick = isl.get('tick', 0)
            agents = isl.get('agents', [])
            stats = isl.get('stats', {})
            pop = len(agents)

            gens = [a.get('generation', 1) for a in agents]
            ages = [a.get('age', 0) for a in agents]
            energies = [a.get('energy', 0) for a in agents]

            cur_max_gen = max(gens) if gens else 0
            avg_gen = (sum(gens) / len(gens)) if gens else 0.0
            all_time_gen = stats.get('generationMaxAllTime', stats.get('maxGeneration', cur_max_gen))

            if all_time_gen > all_time_top_gen:
                all_time_top_gen = all_time_gen
                top_gen_island = idx

            med_age = median(ages)
            max_age = max(ages) if ages else 0
            med_energy = median(energies)

            # Biomass stats
            grid = isl.get('grid', {})
            bio_list = grid.get('biomass', [])
            total_bio = sum(bio_list)
            rich_cells = sum(1 for b in bio_list if b > 0.5)
            rich_pct = (rich_cells / len(bio_list) * 100) if bio_list else 0.0

            print(f"{idx:<4} {tick:<8} {pop:<5} {cur_max_gen:<8} {all_time_gen:<8} {avg_gen:<7.1f} {med_age:<7.0f} {max_age:<7} {med_energy:<6.1f} {total_bio:<9.0f} {rich_pct:<5.1f}%")

        print("-" * 84)
        print(f"Record: Island {top_gen_island} reached All-Time Gen {all_time_top_gen}")

    else:
        tick = data.get('tick', 0)
        agents = data.get('agents', [])
        stats = data.get('stats', {})
        pop = len(agents)
        gens = [a.get('generation', 1) for a in agents]
        ages = [a.get('age', 0) for a in agents]
        energies = [a.get('energy', 0) for a in agents]

        cur_max_gen = max(gens) if gens else 0
        avg_gen = (sum(gens) / len(gens)) if gens else 0.0
        all_time_gen = stats.get('generationMaxAllTime', stats.get('maxGeneration', cur_max_gen))
        med_age = median(ages)
        max_age = max(ages) if ages else 0
        med_energy = median(energies)

        grid = data.get('grid', {})
        bio_list = grid.get('biomass', [])
        total_bio = sum(bio_list)
        rich_cells = sum(1 for b in bio_list if b > 0.5)
        rich_pct = (rich_cells / len(bio_list) * 100) if bio_list else 0.0

        print(f"Mode: Single Sim | Tick: {tick:,} | Pop: {pop}")
        print(f"Generations: Current Max {cur_max_gen} | All-Time {all_time_gen} | Avg {avg_gen:.1f}")
        print(f"Lifespans: Median {med_age:.0f} ticks | Max {max_age} ticks")
        print(f"Energy: Median {med_energy:.1f}")
        print(f"Biomass: Total {total_bio:.0f} units | Rich Cells (>0.5): {rich_cells}/{len(bio_list)} ({rich_pct:.1f}%)")

    print()

def main():
    if len(sys.argv) > 1:
        arg = sys.argv[1]
        if arg in ('-l', '--list'):
            list_saves()
            return
        elif arg in ('-h', '--help'):
            print(__doc__.strip())
            return
        else:
            filepath = arg
    else:
        filepath = get_latest_save()
        if not filepath:
            print(f"No save files found in {SAVES_DIR}")
            sys.exit(1)

    extract_stats(filepath)

if __name__ == '__main__':
    main()
