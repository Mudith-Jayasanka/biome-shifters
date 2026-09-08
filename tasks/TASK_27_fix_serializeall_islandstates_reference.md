# Task 27: Fix serializeAll islandStates Reference Error

## Status: `DONE`

## Goal
Fix `ReferenceError: islandStates is not defined` in `IslandManager.serializeAll()` by restoring `const islandStates = await Promise.all(serializePromises);`.

## Context
During the previous update to `serializeAll()` in `js/island-manager.js`, the statement `const islandStates = await Promise.all(serializePromises);` was omitted when constructing the payload metadata, causing manual and automated saves to fail with `islandStates is not defined`.

## Files to Create/Modify
- `[MODIFY]` `js/island-manager.js` — Add `const islandStates = await Promise.all(serializePromises);` before filtering `islandStates`.
- `[MODIFY]` `tasks/README.md` — Register TASK_27 in roadmap.

## Detailed Specification
In `js/island-manager.js`, inside `serializeAll(name = '')`:
```javascript
    const serializePromises = this.workers.map((worker, islandId) => {
      // ...
    });

    const islandStates = await Promise.all(serializePromises);
    const validIslands = islandStates.filter(Boolean);
```

## Test Plan
1. Check syntax with `node -c js/island-manager.js`.
2. Run test script invoking `serializeAll()` or simulate serialization to ensure `islandStates` resolves and returns the multi-island save payload.

## Acceptance Criteria
- [x] `IslandManager.serializeAll()` executes without `ReferenceError`.
- [x] Manual saving in the UI completes successfully.
