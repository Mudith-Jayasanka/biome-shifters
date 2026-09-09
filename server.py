#!/usr/bin/env python3
"""
Biome Shifters Server
Lightweight HTTP server serving static files and providing REST API endpoints
for saving and loading simulation state files directly inside the project's 'saves/' folder.
"""

import http.server
import json
import os
import re
import socket
import sys
import threading
import time
import urllib.parse
import uuid
from datetime import datetime, timezone
from pathlib import Path

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
BASE_DIR = Path(__file__).resolve().parent
SAVES_DIR = BASE_DIR / "saves"
DEBUG_DIR = BASE_DIR / "debug"
METADATA_FILE = SAVES_DIR / "metadata.json"
VERSION_FILE = BASE_DIR / "version.json"

os.makedirs(SAVES_DIR, exist_ok=True)
os.makedirs(DEBUG_DIR, exist_ok=True)


def get_build_version() -> dict:
    """Load latest build version from version.json or provide fallback defaults."""
    if VERSION_FILE.exists():
        try:
            with open(VERSION_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"[Version] Warning reading {VERSION_FILE.name}: {e}", file=sys.stderr)
    return {
        "major": 1,
        "minor": 1,
        "patch": 0,
        "build": 10,
        "version": "1.1.0",
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "action": "Baseline"
    }



