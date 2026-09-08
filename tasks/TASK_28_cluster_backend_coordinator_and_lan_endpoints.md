# Task 28: Cluster Backend Coordinator & LAN REST Endpoints

## Status: `DONE`

## Goal
Implement a thread-safe `ClusterManager` in `server.py` that discovers the host's local LAN IP, manages connected client nodes, dynamically assigns non-overlapping island IDs, differentiates localhost admin from LAN contributor clients, and coordinates cluster-wide state synchronization.

## Context
Biome Shifters is transitioning from a single-machine 8-worker simulation to a distributed LAN cluster. The host runs `server.py` on port 8080. Friends on the same WiFi connect via the host's LAN IP (e.g. `http://192.168.1.50:8080`). To orchestrate multiple machines, the server must keep a real-time registry of connected nodes, their dedicated CPU cores, assigned island IDs, and synchronize global simulation state (play/pause, speed, migration epochs).

## Files to Create/Modify
- `[MODIFY]` `server.py` — Implement `ClusterManager`, add cluster REST API endpoints (`/api/cluster/*`), add LAN IP detection on server startup, and integrate localhost admin detection.
- `[MODIFY]` `tasks/README.md` — Register TASK_28 in task catalog and dependency graph.

## Detailed Specification

### 1. Host LAN IP Detection in `server.py`
Implement a reliable helper function `get_lan_ip()`:
```python
def get_lan_ip() -> str:
    """Detect the host machine's primary local LAN IP address."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # Doesn't have to be reachable; used to determine outbound interface
        s.connect(('10.255.255.255', 1))
        ip = s.getsockname()[0]
    except Exception:
        try:
            ip = socket.gethostbyname(socket.gethostname())
        except Exception:
            ip = '127.0.0.1'
    finally:
        s.close()
    return ip
```
On startup, print a prominent banner:
```
======================================================
  Biome Shifters — LAN Cluster Coordinator
  Admin UI (Localhost):   http://localhost:8080
  LAN Join URL (Friends): http://<LAN_IP>:8080
======================================================
```

### 2. `ClusterManager` Class in `server.py`
Maintains in-memory cluster state with thread locking:
- `host_node`: Node registered for localhost (defaulting to Islands 0..7).
- `nodes`: Dict of `node_id -> NodeState`:
  - `node_id`: String (e.g. `node_1_abc`)
  - `name`: Client device or user name (e.g. "Bob's Laptop")
  - `ip`: Client remote address
  - `cores`: Number of dedicated cores (e.g. 4)
  - `island_ids`: List of assigned continuous integer IDs (e.g. `[8, 9, 10, 11]`)
  - `last_heartbeat`: Timestamp
  - `tps`: Current TPS reported
  - `population`: Current population reported
  - `telemetry`: Array of per-island telemetry snapshots
- `global_state`:
  - `is_paused`: Bool (default `False`)
  - `speed`: Int (default `1`)
  - `is_turbo`: Bool (default `False`)
  - `tick`: Int
  - `migration_epoch`: Int (default `0`)
  - `next_island_id`: Int (starts at 8, increments as clients join)
- Methods:
  - `register_node(name, cores, client_ip)` $\to$ assigns `island_ids = [next_island_id ... next_island_id + cores - 1]`, updates `next_island_id`.
  - `heartbeat(node_id, telemetry_list, reported_tps, reported_pop)` $\to$ updates timestamp and telemetry; purges nodes with `now - last_heartbeat > 15s`.
  - `unregister_node(node_id)` $\to$ marks node disconnected and makes its islands available or preserves state.
  - `update_control(is_paused, speed, is_turbo, tick)` $\to$ updates global state (Admin only).
  - `get_cluster_summary()` $\to$ returns aggregate cores, islands, total pop, cluster TPS, active nodes.

### 3. REST API Endpoints in `server.py`
- `GET /api/cluster/status`:
  - Request: None
  - Response:
    ```json
    {
      "isHost": true/false, // determined by client_address[0] in ('127.0.0.1', '::1', 'localhost')
      "hostIp": "<LAN_IP>",
      "port": 8080,
      "cluster": {
        "totalNodes": 2,
        "totalCores": 12,
        "totalIslands": 12,
        "clusterTps": 8450,
        "clusterPopulation": 2400,
        "isPaused": false,
        "speed": 1,
        "isTurbo": false,
        "migrationEpoch": 3
      }
    }
    ```
- `POST /api/cluster/join`:
  - Request: `{"name": "Alice-PC", "requestedCores": 4}`
  - Response:
    ```json
    {
      "nodeId": "node_2_xyz",
      "islandIds": [8, 9, 10, 11],
      "baseSeed": 1725690000000,
      "globalState": { "isPaused": false, "speed": 1, "isTurbo": false }
    }
    ```
- `POST /api/cluster/heartbeat`:
  - Request: `{"nodeId": "node_2_xyz", "telemetry": [...], "tps": 2400, "population": 800}`
  - Response:
    ```json
    {
      "status": "ok",
      "globalState": { "isPaused": false, "speed": 1, "isTurbo": false, "migrationEpoch": 3 }
    }
    ```
- `GET /api/cluster/nodes`:
  - Response: List of all connected nodes with details (Admin only, or read-only summary for clients).
- `POST /api/cluster/control`:
  - Request: `{"isPaused": true, "speed": 2, "isTurbo": false}` (Forbidden if not localhost).

## Test Plan
1. **Startup Banner Test**: Run `python3 server.py 8080` and verify the terminal displays the host's LAN join link.
2. **Status Endpoint**: Call `curl -s http://localhost:8080/api/cluster/status` and verify `"isHost": true`. Call using local LAN IP and verify `"isHost": false`.
3. **Node Registration**: Call `curl -s -X POST -H "Content-Type: application/json" -d '{"name":"TestNode","requestedCores":4}' http://localhost:8080/api/cluster/join` and verify `islandIds: [8, 9, 10, 11]` is returned.
4. **Heartbeat & Summary**: Send heartbeat and verify `GET /api/cluster/status` reflects the node's TPS and island count.

## Acceptance Criteria
- [x] Server detects host LAN IP and prints it on startup.
- [x] Requests originating from `127.0.0.1` / `::1` are identified as `isHost: true`; non-localhost IPs are identified as `isHost: false`.
- [x] `/api/cluster/join` allocates consecutive, non-overlapping island IDs starting at 8.
- [x] `/api/cluster/heartbeat` tracks active nodes and removes dead nodes after timeout.
- [x] `/api/cluster/control` allows only the host to change cluster-wide pause/speed/turbo states.

