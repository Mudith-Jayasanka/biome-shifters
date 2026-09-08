# Task 31: Cluster-Wide Genetic Migration & Cross-Breeding Protocol

## Status: `DONE`

## Goal
Implement distributed Darwinian elite genome exchange across all connected cluster machines via `server.py`, ensuring cross-breeding, gene flow, and immigrant pioneer spawning synchronize seamlessly between host islands and client islands.

## Context
In single-machine mode, islands exchange top Darwinian brains every 800 ticks, allowing evolutionary innovations (canal digging, grazing efficiency) developed on one island to cross-breed into peer populations. In our distributed cluster, friends' machines run additional islands. To realize the goal of simulating more islands as one unified ecosystem, elite genomes must flow across the network between host islands and client islands.

## Files to Create/Modify
- `[MODIFY]` `server.py` — Implement `/api/cluster/migration/submit` and `/api/cluster/migration/pool` endpoints with global genome pooling, sorting by fitness, and foreign elite dispatch.
- `[MODIFY]` `js/island-manager.js` — Update `triggerMigration()` to support remote cluster submission and retrieval via `ClusterClient` when operating in cluster mode.
- `[MODIFY]` `js/cluster-client.js` — Handle periodic migration epoch detection, export local worker elites to server, fetch foreign pool, and inject back into local workers.
- `[MODIFY]` `tasks/README.md` — Register TASK_31 in task catalog and dependency graph.

## Detailed Specification

### 1. Server Migration Pool in `server.py`
Inside `ClusterManager`:
- Tracks `current_epoch_pool`: Dict of `epoch -> { submitted_nodes: set(), elites: [] }`.
- Endpoint `POST /api/cluster/migration/submit`:
  - Request:
    ```json
    {
      "nodeId": "node_1_xyz",
      "epoch": 1,
      "elites": [
        { "fitness": 450, "generation": 4, "originIsland": 2, "brain": { ... } }
      ]
    }
    ```
  - Appends elites tagged with `nodeId` and `originIsland`.
- Endpoint `GET /api/cluster/migration/pool?nodeId=<nodeId>&epoch=<epoch>`:
  - Filters out elites originating from `nodeId`.
  - Sorts candidates descending by `fitness`.
  - Returns top foreign candidate brains (e.g. top 10).
- Automatically prunes old migration pools older than 5 epochs to prevent memory growth.

### 2. Distributed Migration Protocol in `js/island-manager.js` & `js/cluster-client.js`
When migration triggers (either Host manual click or active island 800-tick interval):
1. **Trigger / Epoch Broadcast**:
   - Host increments migration epoch on server via `/api/cluster/control`.
   - Client heartbeats detect `globalState.migrationEpoch > localMigrationEpoch`.
2. **Local Export**:
   - Local `IslandManager` queries all its local workers with `EXPORT_ELITES` (3 top brains per island).
   - Local elites are bundled and sent to server via `POST /api/cluster/migration/submit`.
3. **Pool Fetch & Import**:
   - Node calls `GET /api/cluster/migration/pool?nodeId=...&epoch=...`.
   - Foreign elites from peer machines and peer islands are received.
   - For each local worker, `IslandManager` sends `IMPORT_ELITES` with the top foreign genomes.
   - Local workers store genomes in their `eliteArchive` and spawn pioneer immigrants with the standard 1.5x energy subsidy.
4. **Telemetry Update**:
   - `immigrantsReceived` stat increments on local islands.
   - HUD migration banner notifies user: *"Migration Epoch X: Exchanged Y genomes across Z machines"*.

## Test Plan
1. **API Migration Pool Test**:
   - Submit mock elites from Node A via `POST /api/cluster/migration/submit`.
   - Submit mock elites from Node B via `POST /api/cluster/migration/submit`.
   - Query pool for Node A via `GET /api/cluster/migration/pool?nodeId=NodeA&epoch=1` and verify only Node B's elites are returned, sorted by fitness.
2. **Cross-Machine Immigrant Verification**:
   - Run Host on `localhost:8080` (Islands 0–7) and Client on LAN (Islands 8–9).
   - Trigger migration epoch.
   - Verify that Client's islands spawn immigrant agents marked with `originIsland: <0..7>` and Host's islands spawn immigrants marked with `originIsland: <8..9>`.

## Acceptance Criteria
- [x] Server pools exported elite brains from both Host and all connected Contributor clients.
- [x] Nodes receive top foreign elite brains strictly from other nodes/islands.
- [x] Receiving workers successfully parse foreign RNN weights, update elite archives, and spawn pioneer immigrants.
- [x] Total migrants exchanged counter updates accurately across both Host and client HUDs.