def get_lan_ip() -> str:
    """Detect the host machine's primary local LAN IP address."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # Doesn't need external network connectivity; kernel selects outbound routing interface
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


CLIENT_REGISTRY_FILE = SAVES_DIR / "cluster_clients.json"


class ClientRegistry:
    """
    Persistently maps client IP addresses to custom human-readable machine names.
    Stored in saves/cluster_clients.json.
    """
    _lock = threading.Lock()

    @classmethod
    def load_clients(cls) -> dict:
        with cls._lock:
            if CLIENT_REGISTRY_FILE.exists():
                try:
                    with open(CLIENT_REGISTRY_FILE, 'r', encoding='utf-8') as f:
                        return json.load(f)
                except Exception as e:
                    print(f"[ClientRegistry] Warning: Failed reading {CLIENT_REGISTRY_FILE.name}: {e}", file=sys.stderr)
            return {}

    @classmethod
    def save_name(cls, ip: str, name: str):
        if not ip:
            return
        with cls._lock:
            clients = {}
            if CLIENT_REGISTRY_FILE.exists():
                try:
                    with open(CLIENT_REGISTRY_FILE, 'r', encoding='utf-8') as f:
                        clients = json.load(f)
                except Exception:
                    clients = {}
            clients[ip] = name
            try:
                tmp_file = CLIENT_REGISTRY_FILE.with_suffix('.json.tmp')
                with open(tmp_file, 'w', encoding='utf-8') as f:
                    json.dump(clients, f, indent=2)
                tmp_file.replace(CLIENT_REGISTRY_FILE)
            except Exception as e:
                print(f"[ClientRegistry] Error saving client registry: {e}", file=sys.stderr)

    @classmethod
    def get_name(cls, ip: str) -> str | None:
        clients = cls.load_clients()
        return clients.get(ip)


class ClusterManager:
    """
    Coordinates multi-machine distributed island simulation cluster over LAN.
    Tracks connected nodes, assigned island IDs, heartbeats, and cluster state.
    """
    _lock = threading.Lock()

    is_paused = False
    speed = 1
    is_turbo = False
    tick = 0
    migration_epoch = 0

    # Host machine simulates Islands 0..7 (8 default islands).
    # Client nodes start receiving island IDs from 8 upwards.
    next_island_id = 8

    nodes = {}
    kicked_nodes = set()
    host_node_id = 'host_local'
    irradiated_islands = set()
    gpu_enabled = False  # Global GPU flag pushed to ALL cluster nodes

    # Demand-driven snooper watch target: { 'islandId': None, 'expiresAt': 0.0 }
    snooper_watch = {'islandId': None, 'expiresAt': 0.0}
    # Cached latest snapshots: islandId -> { 'islandId': int, 'dataUrl': str, 'tick': int, 'population': int, 'isRadiationMode': bool, 'timestamp': float }
    island_snapshots = {}

    # Cluster-wide Darwinian elite migration pools: epoch -> { 'submitted_nodes': set(), 'elites': [] }
    migration_pools = {}

    @classmethod
    def init_host(cls):
        if cls.host_node_id not in cls.nodes:
            cls.nodes[cls.host_node_id] = {
                'nodeId': cls.host_node_id,
                'name': 'Host (Admin)',
                'ip': '127.0.0.1',
                'isHost': True,
                'cores': 8,
                'islandIds': list(range(8)),
                'lastHeartbeat': time.time(),
                'tps': 0,
                'population': 0,
                'telemetry': [],
                'perfMode': 'turbo'
            }

    @classmethod
    def register_node(cls, name: str, requested_cores: int, client_ip: str) -> dict:
        with cls._lock:
            cls.init_host()
            cores = max(1, min(16, int(requested_cores)))
            node_id = f"node_{uuid.uuid4().hex[:8]}"

            # Prioritize persistently saved custom name for this IP
            saved_name = ClientRegistry.get_name(client_ip)
            if saved_name:
                clean_name = saved_name
            else:
                clean_name = re.sub(r"[^\w\s\-\.\(\)']", '', name.strip())[:32] or f"Node-{node_id[-4:]}"

            # Allocate non-overlapping contiguous island IDs
            start_id = cls.next_island_id
            island_ids = list(range(start_id, start_id + cores))
            cls.next_island_id += cores

            now = time.time()
            node_info = {
                'nodeId': node_id,
                'name': clean_name,
                'ip': client_ip,
                'isHost': False,
                'cores': cores,
                'islandIds': island_ids,
                'lastHeartbeat': now,
                'tps': 0,
                'population': 0,
                'telemetry': [],
                'isHidden': False,
                'perfMode': 'standard'
            }
            cls.nodes[node_id] = node_info

            return {
                'nodeId': node_id,
                'name': clean_name,
                'islandIds': island_ids,
                'baseSeed': int(time.time() * 1000) % 10000000,
                'perfMode': 'standard',
                'buildVersion': get_build_version(),
                'globalState': {
                    'isPaused': cls.is_paused,
                    'speed': cls.speed,
                    'isTurbo': cls.is_turbo,
                    'migrationEpoch': cls.migration_epoch,
                    'irradiatedIslands': sorted(list(cls.irradiated_islands)),
                    'gpuEnabled': cls.gpu_enabled
                }
            }

    @classmethod
    def heartbeat(cls, node_id: str, telemetry: list = None, tps: int = 0, population: int = 0,
                  name: str = None, cores: int = None, island_ids: list = None, client_ip: str = None) -> dict:
        with cls._lock:
            now = time.time()

            # Reject kicked nodes
            if node_id in cls.kicked_nodes:
                return {
                    'status': 'kicked',
                    'kicked': True,
                    'error': 'Removed by Host Admin'
                }

            if node_id in cls.nodes:
                node = cls.nodes[node_id]
                node['lastHeartbeat'] = now
                node['tps'] = int(tps or 0)
                node['population'] = int(population or 0)
                if telemetry is not None:
                    node['telemetry'] = telemetry

                # Apply persistent name override if stored
                effective_ip = client_ip or node.get('ip')
                saved_name = ClientRegistry.get_name(effective_ip) if effective_ip else None
                if saved_name:
                    node['name'] = saved_name
                elif name and (not node.get('name') or node.get('name').startswith('Node-')):
                    clean_name = re.sub(r"[^\w\s\-\.\(\)']", '', name.strip())[:32]
                    if clean_name:
                        node['name'] = clean_name

                if cores and not node.get('cores'):
                    node['cores'] = int(cores)
                if island_ids and not node.get('islandIds'):
                    node['islandIds'] = island_ids
            elif node_id != cls.host_node_id:
                # Auto-heal: Client node dropped from memory (e.g. server reload or long tab background)
                effective_ip = client_ip or '127.0.0.1'
                saved_name = ClientRegistry.get_name(effective_ip)
                if saved_name:
                    clean_name = saved_name
                else:
                    clean_name = re.sub(r"[^\w\s\-\.\(\)']", '', (name or '').strip())[:32] or f"Node-{node_id[-4:]}"

                allocated_islands = island_ids if isinstance(island_ids, list) else []
                node_cores = int(cores) if cores else (len(allocated_islands) or 2)
                if allocated_islands:
                    cls.next_island_id = max(cls.next_island_id, max(allocated_islands) + 1)
                cls.nodes[node_id] = {
                    'nodeId': node_id,
                    'name': clean_name,
                    'ip': effective_ip,
                    'isHost': False,
                    'cores': node_cores,
                    'islandIds': allocated_islands,
                    'lastHeartbeat': now,
                    'tps': int(tps or 0),
                    'population': int(population or 0),
                    'telemetry': telemetry or [],
                    'isHidden': False,
                    'perfMode': 'standard'
                }
                node = cls.nodes[node_id]
            else:
                node = cls.nodes.get(cls.host_node_id, {})

            # Prune truly dead client nodes (missed heartbeat for > 300s / 5 minutes of total silence)
            stale_ids = []
            for nid, ninfo in cls.nodes.items():
                if nid != cls.host_node_id and (now - ninfo.get('lastHeartbeat', 0)) > 300.0:
                    stale_ids.append(nid)
            for sid in stale_ids:
                del cls.nodes[sid]

            # Demand-driven snooper watch: only signal if the watched island belongs to this specific node
            req_island = None
            watch_target = cls.snooper_watch.get('islandId')
            if watch_target is not None and now < cls.snooper_watch.get('expiresAt', 0.0):
                if watch_target in node.get('islandIds', []):
                    req_island = watch_target

            return {
                'status': 'ok',
                'buildVersion': get_build_version(),
                'nodeState': {
                    'name': node.get('name', 'Unknown'),
                    'isHidden': bool(node.get('isHidden', False)),
                    'perfMode': node.get('perfMode', 'standard')
                },
                'globalState': {
                    'isPaused': cls.is_paused,
                    'speed': cls.speed,
                    'isTurbo': cls.is_turbo,
                    'tick': cls.tick,
                    'migrationEpoch': cls.migration_epoch,
                    'irradiatedIslands': sorted(list(cls.irradiated_islands)),
                    'gpuEnabled': cls.gpu_enabled,
                    'requestedSnapshotIsland': req_island
                }
            }

    @classmethod
    def kick_node(cls, node_id: str) -> dict:
        with cls._lock:
            if not node_id:
                raise ValueError("Missing nodeId")
            if node_id == cls.host_node_id:
                raise ValueError("Cannot kick Host node")
            cls.kicked_nodes.add(node_id)
            if node_id in cls.nodes:
                del cls.nodes[node_id]
            return {'status': 'kicked', 'nodeId': node_id}

    @classmethod
    def rename_node(cls, node_id: str, new_name: str) -> dict:
        with cls._lock:
            if not node_id:
                raise ValueError("Missing nodeId")
            clean_name = re.sub(r"[^\w\s\-\.\(\)']", '', (new_name or '').strip())[:32]
            if not clean_name:
                raise ValueError("Invalid name")
            if node_id not in cls.nodes:
                raise ValueError("Node not found")
            node = cls.nodes[node_id]
            node['name'] = clean_name
            if not node.get('isHost') and node.get('ip'):
                ClientRegistry.save_name(node['ip'], clean_name)
            return {'status': 'renamed', 'nodeId': node_id, 'name': clean_name}

    @classmethod
    def set_node_visibility(cls, node_id: str, is_hidden: bool) -> dict:
        with cls._lock:
            if not node_id:
                raise ValueError("Missing nodeId")
            if node_id not in cls.nodes:
                raise ValueError("Node not found")
            cls.nodes[node_id]['isHidden'] = bool(is_hidden)
            return {'status': 'visibility_updated', 'nodeId': node_id, 'isHidden': bool(is_hidden)}

    @classmethod
    def set_node_perf(cls, node_id: str, perf_mode: str) -> dict:
        with cls._lock:
            if not node_id:
                raise ValueError("Missing nodeId")
            if perf_mode not in ('eco', 'standard', 'turbo'):
                raise ValueError("Invalid perfMode: must be 'eco', 'standard', or 'turbo'")
            if node_id not in cls.nodes:
                raise ValueError("Node not found")
            cls.nodes[node_id]['perfMode'] = perf_mode
            return {'status': 'perf_updated', 'nodeId': node_id, 'perfMode': perf_mode}

    @classmethod
    def set_island_radiation(cls, island_id: int, enabled: bool) -> dict:
        with cls._lock:
            try:
                iid = int(island_id)
            except (ValueError, TypeError):
                raise ValueError("Invalid islandId")
            if enabled:
                cls.irradiated_islands.add(iid)
            else:
                cls.irradiated_islands.discard(iid)
            return {
                'status': 'radiation_updated',
                'islandId': iid,
                'enabled': bool(enabled),
                'irradiatedIslands': sorted(list(cls.irradiated_islands))
            }

    @classmethod
    def set_gpu_mode(cls, enabled: bool) -> dict:
        with cls._lock:
            cls.gpu_enabled = bool(enabled)
            return {'ok': True, 'gpuEnabled': cls.gpu_enabled}

    @classmethod
    def set_snooper_watch(cls, island_id: int, duration_sec: float = 4.0) -> dict:
        with cls._lock:
            try:
                iid = int(island_id)
            except (ValueError, TypeError):
                raise ValueError("Invalid islandId")
            dur = max(1.0, min(30.0, float(duration_sec or 4.0)))
            now = time.time()
            cls.snooper_watch = {
                'islandId': iid,
                'expiresAt': now + dur
            }
            return {'status': 'watching', 'islandId': iid, 'expiresAt': cls.snooper_watch['expiresAt']}

    @classmethod
    def clear_snooper_watch(cls) -> dict:
        with cls._lock:
            cls.snooper_watch = {'islandId': None, 'expiresAt': 0.0}
            return {'status': 'stopped'}

    @classmethod
    def get_active_snooper_watch(cls) -> int | None:
        with cls._lock:
            target = cls.snooper_watch.get('islandId')
            if target is not None and time.time() < cls.snooper_watch.get('expiresAt', 0.0):
                return target
            return None

    @classmethod
    def store_snapshot(cls, island_id: int, snapshot_data: dict) -> dict:
        with cls._lock:
            try:
                iid = int(island_id)
            except (ValueError, TypeError):
                raise ValueError("Invalid islandId")
            now = time.time()
            cls.island_snapshots[iid] = {
                'islandId': iid,
                'dataUrl': str(snapshot_data.get('dataUrl', '')),
                'tick': int(snapshot_data.get('tick', 0)),
                'population': int(snapshot_data.get('population', 0)),
                'isRadiationMode': bool(snapshot_data.get('isRadiationMode', False)),
                'timestamp': now
            }
            return {'status': 'stored', 'islandId': iid}

    @classmethod
    def get_snapshot(cls, island_id: int) -> dict | None:
        with cls._lock:
            try:
                iid = int(island_id)
            except (ValueError, TypeError):
                raise ValueError("Invalid islandId")
            snap = cls.island_snapshots.get(iid)
            if not snap:
                return None
            return {
                **snap,
                'ageMs': int((time.time() - snap.get('timestamp', 0)) * 1000)
            }

    @classmethod
    def unregister_node(cls, node_id: str):
        with cls._lock:
            if node_id in cls.nodes and node_id != cls.host_node_id:
                del cls.nodes[node_id]

    @classmethod
    def update_control(cls, is_paused=None, speed=None, is_turbo=None, tick=None, migration_epoch=None):
        with cls._lock:
            if is_paused is not None:
                cls.is_paused = bool(is_paused)
            if speed is not None:
                cls.speed = int(speed)
            if is_turbo is not None:
                cls.is_turbo = bool(is_turbo)
            if tick is not None:
                cls.tick = int(tick)
            if migration_epoch is not None:
                cls.migration_epoch = int(migration_epoch)

    @classmethod
    def get_cluster_summary(cls, client_ip: str, is_host: bool) -> dict:
        with cls._lock:
            cls.init_host()
            now = time.time()
            stale_ids = [nid for nid, ninfo in cls.nodes.items() if nid != cls.host_node_id and (now - ninfo.get('lastHeartbeat', 0)) > 300.0]
            for sid in stale_ids:
                del cls.nodes[sid]

            total_nodes = len(cls.nodes)
            total_cores = sum(n.get('cores', 0) for n in cls.nodes.values())
            total_islands = sum(len(n.get('islandIds', [])) for n in cls.nodes.values())
            cluster_tps = sum(n.get('tps', 0) for n in cls.nodes.values())
            cluster_pop = sum(n.get('population', 0) for n in cls.nodes.values())

            return {
                'isHost': is_host,
                'hostIp': get_lan_ip(),
                'port': PORT,
                'buildVersion': get_build_version(),
                'cluster': {
                    'totalNodes': total_nodes,
                    'totalCores': total_cores,
                    'totalIslands': total_islands,
                    'clusterTps': cluster_tps,
                    'clusterPopulation': cluster_pop,
                    'isPaused': cls.is_paused,
                    'speed': cls.speed,
                    'isTurbo': cls.is_turbo,
                    'migrationEpoch': cls.migration_epoch,
                    'irradiatedIslands': sorted(list(cls.irradiated_islands)),
                    'gpuEnabled': cls.gpu_enabled
                }
            }

    @classmethod
    def get_all_nodes(cls) -> list:
        with cls._lock:
            cls.init_host()
            now = time.time()
            result = []
            for nid, n in cls.nodes.items():
                diff = now - n.get('lastHeartbeat', 0)
                if diff <= 8.0:
                    status = 'active'
                elif diff <= 60.0:
                    status = 'delayed'
                else:
                    status = 'offline'

                node_islands = n.get('islandIds', [])
                node_irradiated = [iid for iid in node_islands if iid in cls.irradiated_islands]

                result.append({
                    'nodeId': n['nodeId'],
                    'name': n['name'],
                    'ip': n['ip'],
                    'isHost': n.get('isHost', False),
                    'cores': n['cores'],
                    'islandIds': node_islands,
                    'tps': n.get('tps', 0),
                    'population': n.get('population', 0),
                    'lastHeartbeat': n.get('lastHeartbeat', 0),
                    'isHidden': bool(n.get('isHidden', False)),
                    'perfMode': n.get('perfMode', 'standard'),
                    'irradiatedIslands': node_irradiated,
                    'gpuEnabled': cls.gpu_enabled,
                    'status': status
                })
            result.sort(key=lambda x: (0 if x['isHost'] else 1, x['name']))
            return result

    @classmethod
    def submit_elites(cls, node_id: str, epoch: int, elites: list) -> dict:
        with cls._lock:
            if epoch not in cls.migration_pools:
                cls.migration_pools[epoch] = {
                    'submitted_nodes': set(),
                    'elites': []
                }
            pool = cls.migration_pools[epoch]
            pool['submitted_nodes'].add(node_id)

            tagged_count = 0
            for item in elites:
                if isinstance(item, dict):
                    item_copy = dict(item)
                    item_copy['nodeId'] = node_id
                    pool['elites'].append(item_copy)
                    tagged_count += 1

            # Auto-prune old migration pools older than 5 epochs
            old_epochs = [ep for ep in cls.migration_pools.keys() if ep < epoch - 5]
            for old_ep in old_epochs:
                del cls.migration_pools[old_ep]

            return {
                'status': 'success',
                'epoch': epoch,
                'submittedCount': tagged_count,
                'totalInPool': len(pool['elites']),
                'nodesCount': len(pool['submitted_nodes'])
            }

    @classmethod
    def get_migration_pool(cls, node_id: str, epoch: int, limit: int = 10) -> dict:
        with cls._lock:
            pool = cls.migration_pools.get(epoch)
            now = time.time()
            active_nodes_count = len([n for n in cls.nodes.values() if (now - n.get('lastHeartbeat', 0)) <= 30.0])

            if not pool:
                # If exact epoch not submitted yet, check latest available epoch
                recent_epochs = sorted(cls.migration_pools.keys(), reverse=True)
                if recent_epochs:
                    epoch = recent_epochs[0]
                    pool = cls.migration_pools[epoch]
                else:
                    return {
                        'epoch': epoch,
                        'elites': [],
                        'totalInPool': 0,
                        'foreignCount': 0,
                        'nodesCount': max(active_nodes_count, 1)
                    }

            # Filter out candidates originating from this node
            candidates = [
                e for e in pool['elites']
                if e.get('nodeId') != node_id
            ]
            candidates.sort(key=lambda x: float(x.get('fitness', 0) or 0), reverse=True)

            nodes_count = max(len(pool['submitted_nodes']), active_nodes_count, 1)

            return {
                'epoch': epoch,
                'elites': candidates[:limit],
                'totalInPool': len(pool['elites']),
                'foreignCount': len(candidates),
                'nodesCount': nodes_count
            }


def sanitize_filename(name: str) -> str:
    """Sanitize string to be a safe filename without path traversal."""
    cleaned = re.sub(r'[^a-zA-Z0-9_\-\.]', '_', name.strip())
    if not cleaned.endswith('.json'):
        cleaned += '.json'
    return os.path.basename(cleaned)


class SaveMetadataManager:
    """
    Maintains a merged index of metadata for all simulation saves in saves/metadata.json.
    Eliminates multi-gigabyte JSON parsing overhead on the save/load menu.
    """
    _lock = threading.Lock()

    @classmethod
    def load_index(cls) -> dict:
        if METADATA_FILE.exists():
            try:
                with open(METADATA_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    if isinstance(data, dict) and 'saves' in data:
                        return data
            except Exception as e:
                print(f"[Metadata] Warning: Failed reading {METADATA_FILE.name}: {e}")
        return {'version': 1, 'lastUpdated': None, 'saves': {}}

    @classmethod
    def save_index(cls, index: dict):
        tmp_file = METADATA_FILE.with_suffix('.json.tmp')
        try:
            index['lastUpdated'] = datetime.now().isoformat()
            with open(tmp_file, 'w', encoding='utf-8') as f:
                json.dump(index, f, indent=2)
            os.replace(tmp_file, METADATA_FILE)
        except Exception as e:
            if tmp_file.exists():
                try:
                    tmp_file.unlink()
                except Exception:
                    pass
            print(f"[Metadata] Error saving index: {e}")

    @classmethod
    def extract_metadata_from_file(cls, file_path: Path) -> dict:
        stat = file_path.stat()
        file_size = stat.st_size
        mtime = stat.st_mtime
        filename = file_path.name
        is_autosave = filename.startswith('autosave_')

        # Read first 32KB for rapid metadata extraction without parsing gigabyte arrays
        head = ""
        try:
            with open(file_path, 'rb') as f:
                head = f.read(32768).decode('utf-8', errors='ignore')
        except Exception:
            pass

        if '"isAutosave": true' in head or '"isAutosave":true' in head:
            is_autosave = True

        is_multi = '"isMultiIsland": true' in head or '"isMultiIsland":true' in head or 'multi' in filename

        # Name
        m_name = re.search(r'"name":\s*"([^"]+)"', head)
        name = m_name.group(1) if m_name else file_path.stem

        # Timestamp
        m_ts = re.search(r'"timestamp":\s*"([^"]+)"', head)
        timestamp = m_ts.group(1) if m_ts else datetime.fromtimestamp(mtime).isoformat()

        # Formatted modified string
        try:
            if 'T' in str(timestamp):
                modified = timestamp.split('.')[0].replace('T', ' ')
            else:
                modified = datetime.fromtimestamp(mtime).strftime('%Y-%m-%d %H:%M:%S')
        except Exception:
            modified = datetime.fromtimestamp(mtime).strftime('%Y-%m-%d %H:%M:%S')

        # Tick
        tick = 0
        m_tick_file = re.search(r'_tick_(\d+)', filename)
        if m_tick_file:
            tick = int(m_tick_file.group(1))
        else:
            m_tick = re.search(r'"tick":\s*(\d+)', head)
            if m_tick:
                tick = int(m_tick.group(1))

        # Population
        pop = 0
        m_pop = re.search(r'"totalPopulation":\s*(\d+)', head)
        if m_pop:
            pop = int(m_pop.group(1))
        else:
            m_pop2 = re.search(r'"agentCount":\s*(\d+)', head)
            if m_pop2:
                pop = int(m_pop2.group(1))
            else:
                m_isl_count = re.search(r'"islandCount":\s*(\d+)', head)
                if m_isl_count:
                    pop = int(m_isl_count.group(1)) * 100
                elif not is_multi and file_size < 10 * 1024 * 1024:
                    try:
                        with open(file_path, 'r', encoding='utf-8') as f:
                            d = json.load(f)
                        pop = d.get('agentCount', len(d.get('agents', [])))
                        tick = d.get('tick', tick)
                    except Exception:
                        pass

        island_count = 1
        m_isl = re.search(r'"islandCount":\s*(\d+)', head)
        if m_isl:
            island_count = int(m_isl.group(1))
        elif is_multi:
            island_count = 8

        return {
            'filename': filename,
            'name': name,
            'timestamp': timestamp,
            'modified': modified,
            'tick': tick,
            'population': pop,
            'agentCount': pop,
            'fileSize': file_size,
            'isAutosave': is_autosave,
            'isMultiIsland': is_multi,
            'islandCount': island_count,
            'mtime': mtime
        }

    @classmethod
    def record_save_from_payload(cls, filename: str, data: dict, file_size: int):
        """Immediately update metadata index for a newly saved file using in-memory data."""
        with cls._lock:
            index = cls.load_index()
            saves_map = index.get('saves', {})

            is_multi = bool(data.get('isMultiIsland', False))
            islands = data.get('islands', [])
            active_idx = data.get('activeIslandIndex', 0)

            if is_multi and islands:
                active_isl = islands[active_idx] if active_idx < len(islands) else islands[0]
                tick = active_isl.get('tick', data.get('tick', 0))
                pop = data.get('totalPopulation', sum(len(isl.get('agents', [])) for isl in islands))
            else:
                tick = data.get('tick', 0)
                pop = data.get('agentCount', len(data.get('agents', [])))

            target = SAVES_DIR / filename
            mtime = target.stat().st_mtime if target.exists() else time.time()
            timestamp = data.get('timestamp', datetime.now().isoformat())

            try:
                if 'T' in str(timestamp):
                    modified = timestamp.split('.')[0].replace('T', ' ')
                else:
                    modified = datetime.fromtimestamp(mtime).strftime('%Y-%m-%d %H:%M:%S')
            except Exception:
                modified = datetime.fromtimestamp(mtime).strftime('%Y-%m-%d %H:%M:%S')

            entry = {
                'filename': filename,
                'name': data.get('name', filename.replace('.json', '')),
                'timestamp': timestamp,
                'modified': modified,
                'tick': tick,
                'population': pop,
                'agentCount': pop,
                'fileSize': file_size,
                'isAutosave': bool(data.get('isAutosave', False) or filename.startswith('autosave_')),
                'isMultiIsland': is_multi,
                'islandCount': data.get('islandCount', len(islands) if is_multi else 1),
                'mtime': mtime
            }

            saves_map[filename] = entry
            index['saves'] = saves_map
            cls.save_index(index)

    @classmethod
    def remove_save(cls, filename: str):
        """Remove deleted save file from metadata index."""
        with cls._lock:
            index = cls.load_index()
            saves_map = index.get('saves', {})
            if filename in saves_map:
                del saves_map[filename]
                index['saves'] = saves_map
                cls.save_index(index)

    @classmethod
    def sync_index(cls) -> dict:
        """
        Scans saves/ directory and updates metadata.json incrementally:
        - Detects newly added or modified save files and extracts their metadata.
        - Detects deleted save files and purges them from the index.
        - Skips existing unchanged files based on mtime and fileSize.
        """
        with cls._lock:
            index = cls.load_index()
            saves_map = index.get('saves', {})
            modified_index = False

            disk_files = {}
            if SAVES_DIR.exists():
                for p in SAVES_DIR.glob('*.json'):
                    if p.name == 'metadata.json' or p.name.startswith('.') or p.name.startswith('_'):
                        continue
                    try:
                        st = p.stat()
                        disk_files[p.name] = (p, st)
                    except Exception:
                        continue

            # 1. Prune missing files
            for cached_name in list(saves_map.keys()):
                if cached_name not in disk_files:
                    del saves_map[cached_name]
                    modified_index = True

            # 2. Add or update unprocessed/modified files
            for fname, (p, st) in disk_files.items():
                cached = saves_map.get(fname)
                if cached and abs(cached.get('mtime', 0) - st.st_mtime) < 1.0 and cached.get('fileSize') == st.st_size:
                    continue

                try:
                    entry = cls.extract_metadata_from_file(p)
                    saves_map[fname] = entry
                    modified_index = True
                except Exception as e:
                    print(f"[Metadata] Failed to extract metadata for {fname}: {e}")

            if modified_index or not METADATA_FILE.exists():
                index['saves'] = saves_map
                cls.save_index(index)

            return index

    @classmethod
    def get_saves_list(cls) -> list:
        if not METADATA_FILE.exists():
            index = cls.sync_index()
        else:
            index = cls.load_index()
            if not index.get('saves'):
                index = cls.sync_index()

        saves = list(index.get('saves', {}).values())
        saves.sort(key=lambda x: str(x.get('timestamp') or x.get('mtime', '')), reverse=True)
        return saves


class BiomeShiftersRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def log_message(self, format, *args):
        """Suppress noisy periodic heartbeat and snooper snapshot logs from flooding the terminal."""
        path_str = getattr(self, 'path', '')
        if path_str and any(noisy in path_str for noisy in ('/api/cluster/heartbeat', '/api/cluster/island/snapshot', '/api/cluster/snooper')):
            return
        if args and any(any(noisy in str(arg) for noisy in ('/api/cluster/heartbeat', '/api/cluster/island/snapshot', '/api/cluster/snooper')) for arg in args):
            return
        super().log_message(format, *args)

    def end_headers(self):
        """Ensure static frontend assets are revalidated by clients and not served stale from cache."""
        if not any(b'cache-control' in h.lower() for h in getattr(self, '_headers_buffer', [])):
            self.send_header('Cache-Control', 'no-cache, must-revalidate')
        super().end_headers()


    def _send_json(self, status_code: int, data: dict | list):
        payload = json.dumps(data).encode('utf-8')
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def is_localhost_request(self) -> bool:
        client_ip = self.client_address[0]
        return client_ip in ('127.0.0.1', '::1', 'localhost', get_lan_ip()) or client_ip.startswith('127.')

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # Version endpoint
        if path == '/api/version' or path == '/api/version/':
            self._handle_version()
            return

        # Cluster endpoints
        if path == '/api/cluster/status' or path == '/api/cluster/status/':
            self._handle_cluster_status()
            return

        if path == '/api/cluster/nodes' or path == '/api/cluster/nodes/':
            self._handle_cluster_nodes()
            return

        if path == '/api/cluster/migration/pool' or path == '/api/cluster/migration/pool/':
            self._handle_cluster_migration_pool()
            return

        if path == '/api/cluster/island/snapshot' or path == '/api/cluster/island/snapshot/':
            self._handle_cluster_island_snapshot_get(parsed.query)
            return

        # List all saved simulations: GET /api/saves
        if path == '/api/saves' or path == '/api/saves/':
            self._handle_list_saves()
            return

        # Fetch a specific save: GET /api/saves/<filename>
        if path.startswith('/api/saves/'):
            filename = urllib.parse.unquote(path[len('/api/saves/'):])
            self._handle_get_save(filename)
            return

        # Fallback to static file server
        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # Cluster endpoints
        if path == '/api/cluster/join' or path == '/api/cluster/join/':
            self._handle_cluster_join()
            return

        if path == '/api/cluster/heartbeat' or path == '/api/cluster/heartbeat/':
            self._handle_cluster_heartbeat()
            return

        if path == '/api/cluster/leave' or path == '/api/cluster/leave/':
            self._handle_cluster_leave()
            return

        if path == '/api/cluster/control' or path == '/api/cluster/control/':
            self._handle_cluster_control()
            return

        if path == '/api/cluster/node/kick' or path == '/api/cluster/node/kick/':
            self._handle_cluster_node_kick()
            return

        if path == '/api/cluster/node/rename' or path == '/api/cluster/node/rename/':
            self._handle_cluster_node_rename()
            return

        if path == '/api/cluster/node/visibility' or path == '/api/cluster/node/visibility/':
            self._handle_cluster_node_visibility()
            return

        if path == '/api/cluster/node/perf' or path == '/api/cluster/node/perf/':
            self._handle_cluster_node_perf()
            return

        if path == '/api/cluster/island/radiation' or path == '/api/cluster/island/radiation/':
            self._handle_cluster_island_radiation()
            return

        if path == '/api/cluster/gpu' or path == '/api/cluster/gpu/':
            self._handle_cluster_gpu()
            return

        if path == '/api/cluster/snooper/watch' or path == '/api/cluster/snooper/watch/':
            self._handle_cluster_snooper_watch()
            return

        if path == '/api/cluster/snooper/stop' or path == '/api/cluster/snooper/stop/':
            self._handle_cluster_snooper_stop()
            return

        if path == '/api/cluster/island/snapshot' or path == '/api/cluster/island/snapshot/':
            self._handle_cluster_island_snapshot_post()
            return

        if path == '/api/cluster/migration/submit' or path == '/api/cluster/migration/submit/':
            self._handle_cluster_migration_submit()
            return

        # Save simulation: POST /api/saves
        if path == '/api/saves' or path == '/api/saves/':
            self._handle_save()
            return

        # Diagnostics trace upload: POST /api/debug/trace
        if path == '/api/debug/trace' or path == '/api/debug/trace/':
            self._handle_debug_trace()
            return

        self._send_json(404, {'error': 'Endpoint not found'})

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # Delete a save: DELETE /api/saves/<filename>
        if path.startswith('/api/saves/'):
            filename = urllib.parse.unquote(path[len('/api/saves/'):])
            self._handle_delete_save(filename)
            return

        self._send_json(404, {'error': 'Endpoint not found'})

    def _handle_list_saves(self):
        saves = SaveMetadataManager.get_saves_list()
        self._send_json(200, {'saves': saves})

    def _handle_get_save(self, filename: str):
        safe_name = sanitize_filename(filename)
        target = SAVES_DIR / safe_name
        if not target.exists() or not target.is_file():
            self._send_json(404, {'error': f'Save file {safe_name} not found'})
            return

        try:
            with open(target, 'r', encoding='utf-8') as f:
                data = json.load(f)
            self._send_json(200, data)
        except Exception as e:
            self._send_json(500, {'error': f'Failed to read save: {str(e)}'})

    def _handle_save(self):
        content_length = int(self.headers.get('Content-Length', 0))
        if content_length == 0:
            self._send_json(400, {'error': 'No data received'})
            return

        try:
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body)

            is_autosave = bool(data.get('isAutosave', False))
            name = data.get('name') or f"save_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            if is_autosave and not name.startswith('autosave_'):
                name = f"autosave_{name}"
            safe_name = sanitize_filename(name)
            target = SAVES_DIR / safe_name

            data['timestamp'] = datetime.now().isoformat()
            data['name'] = safe_name.replace('.json', '')
            data['isAutosave'] = is_autosave

            with open(target, 'w', encoding='utf-8') as f:
                json.dump(data, f)

            # Incrementally update metadata cache for this newly saved file
            file_size = target.stat().st_size
            SaveMetadataManager.record_save_from_payload(safe_name, data, file_size)

            self._send_json(200, {
                'status': 'success',
                'filename': safe_name,
                'isAutosave': is_autosave,
                'message': f'Simulation saved as {safe_name}'
            })
        except Exception as e:
            self._send_json(500, {'error': f'Failed to save simulation: {str(e)}'})

    def _handle_delete_save(self, filename: str):
        safe_name = sanitize_filename(filename)
        target = SAVES_DIR / safe_name
        if not target.exists():
            self._send_json(404, {'error': f'Save file {safe_name} not found'})
            return

        try:
            target.unlink()
            SaveMetadataManager.remove_save(safe_name)
            self._send_json(200, {'status': 'success', 'message': f'{safe_name} deleted'})
        except Exception as e:
            self._send_json(500, {'error': f'Failed to delete: {str(e)}'})

    def _handle_version(self):
        self._send_json(200, get_build_version())

    def _handle_cluster_status(self):
        summary = ClusterManager.get_cluster_summary(self.client_address[0], self.is_localhost_request())
        self._send_json(200, summary)

    def _handle_cluster_nodes(self):
        nodes = ClusterManager.get_all_nodes()
        self._send_json(200, {
            'nodes': nodes,
            'isHost': self.is_localhost_request(),
            'hostIp': get_lan_ip(),
            'port': PORT,
            'gpuEnabled': ClusterManager.gpu_enabled
        })

    def _handle_cluster_join(self):
        content_length = int(self.headers.get('Content-Length', 0))
        try:
            body = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else '{}'
            data = json.loads(body)
            name = data.get('name', 'Guest')
            requested_cores = data.get('requestedCores', 2)
            reg = ClusterManager.register_node(name, requested_cores, self.client_address[0])
            self._send_json(200, reg)
        except Exception as e:
            self._send_json(500, {'error': f'Failed to join cluster: {str(e)}'})

    def _handle_cluster_heartbeat(self):
        content_length = int(self.headers.get('Content-Length', 0))
        try:
            body = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else '{}'
            data = json.loads(body)
            node_id = data.get('nodeId')
            if not node_id:
                self._send_json(400, {'error': 'Missing nodeId'})
                return
            telemetry = data.get('telemetry', [])
            tps = data.get('tps', 0)
            population = data.get('population', 0)
            name = data.get('name')
            cores = data.get('cores')
            island_ids = data.get('islandIds')
            res = ClusterManager.heartbeat(
                node_id,
                telemetry=telemetry,
                tps=tps,
                population=population,
                name=name,
                cores=cores,
                island_ids=island_ids,
                client_ip=self.client_address[0]
            )
            self._send_json(200, res)
        except Exception as e:
            self._send_json(500, {'error': f'Heartbeat error: {str(e)}'})

    def _handle_cluster_leave(self):
        content_length = int(self.headers.get('Content-Length', 0))
        try:
            body = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else '{}'
            data = json.loads(body)
            node_id = data.get('nodeId')
            if node_id:
                ClusterManager.unregister_node(node_id)
            self._send_json(200, {'status': 'unregistered'})
        except Exception as e:
            self._send_json(500, {'error': f'Leave error: {str(e)}'})

    def _handle_cluster_control(self):
        if not self.is_localhost_request():
            self._send_json(403, {'error': 'Cluster control is restricted to Host admin (localhost)'})
            return
        content_length = int(self.headers.get('Content-Length', 0))
        try:
            body = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else '{}'
            data = json.loads(body)
            ClusterManager.update_control(
                is_paused=data.get('isPaused'),
                speed=data.get('speed'),
                is_turbo=data.get('isTurbo'),
                tick=data.get('tick'),
                migration_epoch=data.get('migrationEpoch')
            )
            self._send_json(200, {'status': 'updated'})
        except Exception as e:
            self._send_json(500, {'error': f'Control update error: {str(e)}'})

    def _handle_cluster_node_kick(self):
        if not self.is_localhost_request():
            self._send_json(403, {'error': 'Cluster administration is restricted to Host admin (localhost)'})
            return
        content_length = int(self.headers.get('Content-Length', 0))
        try:
            body = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else '{}'
            data = json.loads(body)
            node_id = data.get('nodeId')
            res = ClusterManager.kick_node(node_id)
            self._send_json(200, res)
        except Exception as e:
            self._send_json(500, {'error': f'Failed to kick node: {str(e)}'})

    def _handle_cluster_node_rename(self):
        if not self.is_localhost_request():
            self._send_json(403, {'error': 'Cluster administration is restricted to Host admin (localhost)'})
            return
        content_length = int(self.headers.get('Content-Length', 0))
        try:
            body = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else '{}'
            data = json.loads(body)
            node_id = data.get('nodeId')
            name = data.get('name')
            res = ClusterManager.rename_node(node_id, name)
            self._send_json(200, res)
        except Exception as e:
            self._send_json(500, {'error': f'Failed to rename node: {str(e)}'})

    def _handle_cluster_node_visibility(self):
        if not self.is_localhost_request():
            self._send_json(403, {'error': 'Cluster administration is restricted to Host admin (localhost)'})
            return
        content_length = int(self.headers.get('Content-Length', 0))
        try:
            body = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else '{}'
            data = json.loads(body)
            node_id = data.get('nodeId')
            is_hidden = bool(data.get('isHidden', False))
            res = ClusterManager.set_node_visibility(node_id, is_hidden)
            self._send_json(200, res)
        except Exception as e:
            self._send_json(500, {'error': f'Failed to update node visibility: {str(e)}'})

    def _handle_cluster_node_perf(self):
        if not self.is_localhost_request():
            self._send_json(403, {'error': 'Cluster administration is restricted to Host admin (localhost)'})
            return
        content_length = int(self.headers.get('Content-Length', 0))
        try:
            body = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else '{}'
            data = json.loads(body)
            node_id = data.get('nodeId')
            perf_mode = data.get('perfMode')
            res = ClusterManager.set_node_perf(node_id, perf_mode)
            self._send_json(200, res)
        except Exception as e:
            self._send_json(500, {'error': f'Failed to update node performance: {str(e)}'})

    def _handle_cluster_island_radiation(self):
        if not self.is_localhost_request():
            self._send_json(403, {'error': 'Cluster administration is restricted to Host admin (localhost)'})
            return
        content_length = int(self.headers.get('Content-Length', 0))
        try:
            body = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else '{}'
            data = json.loads(body)
            island_id = data.get('islandId')
            enabled = bool(data.get('enabled', False))
            res = ClusterManager.set_island_radiation(island_id, enabled)
            self._send_json(200, res)
        except Exception as e:
            self._send_json(500, {'error': f'Failed to update island radiation: {str(e)}'})

    def _handle_cluster_gpu(self):
        if not self.is_localhost_request():
            self._send_json(403, {'error': 'Cluster administration is restricted to Host admin (localhost)'})
            return
        content_length = int(self.headers.get('Content-Length', 0))
        try:
            body = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else '{}'
            data = json.loads(body)
            enabled = bool(data.get('enabled', False))
            res = ClusterManager.set_gpu_mode(enabled)
            self._send_json(200, res)
        except Exception as e:
            self._send_json(500, {'error': f'Failed to set GPU mode: {str(e)}'})

    def _handle_cluster_migration_pool(self):
        parsed = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(parsed.query)
        node_id = qs.get('nodeId', [''])[0]
        if not node_id and self.is_localhost_request():
            node_id = 'host_local'
        try:
            epoch = int(qs.get('epoch', [0])[0])
        except ValueError:
            epoch = 0
        try:
            limit = int(qs.get('limit', [10])[0])
        except ValueError:
            limit = 10

        result = ClusterManager.get_migration_pool(node_id, epoch, limit)
        self._send_json(200, result)

    def _handle_cluster_migration_submit(self):
        content_length = int(self.headers.get('Content-Length', 0))
        try:
            body = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else '{}'
            data = json.loads(body)
            node_id = data.get('nodeId') or ('host_local' if self.is_localhost_request() else 'unknown')
            epoch = int(data.get('epoch', 0))
            elites = data.get('elites', [])
            if not isinstance(elites, list):
                elites = []
            result = ClusterManager.submit_elites(node_id, epoch, elites)
            self._send_json(200, result)
        except Exception as e:
            self._send_json(500, {'error': f'Migration submit error: {str(e)}'})

    def _handle_cluster_snooper_watch(self):
        if not self.is_localhost_request():
            self._send_json(403, {'error': 'Snooper watch is restricted to Host admin (localhost)'})
            return
        content_length = int(self.headers.get('Content-Length', 0))
        try:
            body = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else '{}'
            data = json.loads(body)
            island_id = data.get('islandId')
            duration = float(data.get('duration', 4.0))
            res = ClusterManager.set_snooper_watch(island_id, duration)
            self._send_json(200, res)
        except Exception as e:
            self._send_json(500, {'error': f'Failed to set snooper watch: {str(e)}'})

    def _handle_cluster_snooper_stop(self):
        if not self.is_localhost_request():
            self._send_json(403, {'error': 'Snooper stop is restricted to Host admin (localhost)'})
            return
        try:
            res = ClusterManager.clear_snooper_watch()
            self._send_json(200, res)
        except Exception as e:
            self._send_json(500, {'error': f'Failed to stop snooper: {str(e)}'})

    def _handle_cluster_island_snapshot_post(self):
        content_length = int(self.headers.get('Content-Length', 0))
        try:
            body = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else '{}'
            data = json.loads(body)
            island_id = data.get('islandId')
            res = ClusterManager.store_snapshot(island_id, data)
            self._send_json(200, res)
        except Exception as e:
            self._send_json(500, {'error': f'Failed to store snapshot: {str(e)}'})

    def _handle_cluster_island_snapshot_get(self, query_string):
        qs = urllib.parse.parse_qs(query_string or '')
        raw_id = qs.get('islandId', [None])[0]
        if raw_id is None:
            self._send_json(400, {'error': 'Missing islandId parameter'})
            return
        try:
            iid = int(raw_id)
        except ValueError:
            self._send_json(400, {'error': 'Invalid islandId'})
            return
        snap = ClusterManager.get_snapshot(iid)
        if snap is None:
            self._send_json(404, {'error': 'No snapshot available for this island', 'islandId': iid})
            return
        self._send_json(200, snap)

    def _handle_debug_trace(self):
        content_length = int(self.headers.get('Content-Length', 0))
        if content_length <= 0:
            self._send_json(400, {'error': 'Empty trace body'})
            return

        try:
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body)
        except Exception as e:
            self._send_json(400, {'error': f'Invalid JSON payload: {e}'})
            return

        timestamp = time.strftime('%Y%m%d_%H%M%S')
        filename = f"trace_{timestamp}.json"
        target = DEBUG_DIR / filename
        latest_target = DEBUG_DIR / "trace_latest.json"

        try:
            with open(target, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2)

            with open(latest_target, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2)

            event_count = len(data.get('events', []))
            print(f"[FlightRecorder] Trace saved: {filename} ({event_count} events)")
            self._send_json(200, {
                'status': 'ok',
                'filename': filename,
                'eventCount': event_count
            })
        except Exception as e:
            self._send_json(500, {'error': f'Failed to write trace: {e}'})


if __name__ == '__main__':
    lan_ip = get_lan_ip()
    print('=' * 64)
    print(f'  🌍 Biome Shifters — Multi-Machine LAN Cluster Server')
    print(f'  👑 Admin Web UI (Localhost):   http://localhost:{PORT}')
    print(f'  💻 LAN Join Link (Friends):    http://{lan_ip}:{PORT}')
    print(f'  📁 Saves directory:            {SAVES_DIR}')
    print('=' * 64)
    print('Syncing save metadata index...')
    t_start = time.time()
    index_data = SaveMetadataManager.sync_index()
    count = len(index_data.get('saves', {}))
    print(f'Metadata index ready: {count} saves indexed in {time.time() - t_start:.3f}s.')
    server = http.server.ThreadingHTTPServer(('0.0.0.0', PORT), BiomeShiftersRequestHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nServer stopped.')
