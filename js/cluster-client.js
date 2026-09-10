/**
 * Biome Shifters — Cluster LAN Client Coordinator
 * Manages communication with server.py for LAN cluster registration,
 * periodic heartbeat telemetry dispatch, and remote simulation state synchronization.
 */

import { CONFIG } from './config.js';

export class ClusterClient {
  constructor(options = {}) {
    this.apiBase = options.apiBase || '';
    this.nodeId = options.nodeId || null;
    this.name = options.name || 'Node';
    this.isHost = Boolean(options.isHost);
    this.islandIds = options.islandIds || [];
    this.heartbeatIntervalMs = options.heartbeatIntervalMs || 1000;
    this.heartbeatTimer = null;
    this.islandManager = null;
    this.lastGlobalState = null;
    this.listeners = new Map();
    this.isHeartbeatPending = false;
    this.isClusterMigrating = false;
    this.isHidden = false;
    this.perfMode = options.perfMode || 'turbo';
    this.isSnapshotDispatching = false;

    // Resilience & Version synchronization tracking
    this.lastHeartbeatSuccessTime = Date.now();
    this.isAutoPausedDueToDisconnect = false;
    this.clientBuildVersion = null;
    this.retryIntervalMs = 3000;
    this.autoDisconnectThresholdMs = 180000; // 3 minutes (180s)
    this.gpuFailed = false; // Flag to prevent infinite retry when GPU init fails
    this.gpuRequestSeq = 0; // Monotonic request sequence counter to prevent out-of-order race conditions
  }


