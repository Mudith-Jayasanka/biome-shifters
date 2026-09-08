# Task 25: Save Metadata Indexing System & Performance Optimization

## Status: `DONE`

## Goal
Optimize the Save/Load menu by caching save file metadata into a single merged `saves/metadata.json` file, eliminating multi-gigabyte parsing delays and ensuring that only newly created or modified saves are processed after initial indexing.

## Context
When loading the save menu (`GET /api/saves`), `server.py` previously executed `json.load()` on all `.json` files in the `saves/` folder on demand. With over 100 save files totaling >5.1 GB (50–60 MB per multi-island save), each request locked the Python server thread for over 80 seconds, making the save/load menu freeze and feel completely broken. By indexing saves into a lightweight merged JSON file and updating it incrementally on save/delete, listing saves drops from ~80 seconds to <5 milliseconds.

## Files to Create/Modify
- `[MODIFY]` `server.py` — Implement `SaveMetadataManager` with incremental indexing, atomic file writing, fast header extraction, startup sync, and updated `_handle_list_saves()`, `_handle_save()`, and `_handle_delete_save()`.
- `[MODIFY]` `js/island-manager.js` — Include top-level `tick`, `totalPopulation`, and `isAutosave` in `serializeAll()` to make future save metadata directly accessible at root.
- `[MODIFY]` `js/main.js` — Ensure `renderCurrentList()` gracefully formats dates and uses both `save.population` and `save.agentCount`.
- `[MODIFY]` `tasks/README.md` — Register TASK_25 in the task roadmap and dependency diagram.

## Detailed Specification

### 1. `SaveMetadataManager` in `server.py`
- Stores all save metadata in `saves/metadata.json`.
- Excludes `metadata.json`, files starting with `.` or `_`, and any non-JSON files.
- Checks file modification time (`st_mtime`) and file size (`st_size`) against cached metadata:
  - If a file is in the index and its `mtime` and `fileSize` match, it is **skipped** (zero overhead).
  - If a file is missing from the index or was modified, metadata is extracted and added/updated.
  - If an indexed file no longer exists in `saves/`, it is purged from `metadata.json`.
- Fast extraction:
  - Reads the first 32 KB of the file to extract `name`, `timestamp`, `tick`, `population`, `isAutosave`, `isMultiIsland`, `islandCount`.
  - Falls back to `json.load()` if header parsing is inconclusive.
- When `POST /api/saves` saves a simulation:
  - The server receives the in-memory `data` payload.
  - Directly registers the metadata entry into the index without re-reading the file.
  - Atomically writes `saves/metadata.json`.
- When `DELETE /api/saves/<filename>` is called:
  - Deletes the file and removes the entry from `metadata.json`.
- When `GET /api/saves` is called:
  - Loads `metadata.json` and returns the saves list sorted by `timestamp` / `mtime` descending.

### 2. Multi-Island Serialization (`js/island-manager.js`)
- `serializeAll(name)` adds:
  - `tick`: Active island tick count.
  - `totalPopulation`: Sum of agent counts across all islands.

### 3. Frontend Fallback (`js/main.js`)
- `renderCurrentList()` displays `save.population || save.agentCount || 0`.
- Formats dates cleanly: `save.modified || new Date(save.timestamp).toLocaleString()`.

## Test Plan
1. **Initial Indexing**: Run startup sync on all 100 existing saves and verify `saves/metadata.json` is generated correctly in < 1 second.
2. **Incremental Speed**: Run sync again and verify 0 files are reprocessed (< 5 ms).
3. **API Performance**: Measure response time of `GET /api/saves` via curl or benchmark script (< 50 ms vs > 80,000 ms).
4. **Save & Delete Verification**: Save a new state and verify `metadata.json` is updated with only the new file. Delete it and verify it is pruned from `metadata.json`.
5. **Browser Verification**: Open the browser UI at `http://localhost:8080`, click "Save / Load", and verify instantaneous modal display.

## Acceptance Criteria
- [x] `saves/metadata.json` exists and stores valid JSON with metadata for all save files.
- [x] `metadata.json` is never treated as a save game.
- [x] `GET /api/saves` returns the complete list of saves in < 50ms without parsing 5GB of JSON.
- [x] `POST /api/saves` saves the state and updates `metadata.json` for that file only.
- [x] `DELETE /api/saves/<filename>` deletes the file and prunes its metadata entry.
- [x] Unprocessed/old saves are indexed once; repeated listing or saving does not re-parse old saves.
- [x] The browser UI Save/Load modal opens and renders instantly with correct ticks, populations, and timestamps.
