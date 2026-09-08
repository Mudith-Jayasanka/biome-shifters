/**
 * Biome Shifters — Multi-Island Coordinator
 * Supervises parallel Web Worker islands running on separate CPU cores,
 * coordinates active frame pulling for decoupled canvas rendering,
 * and executes the Cross-Island Elite Migration protocol.
 * Supports arbitrary island ID ranges (e.g. 0..7 on Host, 8..11 on Contributor).
 */

export class IslandManager {
  constructor(config = {}) {
    // Support arbitrary island ID arrays (e.g. [8, 9, 10, 11]) or count + start offset
    if (Array.isArray(config.islandIds) && config.islandIds.length > 0) {
      this.islandIds = [...config.islandIds];
    } else {
      const count = config.islandCount || 8;
      const start = config.startIslandIndex || 0;
      this.islandIds = Array.from({ length: count }, (_, i) => start + i);
    }

    this.islandCount = this.islandIds.length;
    // activeIslandIndex represents the active island's ID (e.g. 0..7 or 8..11)
    this.activeIslandIndex = this.islandIds[0] !== undefined ? this.islandIds[0] : 0;

    // Map of islandId -> Worker instance
    this.workerMap = new Map();
    // Array of active workers for backwards compatibility
    this.workers = [];

    // Telemetry summary cache for all local islands (keyed by islandId)
    this.telemetry = {};
    for (const id of this.islandIds) {
      this.telemetry[id] = {
        islandId: id,
        tick: 0,
        population: 0,
        maxPopulation: 800,
        minPopulationFloor: 100,
        maxGen: 1,
        maxGenAllTime: 1,
        avgGen: 1,
        biomass: 0,
        tps: 0,
        immigrantsReceived: 0
      };
    }

    // Rendering frame cache
    this.activeFrame = null;
    this.waitingForFrame = false;
    this.frameTimeoutId = null;

    // Simulation control states
    this.isPaused = false;
    this.speed = 1;
    this.isTurbo = false;
    this.perfMode = config.perfMode || 'standard';
    this.irradiatedIslands = new Set(config.irradiatedIslands || []);

    // Cross-Island Elite Migration state
    this.migrationInterval = config.migrationInterval || 800; // Ticks between automatic migrations
    this.lastMigrationTick = 0;
    this.migrationEpoch = 0;
    this.totalMigrantsExchanged = 0;
    this.isMigrating = false;

    // Pending request promises (e.g. for serialization, elite export)
    this.pendingRequests = new Map();
    this.requestIdCounter = 1;

    // External migration coordinator hook (for cluster cross-node migration)
    this.externalMigrationHandler = config.migrationHandler || null;
    this.clusterClient = config.clusterClient || null;

    // Callbacks
    this.onTelemetryUpdate = null;
    this.onMigrationEvent = null;

    // Demand-driven satellite snapshot cache: islandId -> { dataUrl, tick, population, isRadiationMode, timestamp }
    this.latestSnapshots = new Map();
    this.snapshotCallbacks = new Map();
    this.snapshotCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (this.snapshotCanvas) {
      this.snapshotCanvas.width = 64;
      this.snapshotCanvas.height = 64;
    }

    this.initWorkers(config.baseSeed || Date.now());
  }

  /**
   * Bind or unbind ClusterClient coordinator
   */
  setClusterClient(client) {
    this.clusterClient = client;
  }

  /**
   * Instantiate and initialize Web Workers for all assigned island IDs
   */
  initWorkers(baseSeed = Date.now()) {
    // Terminate existing workers if any
    for (const worker of this.workerMap.values()) {
      if (worker) {
        try {
          worker.terminate();
        } catch (e) {
          // ignore
        }
      }
    }
    this.workerMap.clear();
    this.workers = [];

    for (const id of this.islandIds) {
      const worker = new Worker('./js/workers/island.worker.js', { type: 'module' });
      worker.onmessage = (e) => this.handleWorkerMessage(e.data);
      worker.onerror = (err) => console.error(`[IslandManager] Error in Worker ${id}:`, err);

      this.workerMap.set(id, worker);
      this.workers.push(worker);

      // Send initial configuration with distinct seeds to produce distinct continental biomes
      const islandSeed = baseSeed + id * 99991;
      worker.postMessage({
        type: 'INIT',
        islandId: id,
        seed: islandSeed,
        isPaused: this.isPaused,
        speed: this.speed,
        isTurbo: this.isTurbo,
        perfMode: this.perfMode,
        isRadiationMode: this.irradiatedIslands.has(id)
      });
    }
  }

