# Task 22: Auto-Save Timer Pause Synchronization

## Status
`DONE`

## Goal
Synchronize the periodic auto-save timer with simulation execution so that when the simulation is paused, the auto-save countdown and accumulation are paused (preventing redundant saves and frozen countdown drift), and when the simulation is resumed, the timer resumes seamlessly.

## Context
Previously, `checkAutoSave()` calculated elapsed time using absolute wall-clock differences (`Date.now() - this.lastAutoSaveTime`). When a user paused the simulation, the wall-clock time continued ticking down, triggering auto-saves of completely frozen simulation states and desynchronizing the countdown timer from active simulation progress. Auto-saving should only progress when simulation ticks are actually executing.

## Files to Create/Modify
- `js/main.js` `[MODIFY]` — Replace wall-clock `lastAutoSaveTime` with active delta accumulation `autoSaveAccumulatedMs` and `lastAutoSaveCheckTime`. Freeze countdown accumulation when `this.isPaused` is true, update the HUD button to reflect `⏱️ Auto: PAUSED` state, and show `(Paused)` in the modal status text.

## Detailed Specification

### 1. State Tracking (`js/main.js`)
Replace `this.lastAutoSaveTime = Date.now();` with:
```javascript
    this.autoSaveAccumulatedMs = 0;
    this.lastAutoSaveCheckTime = Date.now();
```

### 2. HUD Button Pause Indication
In `updateAutoSaveHudButton()`:
```javascript
    if (this.autoSaveEnabled) {
      hudBtn.classList.remove('disabled');
      if (this.isPaused) {
        hudBtn.textContent = `⏱️ Auto: PAUSED (${this.autoSaveIntervalMinutes}m)`;
      } else {
        hudBtn.textContent = `⏱️ Auto: ON (${this.autoSaveIntervalMinutes}m)`;
      }
    } else {
      hudBtn.classList.add('disabled');
      hudBtn.textContent = '⏱️ Auto: OFF';
    }
```

### 3. Active Time Accumulation in `checkAutoSave()`
In `checkAutoSave()`:
```javascript
    const now = Date.now();
    const deltaMs = Math.min(2000, Math.max(0, now - this.lastAutoSaveCheckTime));
    this.lastAutoSaveCheckTime = now;

    if (!this.autoSaveEnabled) {
      if (statusText) statusText.textContent = 'Auto-Save: Disabled';
      return;
    }

    const activeTick = this.islandManager.telemetry[this.islandManager.activeIslandIndex]?.tick || 0;
    if (activeTick === 0) {
      if (statusText) statusText.textContent = 'Waiting for world start...';
      return;
    }

    const intervalMs = this.autoSaveIntervalMinutes * 60 * 1000;
    const remainingSec = Math.max(0, Math.ceil((intervalMs - this.autoSaveAccumulatedMs) / 1000));

    // When paused: freeze accumulation and display paused state
    if (this.isPaused) {
      if (statusText) {
        if (remainingSec >= 60) {
          const m = Math.floor(remainingSec / 60);
          const s = remainingSec % 60;
          statusText.textContent = `Next in: ${m}m ${s < 10 ? '0' : ''}${s}s (Paused)`;
        } else {
          statusText.textContent = `Next in: ${remainingSec}s (Paused)`;
        }
      }
      return;
    }

    // Active simulation: accumulate delta
    this.autoSaveAccumulatedMs += deltaMs;
    // Update countdown and trigger save when threshold reached
...
```

### 4. Pause / Resume Event Hooks
When `btnPause` is toggled or `Space` is pressed:
- Call `this.updateAutoSaveHudButton()`
- Update `this.lastAutoSaveCheckTime = Date.now()`
- Call `this.checkAutoSave()` immediately to refresh the UI status.

## Test Plan
1. Validate JS syntax with `node --check js/main.js`.
2. Load simulation with Auto-Save enabled (e.g. 2 min interval).
3. Verify timer counts down while running, and HUD button displays `⏱️ Auto: ON (2m)`.
4. Click Pause (or press Space):
   - Verify HUD button updates to `⏱️ Auto: PAUSED (2m)`.
   - Verify modal status text shows `Next in: Xm Ys (Paused)`.
   - Wait 10 seconds: verify the remaining time does not decrease while paused.
5. Click Resume (or press Space):
   - Verify HUD button updates back to `⏱️ Auto: ON (2m)`.
   - Verify countdown resumes from the exact remaining time without skipping.

## Acceptance Criteria
- [x] Auto-save timer accumulation halts completely when simulation is paused.
- [x] Auto-save countdown displays `(Paused)` and does not decrement while paused.
- [x] HUD button displays `⏱️ Auto: PAUSED (Xm)` when paused and `⏱️ Auto: ON (Xm)` when running.
- [x] Resuming the simulation unpauses the timer from its previous remaining duration.
- [x] No unwanted auto-saves fire while the simulation is paused.