  /**
   * Register event listener
   */
  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  /**
   * Remove event listener
   */
  off(event, handler) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(handler);
    }
  }

  /**
   * Emit event to registered listeners
   */
  emit(event, data) {
    if (this.listeners.has(event)) {
      for (const handler of this.listeners.get(event)) {
        try {
          handler(data);
        } catch (err) {
          console.error(`[ClusterClient] Error in listener for ${event}:`, err);
        }
      }
    }
  }

  /**
   * Check cluster status and determine if current browser session is Host or Client
   */
  async checkStatus() {
    try {
      const resp = await fetch(`${this.apiBase}/api/cluster/status`, {
        cache: 'no-store'
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      this.isHost = Boolean(data.isHost);
      if (data.buildVersion && data.buildVersion.version && !this.clientBuildVersion) {
        this.clientBuildVersion = data.buildVersion.version;
      }
      return data;
    } catch (err) {
      console.warn('[ClusterClient] Failed to fetch cluster status:', err);
      return null;
    }
  }

  /**
   * Register this browser session as a contributor node in the cluster
   */
  async join(name, requestedCores = 2) {
    try {
      const resp = await fetch(`${this.apiBase}/api/cluster/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name || this.name,
          requestedCores: Math.max(1, Math.min(16, parseInt(requestedCores, 10) || 2))
        })
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();

      this.nodeId = data.nodeId;
      this.name = data.name;
      this.islandIds = Array.isArray(data.islandIds) ? data.islandIds : [];
      this.lastGlobalState = data.globalState || null;
      if (data.perfMode) this.perfMode = data.perfMode;
      if (data.buildVersion && data.buildVersion.version) {
        this.clientBuildVersion = data.buildVersion.version;
      }

      this.emit('joined', data);
      return data;
    } catch (err) {
      console.error('[ClusterClient] Failed to join cluster:', err);
      throw err;
    }
  }

  /**
   * Bind IslandManager and start periodic heartbeat loop
   */
  startHeartbeat(islandManager, intervalMs = null) {
    this.islandManager = islandManager;
    if (intervalMs) this.heartbeatIntervalMs = intervalMs;

    this.stopHeartbeat();

    // Initial heartbeat
    this.sendHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, this.heartbeatIntervalMs);
  }

  /**
   * Stop periodic heartbeat loop
   */
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Send heartbeat telemetry payload to cluster coordinator
   */
  async sendHeartbeat() {
    if (this.isHeartbeatPending || !this.islandManager) return;
    this.isHeartbeatPending = true;

    try {
      // Collect per-island telemetry snapshots for assigned islands
      const telemetryList = [];
      for (const id of this.islandManager.islandIds) {
        if (this.islandManager.telemetry[id]) {
          telemetryList.push(this.islandManager.telemetry[id]);
        }
      }

      const tps = this.islandManager.getCombinedTps();
      const population = this.islandManager.getTotalPopulation();

      const payload = {
        nodeId: this.nodeId || 'host_local',
        name: this.name,
        cores: this.islandIds.length || 2,
        islandIds: this.islandIds,
        telemetry: telemetryList,
        tps,
        population
      };

      const resp = await fetch(`${this.apiBase}/api/cluster/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (resp.ok) {
        const data = await resp.json();
        this.lastHeartbeatSuccessTime = Date.now();

        // Check version mismatch
        if (data.buildVersion && data.buildVersion.version) {
          if (!this.clientBuildVersion) {
            this.clientBuildVersion = data.buildVersion.version;
          } else if (this.clientBuildVersion !== data.buildVersion.version) {
            this.emit('version_mismatch', data.buildVersion);
          }
        }

        // Check auto-reconnect from disconnect pause
        if (this.isAutoPausedDueToDisconnect) {
          this.isAutoPausedDueToDisconnect = false;
          this.emit('reconnected_from_pause');
        }

        // Check if node has been kicked/removed by Host
        if (data.kicked || data.status === 'kicked') {
          this.stopHeartbeat();
          this.nodeId = null;
          this.emit('kicked', data.error || 'Removed by Host Admin');
          return;
        }

        const globalState = data.globalState;
        if (globalState) {
          this.syncRemoteState(globalState);
        }

        // Process Host-directed node state updates (name, visibility, perfMode)
        if (data.nodeState) {
          if (data.nodeState.name && data.nodeState.name !== this.name) {
            this.name = data.nodeState.name;
            this.emit('name_change', this.name);
          }
          if (typeof data.nodeState.isHidden === 'boolean' && data.nodeState.isHidden !== this.isHidden) {
            this.isHidden = data.nodeState.isHidden;
            this.emit('visibility_change', this.isHidden);
          }
          if (data.nodeState.perfMode && data.nodeState.perfMode !== this.perfMode) {
            // Guard: If we are running in Turbo mode (or globalState.isTurbo is active),
            // do not allow a stale or default 'standard' perfMode to downgrade and kill Turbo
            const isTurboActive = Boolean(this.islandManager?.isTurbo || globalState?.isTurbo || this.perfMode === 'turbo');
            if (isTurboActive && data.nodeState.perfMode === 'standard') {
              // Maintain Turbo mode; ignore stale heartbeat downgrade
            } else {
              this.perfMode = data.nodeState.perfMode;
              if (this.islandManager && typeof this.islandManager.setPerfMode === 'function') {
                this.islandManager.setPerfMode(this.perfMode);
              }
              this.emit('perf_mode_change', this.perfMode);
            }
          }
        }

        this.emit('heartbeat', { globalState, tps, population, nodeState: data.nodeState });
      }
    } catch (err) {
      // Check continuous offline threshold (3 minutes continuous heartbeat failure)
      const offlineDuration = Date.now() - this.lastHeartbeatSuccessTime;
      if (offlineDuration >= this.autoDisconnectThresholdMs && !this.isAutoPausedDueToDisconnect) {
        this.isAutoPausedDueToDisconnect = true;
        this.emit('auto_disconnect_pause', { offlineDuration });
      }

      // Non-fatal: Network packet dropped or temporary connection blip
      this.emit('heartbeat_error', err);
    } finally {
      this.isHeartbeatPending = false;
    }
  }

  /**
   * Synchronize local IslandManager state with cluster coordinator commands
   */
  syncRemoteState(globalState) {
    if (!this.islandManager) return;

    // Synchronize pause state
    if (typeof globalState.isPaused === 'boolean' && globalState.isPaused !== this.islandManager.isPaused) {
      this.islandManager.setPause(globalState.isPaused);
      this.emit('pause_change', globalState.isPaused);
    }

    // Synchronize speed & turbo state
    const targetSpeed = globalState.speed || 1;
    const targetTurbo = Boolean(globalState.isTurbo);
    if (targetSpeed !== this.islandManager.speed || targetTurbo !== this.islandManager.isTurbo) {
      this.islandManager.setSpeed(targetSpeed, targetTurbo);
      this.emit('speed_change', { speed: targetSpeed, isTurbo: targetTurbo });
    }

    // Check migration epoch progression
    if (typeof globalState.migrationEpoch === 'number' && globalState.migrationEpoch > this.islandManager.migrationEpoch) {
      const newEpoch = globalState.migrationEpoch;
      this.islandManager.migrationEpoch = newEpoch;
      this.emit('migration_epoch', newEpoch);
      this.handleClusterMigration(newEpoch);
    }

    // Synchronize irradiated islands state
    if (Array.isArray(globalState.irradiatedIslands)) {
      const irradiatedSet = new Set(globalState.irradiatedIslands);
      for (const id of this.islandManager.islandIds) {
        const shouldBeIrradiated = irradiatedSet.has(id);
        if (this.islandManager.isIslandIrradiated(id) !== shouldBeIrradiated) {
          this.islandManager.setIslandRadiation(id, shouldBeIrradiated);
          this.emit('island_radiation_change', { islandId: id, enabled: shouldBeIrradiated });
        }
      }
    }

    // Synchronize GPU acceleration mode
    if (typeof globalState.gpuEnabled === 'boolean') {
      const wantGpu = globalState.gpuEnabled;
      if (!wantGpu) {
        this.gpuFailed = false;
      }
      if (this.islandManager && this.islandManager.isGpuGlobal !== wantGpu) {
        if (!wantGpu || !this.gpuFailed) {
          this.islandManager.setAllIslandsGpu(wantGpu);
          this.emit('gpu_mode_change', wantGpu);
        }
      }
    }

    // Demand-driven satellite snapshot request: check if Host is actively watching one of our islands
    if (globalState.requestedSnapshotIsland !== null && globalState.requestedSnapshotIsland !== undefined) {
      const targetIsland = parseInt(globalState.requestedSnapshotIsland, 10);
      if (this.islandManager.islandIds.includes(targetIsland)) {
        this.dispatchRequestedSnapshot(targetIsland);
      }
    }

    this.lastGlobalState = globalState;
  }

  /**
   * Submit local exported elites to the cluster migration pool
   */
  async submitElites(epoch, elites) {
    try {
      const resp = await fetch(`${this.apiBase}/api/cluster/migration/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeId: this.nodeId || 'host_local',
          epoch,
          elites
        })
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } catch (err) {
      console.warn('[ClusterClient] Failed to submit elites:', err);
      return null;
    }
  }

  /**
   * Fetch top foreign candidate elite brains from peer cluster machines
   */
  async fetchMigrationPool(epoch, limit = 10) {
    try {
      const nid = encodeURIComponent(this.nodeId || 'host_local');
      const resp = await fetch(`${this.apiBase}/api/cluster/migration/pool?nodeId=${nid}&epoch=${epoch}&limit=${limit}`, {
        cache: 'no-store'
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } catch (err) {
      console.warn('[ClusterClient] Failed to fetch migration pool:', err);
      return { epoch, elites: [], foreignCount: 0, totalInPool: 0, nodesCount: 0 };
    }
  }

  /**
   * Orchestrate full distributed cluster migration:
   * 1. Export local worker elites
   * 2. Submit to central pool
   * 3. Cross-breed local islands (if >1 local island)
   * 4. Fetch foreign elites and import into local workers
   */
  async handleClusterMigration(epoch) {
    if (!this.islandManager || this.isClusterMigrating) return;
    this.isClusterMigrating = true;

    try {
      // 1. Export local top elites from each local worker
      const exportResults = await this.islandManager.exportAllLocalElites(3);

      const allLocalElites = [];
      for (const res of exportResults) {
        for (const elite of (res.elites || [])) {
          allLocalElites.push({
            ...elite,
            nodeId: this.nodeId || 'host_local',
            originIsland: res.islandId
          });
        }
      }

      // 2. Submit local elites to server cluster migration pool
      if (allLocalElites.length > 0) {
        await this.submitElites(epoch, allLocalElites);
      }

      // 3. Cross-breed among local islands if multiple local islands exist
      let localCrossSpawned = 0;
      if (this.islandManager.islandIds.length > 1) {
        localCrossSpawned = this.islandManager.crossBreedLocalElites(exportResults);
      }

      // 4. Fetch foreign elite pool from other cluster machines
      let poolData = await this.fetchMigrationPool(epoch, 10);
      let foreignElites = poolData?.elites || [];

      // If this is Host and foreignElites is empty, poll for up to 3000ms for contributors to submit
      if (this.isHost && foreignElites.length === 0) {
        const maxPollTimeMs = 3000;
        const pollIntervalMs = 400;
        const startTime = Date.now();

        while (Date.now() - startTime < maxPollTimeMs && foreignElites.length === 0) {
          await new Promise((r) => setTimeout(r, pollIntervalMs));
          poolData = await this.fetchMigrationPool(epoch, 10);
          foreignElites = poolData?.elites || [];
          if (foreignElites.length > 0 || (poolData?.nodesCount && poolData.nodesCount > 1)) {
            break;
          }
        }
      }

      let foreignSpawned = 0;
      if (foreignElites.length > 0) {
        foreignSpawned = this.islandManager.importForeignElites(foreignElites, 2);
      }

      const totalSpawnedThisRound = localCrossSpawned + foreignSpawned;
      const eventData = {
        epoch,
        migrantsExchanged: totalSpawnedThisRound,
        localMigrants: localCrossSpawned,
        foreignMigrants: foreignSpawned,
        totalExchanged: this.islandManager.totalMigrantsExchanged,
        clusterPoolSize: poolData?.totalInPool || 0,
        nodesCount: poolData?.nodesCount || (this.isHost ? 1 : 2)
      };

      this.emit('migration_completed', eventData);
      if (typeof this.islandManager.onMigrationEvent === 'function') {
        this.islandManager.onMigrationEvent(eventData);
      }

      // If this is Host and foreignElites was still empty, schedule a follow-up pool pull
      // in 3500ms in case contributor nodes were delayed under heavy simulation load
      if (this.isHost && foreignElites.length === 0) {
        setTimeout(async () => {
          try {
            const retryPool = await this.fetchMigrationPool(epoch, 10);
            if (retryPool?.elites && retryPool.elites.length > 0) {
              const delayedForeignSpawned = this.islandManager.importForeignElites(retryPool.elites, 2);
              const followUpEvent = {
                epoch,
                migrantsExchanged: delayedForeignSpawned,
                foreignMigrants: delayedForeignSpawned,
                totalExchanged: this.islandManager.totalMigrantsExchanged,
                isDelayedHostPull: true,
                nodesCount: retryPool.nodesCount || 2
              };
              this.emit('migration_completed', followUpEvent);
              if (typeof this.islandManager.onMigrationEvent === 'function') {
                this.islandManager.onMigrationEvent(followUpEvent);
              }
            }
          } catch (err) {
            console.warn('[ClusterClient] Delayed migration pool fetch error:', err);
          }
        }, 3500);
      }

    } catch (err) {
      console.warn('[ClusterClient] Migration handling error:', err);
    } finally {
      this.isClusterMigrating = false;
    }
  }

  /**
   * Broadcast administrative simulation control commands (Host only)
   */
  async sendControl(controlState = {}) {
    try {
      const resp = await fetch(`${this.apiBase}/api/cluster/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(controlState)
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } catch (err) {
      console.error('[ClusterClient] Failed to send cluster control:', err);
      throw err;
    }
  }

  /**
   * Retrieve list of all connected cluster nodes
   */
  async fetchNodes() {
    try {
      const resp = await fetch(`${this.apiBase}/api/cluster/nodes`, {
        cache: 'no-store'
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } catch (err) {
      console.warn('[ClusterClient] Failed to fetch cluster nodes:', err);
      return { nodes: [], isHost: this.isHost, gpuEnabled: false };
    }
  }

  /**
   * Host administration: kick/remove contributor node
   */
  async kickNode(nodeId) {
    const resp = await fetch(`${this.apiBase}/api/cluster/node/kick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeId })
    });
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || `Failed to kick node: ${resp.statusText}`);
    }
    return await resp.json();
  }

  /**
   * Host administration: rename contributor node
   */
  async renameNode(nodeId, name) {
    const resp = await fetch(`${this.apiBase}/api/cluster/node/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeId, name })
    });
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || `Failed to rename node: ${resp.statusText}`);
    }
    return await resp.json();
  }

  /**
   * Host administration: toggle contributor visual visibility (zero-render screen saver)
   */
  async setNodeVisibility(nodeId, isHidden) {
    const resp = await fetch(`${this.apiBase}/api/cluster/node/visibility`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeId, isHidden: Boolean(isHidden) })
    });
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || `Failed to set node visibility: ${resp.statusText}`);
    }
    return await resp.json();
  }

  /**
   * Host administration: update contributor performance limiter mode ('eco' | 'standard' | 'turbo')
   */
  async setNodePerf(nodeId, perfMode) {
    const resp = await fetch(`${this.apiBase}/api/cluster/node/perf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeId, perfMode })
    });
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || `Failed to set node performance: ${resp.statusText}`);
    }
    return await resp.json();
  }

  /**
   * Host administration: toggle radiation / extreme mutation mode on any island (local or contributor)
   */
  async toggleIslandRadiation(islandId, enabled, multiplier = 4.0) {
    const targetId = parseInt(islandId, 10);
    const isTargetEnabled = Boolean(enabled);
    const mult = Number(multiplier) || 4.0;

    // Apply locally if this node manages the island for instant UI response
    if (this.islandManager && (typeof this.islandManager.hasIsland === 'function' ? this.islandManager.hasIsland(targetId) : this.islandManager.workerMap?.has(targetId))) {
      this.islandManager.setIslandRadiation(targetId, isTargetEnabled, mult);
    }

    const resp = await fetch(`${this.apiBase}/api/cluster/island/radiation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ islandId: targetId, enabled: isTargetEnabled, multiplier: mult })
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || `Failed to update island radiation: ${resp.statusText}`);
    }

    const data = await resp.json();
    this.emit('island_radiation_change', { islandId: targetId, enabled: isTargetEnabled, multiplier: mult });
    return data;
  }

  /**
   * Host administration: enable/disable GPU for all cluster nodes.
   * @param {boolean} enabled
   */
  async toggleClusterGpu(enabled) {
    const isTargetEnabled = Boolean(enabled);
    const seq = ++this.gpuRequestSeq;

    if (isTargetEnabled) {
      this.gpuFailed = false;
    }

    // Apply locally for instant response
    if (this.islandManager) {
      this.islandManager.setAllIslandsGpu(isTargetEnabled);
    }

    let resp;
    try {
      resp = await fetch(`${this.apiBase}/api/cluster/gpu`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: isTargetEnabled })
      });
    } catch (err) {
      if (seq !== this.gpuRequestSeq) return { superseded: true };
      throw err;
    }

    // Stale check: if superseded by a newer toggle request or failure, drop response
    if (seq !== this.gpuRequestSeq) {
      return { superseded: true };
    }

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || `Failed to set cluster GPU mode: ${resp.statusText}`);
    }

    const data = await resp.json();

    if (seq !== this.gpuRequestSeq) {
      return { superseded: true };
    }

    if (this.gpuFailed && isTargetEnabled) {
      return { aborted: true };
    }

    this.emit('gpu_mode_change', isTargetEnabled);
    return data;
  }

  /**
   * On-demand snapshot dispatch when requested by Host snooper
   */
  async dispatchRequestedSnapshot(islandId) {
    if (!this.islandManager || this.isSnapshotDispatching) return;
    this.isSnapshotDispatching = true;
    try {
      const record = await this.islandManager.requestIslandSnapshot(
        islandId,
        CONFIG.SNAPSHOT_WIDTH || 128,
        CONFIG.SNAPSHOT_HEIGHT || 128
      );
      if (record && record.dataUrl) {
        await fetch(`${this.apiBase}/api/cluster/island/snapshot`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            islandId,
            dataUrl: record.dataUrl,
            tick: record.tick,
            population: record.population,
            isRadiationMode: record.isRadiationMode
          })
        });
      }
    } catch (err) {
      console.warn(`[ClusterClient] Failed to dispatch requested snapshot for island ${islandId}:`, err);
    } finally {
      this.isSnapshotDispatching = false;
    }
  }

  /**
   * Host administration: start watching an island in the satellite snooper
   */
  async startWatchingIsland(islandId, durationSec = 4.0) {
    const resp = await fetch(`${this.apiBase}/api/cluster/snooper/watch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ islandId: parseInt(islandId, 10), duration: durationSec })
    });
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${resp.status}`);
    }
    return await resp.json();
  }

  /**
   * Host administration: stop watching island and immediately cut snapshot bandwidth
   */
  async stopWatchingIsland() {
    try {
      await fetch(`${this.apiBase}/api/cluster/snooper/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (e) {
      // ignore
    }
  }

  /**
   * Host administration: fetch latest satellite snapshot for an island
   */
  async fetchIslandSnapshot(islandId) {
    const resp = await fetch(`${this.apiBase}/api/cluster/island/snapshot?islandId=${parseInt(islandId, 10)}`, {
      cache: 'no-store'
    });
    if (!resp.ok) {
      return null;
    }
    return await resp.json();
  }

  /**
   * Gracefully unregister from cluster coordinator on unload/exit
   */
  async leave() {
    this.stopHeartbeat();
    if (!this.nodeId) return;

    try {
      if (typeof navigator.sendBeacon === 'function') {
        const payload = JSON.stringify({ nodeId: this.nodeId });
        const blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon(`${this.apiBase}/api/cluster/leave`, blob);
      } else {
        await fetch(`${this.apiBase}/api/cluster/leave`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nodeId: this.nodeId })
        });
      }
    } catch (err) {
      // ignore unload errors
    } finally {
      this.nodeId = null;
      this.emit('left');
    }
  }
}

