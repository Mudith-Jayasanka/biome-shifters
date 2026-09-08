# Task 23: Fast Save Telemetry Extractor Script

## Status
`DONE`

## Goal
Create a standalone, token-efficient Python CLI utility (`scripts/extract_save_stats.py`) to instantly inspect and summarize simulation save files (both multi-island and single-island saves) without manual ad-hoc scripting or token bloat.

## Context
During simulation monitoring, extracting metrics (population counts, generation records, biomass, age, migration stats, energy levels) requires running custom Python commands each time. A dedicated script will allow instant extraction with concise, tabular formatting that respects token limits.

## Files to Create/Modify
- `[NEW]` `scripts/extract_save_stats.py`
- `[MODIFY]` `tasks/README.md`

## Detailed Specification
- **CLI Arguments**:
  - `python3 scripts/extract_save_stats.py [filepath]`: If `filepath` is omitted, automatically finds and inspects the latest `.json` file in `saves/`.
  - `--list` / `-l`: Lists the 10 most recent save files with date, size, ticks, and brief summary.
  - `--island N` / `-i N`: (Optional) Provides detailed breakdown for a single island `N` if requested.
- **Output Format**:
  - Concise header with file name, modification time, file size, world type (Multi-Island vs Single Island), total ticks, migration epochs, and migrants exchanged.
  - Formatted monospace ASCII table with columns:
    - `Isl`: Island ID
    - `Tick`: Current tick
    - `Pop`: Current population
    - `MaxGen`: Current max generation (and all-time max if recorded in stats)
    - `AvgGen`: Average generation
    - `MaxAge`: Maximum agent age
    - `MedAge`: Median agent age
    - `MedE`: Median energy
    - `Biomass`: Total biomass
    - `RichCells`: Percentage of cells with biomass > 0.5
  - Under 40 lines of total output to conserve context tokens.

## Test Plan
- Run `python3 scripts/extract_save_stats.py` without arguments to verify automatic resolution of the latest save.
- Run `python3 scripts/extract_save_stats.py --list` to verify listing of recent saves.
- Run `python3 scripts/extract_save_stats.py saves/simulation_tick_1000195.json` to verify single-island save compatibility.
- Run `python3 scripts/extract_save_stats.py saves/multi_island_tick_748730_debug.json` to verify 8-island formatting.

## Acceptance Criteria
- [ ] `scripts/extract_save_stats.py` exists and is executable.
- [ ] Auto-resolves latest save file if no argument is passed.
- [ ] Supports both multi-island (8 islands) and single-island save schemas.
- [ ] Output is compact, tabular, and under 40 lines (<500 tokens).
- [ ] Correctly extracts current max generation, all-time max generation, population, biomass, age, and migration stats.
- [ ] Registered in `tasks/README.md`.
