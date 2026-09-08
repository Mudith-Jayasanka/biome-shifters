# Task 33: Cluster Heartbeat Persistence, Node Auto-Healing & Migration Synchronization Fix

## Status: `DONE`

## Goal
Resolve connected LAN client dropouts by implementing heartbeat auto-healing and tolerant node timeouts in `server.py`, and synchronize cluster-wide genetic migration so that Darwinian elite exchanges reliably include all connected contributor machines and reflect accurate multi-machine counts on both Host and Contributor HUDs.

## Context
In Biome Shifters LAN cluster mode, contributor machines were disappearing from the Host cluster dashboard after ~15 seconds of inactivity (such as switching browser tabs or background throttling), despite their browser tabs remaining open and continuing to receive play/pause and speed broadcasts. Furthermore, during genetic migration, both Host and Contributor HUD toasts displayed *"Exchanged X genomes across 1 machine(s)"* instead of recognizing the multi-machine cluster.

## Files to Create/Modify
- `[MODIFY]` `server.py` — Implement heartbeat auto-healing, increase stale node timeout from 15s to 300s with active/delayed/offline states, add `get_lan_ip()` to localhost detection, and report accurate participating machine counts in migration pools.
- `[MODIFY]` `js/cluster-client.js` — Enrich heartbeat payload with client node metadata (`name`, `cores`, `islandIds`), implement responsive polling for foreign elites in `handleClusterMigration()`, and ensure proper multi-machine migration toast reporting.
- `[MODIFY]` `js/island-manager.js` — Increase worker `EXPORT_ELITES` timeout to 3500ms to avoid dropping elite genomes during simulation load.
- `[MODIFY]` `js/main.js` — Synchronize `isHost` state with server cluster status response.

## Detailed Specification

### 1. Backend Auto-Healing & Node Timeout (`server.py`)
- In `ClusterManager.heartbeat(node_id, telemetry, tps, population, name=None, cores=None, island_ids=None, client_ip=None)`:
  - If `node_id in cls.nodes`: update `lastHeartbeat = now`, `tps`, `population`, `telemetry`.
  - If `node_id not in cls.nodes` and `node_id != cls.host_node_id`:
    - Auto-heal and restore the node into `cls.nodes` with its provided `name`, `cores`, `island_ids`, and client IP.
- In `ClusterManager.get_all_nodes()`:
  - Compute status:
    - `<= 8.0s`: `'active'`
    - `8.0s .. 60.0s`: `'delayed'`
    - `> 60.0s`: `'offline'`
  - Only prune nodes from `cls.nodes` if `(now - lastHeartbeat) > 300.0s` (5 minutes).
- In `is_localhost_request()`:
  - Check `client_ip in ('127.0.0.1', '::1', 'localhost', get_lan_ip()) or client_ip.startswith('127.')`.
- In `ClusterManager.get_migration_pool()`:
  - Return `nodesCount` as `max(len(pool['submitted_nodes']), active_nodes_count, 1)`.

### 2. Frontend Heartbeat & Migration Coordination (`js/cluster-client.js` & `js/island-manager.js`)
- In `ClusterClient.sendHeartbeat()`:
  - Include `name: this.name`, `cores: this.islandIds.length`, `islandIds: this.islandIds` in payload.
- In `ClusterClient.handleClusterMigration()`:
  - On Host: If active cluster nodes exist, poll `fetchMigrationPool(epoch)` up to 3.5 seconds (checking every 400ms) for foreign contributor elites.
  - When contributor elites are received, import them and emit `migration_completed` with the updated multi-machine genome count.
- In `IslandManager.exportAllLocalElites()`:
  - Increase worker request timeout from 1500ms to 3500ms.

## Test Plan
1. **Headless Verification**: Run test script validating node auto-healing after artificial disconnection, and verifying migration pool submission and cross-node retrieval with 2 machines.
2. **Browser Verification**:
   - Host opens `http://localhost:8080`.
   - Contributor opens LAN URL and joins.
   - Verify both nodes show in `🌐 Cluster` dashboard.
   - Switch tab / unfocus contributor for 25s, refocus -> verify contributor remains in dashboard with active/delayed status without disappearing.
   - Click `Migrate Now` on Host -> verify both Host and Contributor show HUD migration toast indicating multiple machines.

## Acceptance Criteria
- [x] Connected contributor nodes do NOT disappear from the Host LAN dashboard when inactive or backgrounded.
- [x] Heartbeat requests auto-heal any disconnected node in `cls.nodes` without requiring a browser page refresh.
- [x] Genetic migration exchanges elites between Host and Contributor workers and displays accurate multi-machine counts (e.g. `across 2 machine(s)`) on both Host and Contributor HUD toasts.
- [x] Simulation play/pause and speed controls remain fully synchronized across all cluster nodes.

