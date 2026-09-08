# Task 50: Fix Radiation Toggle Worker Map Lookup

## Status: `DONE`

## Goal
Fix `TypeError: this.islandManager.workers.has is not a function` when toggling Radiation / Extreme Mutation Mode on islands via `ClusterClient.toggleIslandRadiation()`.

## Context
When toggling radiation mode on an island (either from the HUD active island radiation button, cluster dashboard, island cam snooper, or island pills), `ClusterClient.toggleIslandRadiation(islandId, enabled, multiplier)` attempts to update local island state for instant responsiveness before dispatching the REST call to `/api/cluster/island/radiation`.

In `js/cluster-client.js` line 528:
```javascript
if (this.islandManager && this.islandManager.workers.has(targetId)) {
  this.islandManager.setIslandRadiation(targetId, isTargetEnabled, mult);
}
```
However, in `IslandManager` (`js/island-manager.js`), `this.workers` is a 1D `Array` (retained for backward compatibility), while the worker map keyed by island ID is `this.workerMap` (`Map<number, Worker>`). Calling `.has()` on an array throws `TypeError: this.islandManager.workers.has is not a function`.

## Files to Create/Modify
- `[MODIFY]` `js/cluster-client.js` — Update local worker existence check to inspect `this.islandManager.hasIsland(targetId)` and `this.islandManager.workerMap.has(targetId)`.
- `[MODIFY]` `js/island-manager.js` — Add `hasIsland(islandId)` helper method to `IslandManager` returning `this.workerMap.has(parseInt(islandId, 10))`.
- `[MODIFY]` `tasks/README.md` — Register TASK_50 in task list and dependency chain.

## Detailed Specification

### 1. `js/island-manager.js`
Add `hasIsland(islandId)` helper method on `IslandManager`:
```javascript
  hasIsland(islandId) {
    const id = parseInt(islandId, 10);
    return !isNaN(id) && this.workerMap.has(id);
  }
```

### 2. `js/cluster-client.js`
In `toggleIslandRadiation(islandId, enabled, multiplier = 4.0)`:
Replace:
```javascript
    // Apply locally if this node manages the island for instant UI response
    if (this.islandManager && this.islandManager.workers.has(targetId)) {
      this.islandManager.setIslandRadiation(targetId, isTargetEnabled, mult);
    }
```
With:
```javascript
    // Apply locally if this node manages the island for instant UI response
    if (this.islandManager && (this.islandManager.hasIsland ? this.islandManager.hasIsland(targetId) : this.islandManager.workerMap?.has(targetId))) {
      this.islandManager.setIslandRadiation(targetId, isTargetEnabled, mult);
    }
```

## Test Plan
1. Use `node -e` or automated script to verify that:
   - `IslandManager.prototype.hasIsland` exists and behaves correctly for present and absent IDs.
   - Calling `ClusterClient.prototype.toggleIslandRadiation` with mock `islandManager` no longer throws `TypeError: this.islandManager.workers.has is not a function`.
2. Verify syntactical and module integrity of all touched files.

## Acceptance Criteria
- [x] `hasIsland(islandId)` is implemented on `IslandManager`.
- [x] `ClusterClient.toggleIslandRadiation` checks `hasIsland` / `workerMap.has` instead of `workers.has`.
- [x] No `TypeError` is raised when triggering radiation on local or remote islands.
- [x] Registered in `tasks/README.md`.