  /**
   * Dispatch messages received from worker threads
   */
  handleWorkerMessage(msg) {
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case 'TELEMETRY': {
        const id = msg.islandId;
        if (id !== undefined && this.telemetry[id] !== undefined) {
          this.telemetry[id] = msg;
        }

        // Check periodic auto-migration on active island tick progression (Host or standalone only)
        if (id === this.activeIslandIndex && !this.isMigrating) {
          if (msg.tick > 0 && msg.tick - this.lastMigrationTick >= this.migrationInterval) {
            if (!this.clusterClient || this.clusterClient.isHost) {
              this.triggerMigration();
            }
          }
        }

        if (typeof this.onTelemetryUpdate === 'function') {
          this.onTelemetryUpdate(this.telemetry);
        }
        break;
      }

      case 'FRAME_DATA': {
        if (msg.islandId === this.activeIslandIndex) {
          this.activeFrame = msg;
          this.waitingForFrame = false;
          if (this.frameTimeoutId) {
            clearTimeout(this.frameTimeoutId);
            this.frameTimeoutId = null;
          }
        }
        break;
      }

      case 'EXPORTED_ELITES':
      case 'SERIALIZED':
      case 'DESERIALIZED': {
        if (msg.requestId && this.pendingRequests.has(msg.requestId)) {
          const resolver = this.pendingRequests.get(msg.requestId);
          this.pendingRequests.delete(msg.requestId);
          resolver(msg);
        }
        break;
      }

      case 'SNAPSHOT_READY': {
        const id = msg.islandId;
        const w = msg.width || 64;
        const h = msg.height || 64;
        let dataUrl = '';

        if (this.snapshotCanvas && msg.pixels) {
          if (this.snapshotCanvas.width !== w || this.snapshotCanvas.height !== h) {
            this.snapshotCanvas.width = w;
            this.snapshotCanvas.height = h;
          }
          const ctx = this.snapshotCanvas.getContext('2d');
          const imgData = new ImageData(new Uint8ClampedArray(msg.pixels), w, h);
          ctx.putImageData(imgData, 0, 0);
          dataUrl = this.snapshotCanvas.toDataURL('image/jpeg', 0.65);
        }

        const snapshotRecord = {
          islandId: id,
          dataUrl,
          tick: msg.tick || 0,
          population: msg.population || 0,
          isRadiationMode: Boolean(msg.isRadiationMode),
          timestamp: Date.now()
        };

        this.latestSnapshots.set(id, snapshotRecord);

        // Resolve any waiting promises for this island
        if (this.snapshotCallbacks.has(id)) {
          for (const cb of this.snapshotCallbacks.get(id)) {
            cb(snapshotRecord);
          }
          this.snapshotCallbacks.delete(id);
        }
        break;
      }

      case 'INITIALIZED': {
        // Worker ready
        break;
      }

      default:
        break;
    }
  }

  /**
   * Pull-based frame request for the actively viewed island
   */
  requestActiveFrame(selectedAgentId = null, selectedTile = null) {
    const worker = this.workerMap.get(this.activeIslandIndex);
    if (this.waitingForFrame || !worker) return;

    this.waitingForFrame = true;
    worker.postMessage({
      type: 'GET_FRAME',
      selectedAgentId,
      selectedTile
    });

    // Safety timeout: reset flag if worker doesn't respond within 200ms
    if (this.frameTimeoutId) clearTimeout(this.frameTimeoutId);
    this.frameTimeoutId = setTimeout(() => {
      this.waitingForFrame = false;
    }, 200);
  }

  /**
   * Switch viewport to another island (supports either islandId or local 0-based index)
   */
  setActiveIsland(target) {
    let targetId = target;
    if (!this.islandIds.includes(targetId)) {
      if (typeof target === 'number' && target >= 0 && target < this.islandIds.length) {
        targetId = this.islandIds[target];
      } else {
        return;
      }
    }

    if (targetId === this.activeIslandIndex) return;

    this.activeIslandIndex = targetId;
    this.activeFrame = null;
    this.waitingForFrame = false;
    if (this.frameTimeoutId) {
      clearTimeout(this.frameTimeoutId);
      this.frameTimeoutId = null;
    }

    // Immediately request frame for newly selected island
    this.requestActiveFrame();
  }

  /**
   * Play / Pause execution on all islands
   */
  setPause(isPaused) {
    this.isPaused = Boolean(isPaused);
    for (const worker of this.workerMap.values()) {
      worker.postMessage({ type: 'SET_PAUSE', isPaused: this.isPaused });
    }
  }

  /**
   * Set simulation speed across all islands
   */
  setSpeed(speed, isTurbo = false) {
    this.speed = speed;
    this.isTurbo = Boolean(isTurbo);
    for (const worker of this.workerMap.values()) {
      worker.postMessage({
        type: 'SET_SPEED',
        speed: this.speed,
        isTurbo: this.isTurbo
      });
    }
  }

  /**
   * Set performance limiter mode ('eco' | 'standard' | 'turbo') across all managed workers
   */
  setPerfMode(perfMode) {
    if (!['eco', 'standard', 'turbo'].includes(perfMode)) return;
    this.perfMode = perfMode;
    for (const worker of this.workerMap.values()) {
      worker.postMessage({
        type: 'SET_PERF_MODE',
        perfMode: this.perfMode
      });
    }
  }

  /**
   * Toggle Radiation & Extreme Mutation Lab Mode for a specific island
   */
  setIslandRadiation(islandId, enabled, multiplier = 4.0) {
    const id = parseInt(islandId, 10);
    if (isNaN(id)) return;
    if (enabled) {
      this.irradiatedIslands.add(id);
    } else {
      this.irradiatedIslands.delete(id);
    }

    if (this.workerMap.has(id)) {
      this.workerMap.get(id).postMessage({
        type: 'SET_RADIATION',
        islandId: id,
        enabled: Boolean(enabled),
        multiplier: Number(multiplier) || 4.0
      });
    }
  }

  isIslandIrradiated(islandId) {
    return this.irradiatedIslands.has(parseInt(islandId, 10));
  }

  /**
   * Re-seed / reset all islands
   */
  resetAll(baseSeed = Date.now()) {
    this.lastMigrationTick = 0;
    this.migrationEpoch = 0;
    this.totalMigrantsExchanged = 0;
    for (const [id, worker] of this.workerMap.entries()) {
      worker.postMessage({
        type: 'RESET',
        seed: baseSeed + id * 99991
      });
    }
    this.requestActiveFrame();
  }

  /**
   * Spawn a batch of agents on the active island
   */
  spawnOnActiveIsland(count = 50) {
    const worker = this.workerMap.get(this.activeIslandIndex);
    if (worker) {
      worker.postMessage({
        type: 'SPAWN_BATCH',
        count
      });
    }
  }

  /**
   * Spawn agents on all local islands simultaneously
   */
  spawnOnAllIslands(count = 50) {
    for (const worker of this.workerMap.values()) {
      worker.postMessage({
        type: 'SPAWN_BATCH',
        count
      });
    }
  }

  /**
   * Update population cap and floor across all local islands
   */
  setPopulationLimits(maxPopulation, minPopulationFloor) {
    for (const worker of this.workerMap.values()) {
      worker.postMessage({
        type: 'SET_POP_LIMITS',
        maxPopulation,
        minPopulationFloor
      });
    }
  }

  /**
   * Cross-Island Elite Migration Protocol:
   * 1. Request top Darwinian elite brains from all local islands.
   * 2. Aggregate and cross-distribute foreign elites to peer islands (or via cluster coordinator).
   * 3. Reseed local elite archives and spawn immigrant pioneers with starting subsidies.
   */
  async triggerMigration() {
    if (this.isMigrating) return;
    this.isMigrating = true;

    try {
      // If connected to a cluster, coordinate migration across the cluster
      if (this.clusterClient) {
        if (this.clusterClient.isHost) {
          this.migrationEpoch++;
          try {
            await this.clusterClient.sendControl({ migrationEpoch: this.migrationEpoch });
          } catch (err) {
            console.warn('[IslandManager] Failed to broadcast migration epoch to cluster:', err);
          }
        }
        await this.clusterClient.handleClusterMigration(this.migrationEpoch);
        this.lastMigrationTick = this.telemetry[this.activeIslandIndex]?.tick || 0;
        return;
      }

      // If an external cluster migration handler is registered, delegate to it
      if (typeof this.externalMigrationHandler === 'function') {
        await this.externalMigrationHandler(this);
        return;
      }

      // Standalone single-machine migration:
      // 1. Collect exported elites from each local worker
      const exportResults = await this.exportAllLocalElites(3);

      // 2. Cross-distribute foreign elites to peer local islands
      const totalPioneersSpawned = this.crossBreedLocalElites(exportResults);

      this.migrationEpoch++;
      this.lastMigrationTick = this.telemetry[this.activeIslandIndex]?.tick || 0;

      const eventData = {
        epoch: this.migrationEpoch,
        tick: this.lastMigrationTick,
        migrantsExchanged: totalPioneersSpawned,
        totalExchanged: this.totalMigrantsExchanged,
        peakGen: Math.max(...Object.values(this.telemetry).map(t => t.maxGenAllTime || 1))
      };

      if (typeof this.onMigrationEvent === 'function') {
        this.onMigrationEvent(eventData);
      }
    } catch (err) {
      console.warn('[IslandManager] Migration error:', err);
    } finally {
      this.isMigrating = false;
    }
  }

  /**
   * Cross-distribute foreign elites among local islands
   */
  crossBreedLocalElites(exportResults) {
    const elitesByIsland = new Map();
    for (const res of exportResults) {
      elitesByIsland.set(res.islandId, res.elites || []);
    }

    let totalPioneersSpawned = 0;
    for (const i of this.islandIds) {
      const foreignCandidates = [];
      for (const j of this.islandIds) {
        if (j === i) continue;
        const peerElites = elitesByIsland.get(j) || [];
        for (const elite of peerElites) {
          foreignCandidates.push(elite);
        }
      }

      foreignCandidates.sort((a, b) => (b.fitness || 0) - (a.fitness || 0));
      const topForeign = foreignCandidates.slice(0, 3);
      if (topForeign.length > 0) {
        const worker = this.workerMap.get(i);
        if (worker) {
          worker.postMessage({
            type: 'IMPORT_ELITES',
            elites: topForeign,
            spawnCount: 2
          });
          totalPioneersSpawned += 2;
        }
      }
    }
    this.totalMigrantsExchanged += totalPioneersSpawned;
    return totalPioneersSpawned;
  }

  /**
   * Helper to collect exported elites from all local workers
   */
  async exportAllLocalElites(count = 3) {
    const exportPromises = Array.from(this.workerMap.entries()).map(([islandId, worker]) => {
      return new Promise((resolve) => {
        const reqId = `export_${this.requestIdCounter++}_${islandId}`;
        const timer = setTimeout(() => {
          this.pendingRequests.delete(reqId);
          resolve({ islandId, elites: [] });
        }, 3500);

        this.pendingRequests.set(reqId, (msg) => {
          clearTimeout(timer);
          resolve(msg);
        });

        worker.postMessage({
          type: 'EXPORT_ELITES',
          count,
          requestId: reqId
        });
      });
    });

    return Promise.all(exportPromises);
  }

  /**
   * Helper to import foreign elites into all local workers
   */
  importForeignElites(elites, spawnCount = 2) {
    if (!Array.isArray(elites) || elites.length === 0) return 0;
    let spawned = 0;
    for (const [id, worker] of this.workerMap.entries()) {
      const foreign = elites.filter(e => e.originIsland !== id);
      if (foreign.length > 0) {
        worker.postMessage({
          type: 'IMPORT_ELITES',
          elites: foreign.slice(0, 5),
          spawnCount
        });
        spawned += spawnCount;
      }
    }
    this.totalMigrantsExchanged += spawned;
    return spawned;
  }

  /**
   * Calculate aggregated multi-core TPS across local workers
   */
  getCombinedTps() {
    let sum = 0;
    for (const id of this.islandIds) {
      sum += this.telemetry[id]?.tps || 0;
    }
    return sum;
  }

  /**
   * Calculate total population across local workers
   */
  getTotalPopulation() {
    let sum = 0;
    for (const id of this.islandIds) {
      sum += this.telemetry[id]?.population || 0;
    }
    return sum;
  }

  /**
   * Serialize local multi-island simulation state
   */
  async serializeAll(name = '') {
    const serializePromises = Array.from(this.workerMap.entries()).map(([islandId, worker]) => {
      return new Promise((resolve) => {
        const reqId = `serialize_${this.requestIdCounter++}_${islandId}`;
        const timer = setTimeout(() => {
          this.pendingRequests.delete(reqId);
          resolve(null);
        }, 3000);

        this.pendingRequests.set(reqId, (msg) => {
          clearTimeout(timer);
          resolve(msg.data);
        });

        worker.postMessage({
          type: 'SERIALIZE',
          name: `${name}_island_${islandId}`,
          requestId: reqId
        });
      });
    });

    const islandStates = await Promise.all(serializePromises);
    const validIslands = islandStates.filter(Boolean);
    const activeTick = this.telemetry[this.activeIslandIndex]?.tick || 0;
    const totalPop = validIslands.reduce((acc, isl) => acc + (isl?.agents?.length || isl?.agentCount || 0), 0);

    return {
      version: 1,
      isMultiIsland: true,
      islandCount: this.islandCount,
      islandIds: [...this.islandIds],
      activeIslandIndex: this.activeIslandIndex,
      tick: activeTick,
      totalPopulation: totalPop,
      population: totalPop,
      migrationEpoch: this.migrationEpoch,
      totalMigrantsExchanged: this.totalMigrantsExchanged,
      timestamp: new Date().toISOString(),
      name: name || `multi_island_tick_${activeTick}`,
      islands: validIslands
    };
  }

  /**
   * Restore simulation states from saved data
   */
  async deserializeData(data) {
    if (data.isMultiIsland && Array.isArray(data.islands)) {
      this.migrationEpoch = data.migrationEpoch || 0;
      this.totalMigrantsExchanged = data.totalMigrantsExchanged || 0;
      if (this.islandIds.includes(data.activeIslandIndex)) {
        this.activeIslandIndex = data.activeIslandIndex;
      }

      const restorePromises = data.islands.map((islandData, idx) => {
        const targetId = this.islandIds[idx];
        const worker = this.workerMap.get(targetId);
        if (!worker) return Promise.resolve();

        return new Promise((resolve) => {
          const reqId = `deserialize_${this.requestIdCounter++}_${targetId}`;
          const timer = setTimeout(() => {
            this.pendingRequests.delete(reqId);
            resolve();
          }, 3000);

          this.pendingRequests.set(reqId, () => {
            clearTimeout(timer);
            resolve();
          });

          worker.postMessage({
            type: 'DESERIALIZE',
            data: islandData,
            requestId: reqId
          });
        });
      });

      await Promise.all(restorePromises);
    } else {
      // Single-island legacy save: restore into active island worker
      const worker = this.workerMap.get(this.activeIslandIndex);
      if (worker) {
        await new Promise((resolve) => {
          const reqId = `deserialize_legacy_${this.requestIdCounter++}`;
          const timer = setTimeout(() => {
            this.pendingRequests.delete(reqId);
            resolve();
          }, 3000);

          this.pendingRequests.set(reqId, () => {
            clearTimeout(timer);
            resolve();
          });

          worker.postMessage({
            type: 'DESERIALIZE',
            data,
            requestId: reqId
          });
        });
      }
    }

    this.activeFrame = null;
    this.waitingForFrame = false;
    this.requestActiveFrame();
  }

  /**
   * Request an on-demand satellite snapshot for a local island
   */
  requestIslandSnapshot(islandId, width = 64, height = 64, timeoutMs = 2500) {
    const targetId = parseInt(islandId, 10);
    const worker = this.workerMap.get(targetId);
    if (!worker) {
      return Promise.reject(new Error(`No local worker for island ${targetId}`));
    }

    return new Promise((resolve) => {
      let timer = null;

      const onReady = (record) => {
        if (timer) clearTimeout(timer);
        resolve(record);
      };

      if (!this.snapshotCallbacks.has(targetId)) {
        this.snapshotCallbacks.set(targetId, new Set());
      }
      this.snapshotCallbacks.get(targetId).add(onReady);

      timer = setTimeout(() => {
        if (this.snapshotCallbacks.has(targetId)) {
          this.snapshotCallbacks.get(targetId).delete(onReady);
        }
        // Fallback to latest cached snapshot if available
        resolve(this.latestSnapshots.get(targetId) || null);
      }, timeoutMs);

      worker.postMessage({
        type: 'REQUEST_SNAPSHOT',
        width,
        height
      });
    });
  }

  /**
   * Cleanly terminate all Web Workers
   */
  terminate() {
    if (this.frameTimeoutId) {
      clearTimeout(this.frameTimeoutId);
      this.frameTimeoutId = null;
    }
    for (const worker of this.workerMap.values()) {
      try {
        worker.postMessage({ type: 'TERMINATE' });
        worker.terminate();
      } catch (e) {
        // ignore
      }
    }
    this.workerMap.clear();
    this.workers = [];
  }

  /**
   * Alias for terminate()
   */
  terminateAll() {
    this.terminate();
  }
}
