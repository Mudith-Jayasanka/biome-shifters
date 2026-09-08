# Task 35: Cluster Node Control Backend Endpoints & Persistent IP:Name Store

## Status: `DONE`

## Goal
Implement backend support in `server.py` for kicking nodes, renaming nodes with persistent IP-to-name storage in `saves/cluster_clients.json`, tracking remote visual visibility (`isHidden`), and notifying contributor nodes of their state via heartbeat responses.

## Context
Host administrators need programmatic control over contributors in the LAN cluster. Currently, `server.py` only tracks connected nodes passively and lacks endpoints to kick or rename nodes or control client visibility. Furthermore, client names are transient and disappear when a node reconnects.

## Files to Create/Modify
- `[MODIFY]` `server.py` — Add `ClientRegistry` for `saves/cluster_clients.json`, implement `ClusterManager.kick_node()`, `rename_node()`, `set_node_visibility()`, and expose REST routes `POST /api/cluster/node/kick`, `POST /api/cluster/node/rename`, `POST /api/cluster/node/visibility`. Include `nodeState` in `/api/cluster/heartbeat` response and reject kicked nodes.

## Detailed Specification

### `server.py`
1. **Persistent IP:Name Registry (`ClientRegistry`)**:
   - Location: `saves/cluster_clients.json`.
   - Thread-safe loading and saving of `{ "<ip_address>": "<custom_name>" }`.
   - In `ClusterManager.register_node()` and `ClusterManager.heartbeat()`:
     - If client's IP is in `ClientRegistry`, prioritize the saved name over the client-provided default.
2. **Node Controls in `ClusterManager`**:
   - `kicked_nodes`: set of kicked node IDs (in-memory, auto-pruned or retained to prevent immediate auto-healing).
   - `kick_node(node_id)`:
     - Add `node_id` to `kicked_nodes`.
     - Remove `node_id` from `cls.nodes`.
     - Returns `{ 'status': 'kicked', 'nodeId': node_id }`.
   - `rename_node(node_id, new_name)`:
     - Sanitize `new_name`.
     - Update `node['name']`.
     - Save mapping `{ node['ip']: clean_name }` via `ClientRegistry.save_name(ip, clean_name)`.
     - Returns `{ 'status': 'renamed', 'nodeId': node_id, 'name': clean_name }`.
   - `set_node_visibility(node_id, is_hidden)`:
     - Set `node['isHidden'] = bool(is_hidden)`.
     - Returns `{ 'status': 'visibility_updated', 'nodeId': node_id, 'isHidden': bool(is_hidden) }`.
3. **Heartbeat Protocol Extension**:
   - If `node_id in cls.kicked_nodes`:
     - Return `{ 'status': 'kicked', 'kicked': True, 'error': 'Removed by Host Admin' }`.
   - For valid nodes, include in heartbeat response:
     - `nodeState: { 'name': node['name'], 'isHidden': node.get('isHidden', False) }`.
4. **New REST Endpoints**:
   - `POST /api/cluster/node/kick`:
     - Restricted to host/localhost.
     - Body: `{"nodeId": "node_xxx"}`.
   - `POST /api/cluster/node/rename`:
     - Restricted to host/localhost.
     - Body: `{"nodeId": "node_xxx", "name": "New Name"}`.
   - `POST /api/cluster/node/visibility`:
     - Restricted to host/localhost.
     - Body: `{"nodeId": "node_xxx", "isHidden": true/false}`.

## Test Plan
1. **Automated Verification**:
   - Run a test script against `server.py` verifying:
     - Renaming a node persists to `saves/cluster_clients.json` and survives node re-registration from same IP.
     - Toggling visibility reflects in node's heartbeat response.
     - Kicking a node returns `kicked: True` on next heartbeat and prevents auto-healing.
     - Non-localhost requests to control endpoints return HTTP 403.

## Acceptance Criteria
- [x] `saves/cluster_clients.json` persistently stores IP-to-name mappings.
- [x] `POST /api/cluster/node/kick` disowns the node and flags it as kicked.
- [x] `POST /api/cluster/node/rename` updates node name in memory and on disk.
- [x] `POST /api/cluster/node/visibility` updates `isHidden` flag.
- [x] Heartbeat returns `nodeState` containing `name` and `isHidden`, and returns `kicked: True` for kicked nodes.
