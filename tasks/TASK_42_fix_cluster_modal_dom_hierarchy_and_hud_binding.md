# Task 42: Fix Cluster Modal DOM Hierarchy & HUD Event Binding

## Status: `DONE`

## Goal
Fix unclosed `#cluster-join-modal` element in `index.html` which caused `#modal-cluster-nodes` to be trapped inside a hidden parent container, and guarantee `#btn-cluster-hud` click listeners are bound reliably regardless of client vs host resolution timing.

## Context
The user observed that they could not open the LAN Cluster Dashboard when alone. There was no intentional gating condition requiring other people to be connected (the dashboard is specifically intended for the host to view their single-node cluster and copy the LAN invite link). 

Investigation revealed two root causes:
1. In `index.html`, `<div id="cluster-join-modal">` was missing its closing `</div>`. As a result, both `#worker-screensaver-overlay` and `#modal-cluster-nodes` were parsed as child elements inside `#cluster-join-modal`. Because `#cluster-join-modal` has `.hidden` (`display: none !important`) on the host machine, `#modal-cluster-nodes` could never be displayed even when its own `.hidden` class was removed!
2. In `js/main.js`, `this.setupUIControls()` ran before `await this.clusterClient.checkStatus()` resolved `this.isHost`. Inside `setupUIControls()`, `this.setupClusterModal()` was gated by `if (this.isHost)`. If accessed via LAN IP or before role resolution, the click handler for `#btn-cluster-hud` was skipped entirely.

## Files to Create/Modify
- `[MODIFY]` `index.html` — Add closing `</div>` to `#cluster-join-modal` so `#modal-cluster-nodes` is an independent sibling modal.
- `[MODIFY]` `js/main.js` — Make `setupClusterModal()` idempotent and ensure it is unconditionally initialized and verified during host session startup.

## Detailed Specification

### 1. `index.html`
Add the missing closing tag `</div>` after line 499:
```html
          <div class="join-actions">
            <button id="btn-join-cluster-submit" class="btn btn-primary btn-join-cluster">
              🚀 Join Cluster & Start Simulating
            </button>
          </div>
        </div>
      </div>
    </div> <!-- Close #cluster-join-modal -->
```

### 2. `js/main.js`
1. In `setupClusterModal()`, add an idempotent guard:
```javascript
  setupClusterModal() {
    if (this._clusterModalInitialized) return;
    this._clusterModalInitialized = true;
    ...
```
2. In `setupUIControls()`, remove the restrictive `if (this.isHost)` condition:
```javascript
    // Host Cluster Nodes Dashboard Modal
    this.setupClusterModal();
```
3. In `initHostSession()`, also ensure `this.setupClusterModal()` is called.

## Test Plan
1. Check with a headless Node script that in `index.html`, `#modal-cluster-nodes` is NOT a descendant of `#cluster-join-modal`.
2. Verify that clicking `#btn-cluster-hud` removes `hidden` from `#modal-cluster-nodes` and calls `refreshClusterNodes()` without errors even when 0 external contributors are connected.

## Acceptance Criteria
- [x] `#cluster-join-modal` tag is properly closed in `index.html`.
- [x] `#modal-cluster-nodes` is a standalone top-level modal dialog.
- [x] `#btn-cluster-hud` reliably opens the cluster modal on the host with 0 external contributors.
- [x] `setupClusterModal()` is idempotent and called cleanly.
