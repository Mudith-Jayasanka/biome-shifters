/**
 * Biome Shifters — Dedicated Island Web Worker
 * Runs an isolated headless Simulation instance on its own CPU core.
 * Handles continuous ticking, speed scaling, frame streaming, and elite genome exchange.
 */

import { Simulation } from '../simulation.js';
import { CONFIG } from '../config.js';
import { classifyBiome, isCoastal } from '../grid.js';

// Pre-computed RGB palettes for Whittaker biomes (Standard)
const BIOME_COLORS = {
  DEEP_WATER: [20, 52, 125],
  SHALLOW_WATER: [54, 124, 196],
  MOUNTAIN_PEAK: [238, 238, 242],
  PINE_FOREST: [32, 88, 52],
  ROCKY_HIGHLAND: [136, 128, 118],
  ARID_DESERT: [218, 192, 122],
  SAVANNA: [186, 180, 88],
  SHRUBLAND: [146, 156, 92],
  TEMPERATE_FOREST: [44, 134, 82],
  GRASSLAND: [102, 172, 72],
  TROPICAL_RAINFOREST: [18, 110, 42],
  WETLAND_SWAMP: [52, 92, 78]
};

// Bio-luminescent / toxic irradiated Whittaker biome palette
const IRRADIATED_BIOME_COLORS = {
  DEEP_WATER: [14, 82, 108],
  SHALLOW_WATER: [32, 160, 168],
  MOUNTAIN_PEAK: [215, 248, 236],
  PINE_FOREST: [26, 120, 72],
  ROCKY_HIGHLAND: [138, 120, 142],
  ARID_DESERT: [222, 170, 76],
  SAVANNA: [195, 202, 48],
  SHRUBLAND: [132, 182, 66],
  TEMPERATE_FOREST: [38, 178, 102],
  GRASSLAND: [115, 212, 58],
  TROPICAL_RAINFOREST: [16, 158, 76],
  WETLAND_SWAMP: [38, 128, 92]
};

let simulation = null;
let islandId = 0;
let isPaused = false;
let speed = 1;
let isTurbo = false;
let perfMode = 'turbo';
let isRunning = false;
let loopTimer = null;

// Dedicated zero-latency MessageChannel pump for uncapped Turbo mode
const turboChannel = new MessageChannel();
let isTurboPumping = false;

// Telemetry & TPS measurement
let tickCounter = 0;
let lastTpsTime = performance.now();
let currentTps = 0;
let lastTelemetryTime = performance.now();

function measureTpsAndSendTelemetry() {
  const now = performance.now();
  const elapsed = now - lastTpsTime;
  if (elapsed >= 500) {
    currentTps = Math.round((tickCounter / elapsed) * 1000);
    tickCounter = 0;
    lastTpsTime = now;

    if (simulation) {
      self.postMessage({
        type: 'TELEMETRY',
        islandId,
        tick: simulation.tickCount,
        population: simulation.agents.length,
        maxPopulation: simulation.maxPopulation,
        minPopulationFloor: simulation.minPopulationFloor,
        maxGen: simulation.stats.generationMax,
        maxGenAllTime: simulation.stats.generationMaxAllTime,
        avgGen: simulation.stats.generationAvg,
        biomass: simulation.stats.totalBiomass,
        tps: currentTps,
        immigrantsReceived: simulation.immigrantsReceived,
        isRadiationMode: Boolean(simulation.isRadiationMode),
        radiationMultiplier: simulation.radiationMultiplier || 4.0
      });
    }
  }
}

// Zero-latency microtask execution pump for Turbo mode (100% CPU core saturation)
turboChannel.port1.onmessage = function() {
  if (!isRunning || isPaused || !isTurbo || perfMode !== 'turbo' || !simulation) {
    isTurboPumping = false;
    return;
  }

  const batchSize = CONFIG.TURBO_BATCH_SIZE || 50;
  for (let i = 0; i < batchSize; i++) {
    if (!isRunning || isPaused || !isTurbo || perfMode !== 'turbo') break;
    simulation.tick();
    tickCounter++;
  }

  measureTpsAndSendTelemetry();

  if (isRunning && !isPaused && isTurbo && perfMode === 'turbo') {
    turboChannel.port2.postMessage(null);
  } else {
    isTurboPumping = false;
    if (isRunning && !isPaused && !loopTimer) {
      runLoopStep();
    }
  }
};

function syncLoopPacing() {
  if (!isRunning || isPaused || !simulation) {
    isTurboPumping = false;
    if (loopTimer) {
      clearTimeout(loopTimer);
      loopTimer = null;
    }
    return;
  }

  if (isTurbo && perfMode === 'turbo') {
    if (loopTimer) {
      clearTimeout(loopTimer);
      loopTimer = null;
    }
    if (!isTurboPumping) {
      isTurboPumping = true;
      turboChannel.port2.postMessage(null);
    }
  } else {
    isTurboPumping = false;
    if (!loopTimer) {
      runLoopStep();
    }
  }
}

function runLoopStep() {
  if (!isRunning) return;
  if (loopTimer) {
    clearTimeout(loopTimer);
    loopTimer = null;
  }

  // If in uncapped Turbo mode, transition immediately to zero-latency MessageChannel pump
  if (isTurbo && perfMode === 'turbo') {
    if (!isPaused && simulation && !isTurboPumping) {
      isTurboPumping = true;
      turboChannel.port2.postMessage(null);
    }
    return;
  }

  isTurboPumping = false;

  if (!isPaused && simulation) {
    if (isTurbo) {
      // isTurbo active under eco or standard power/thermal limiter
      if (perfMode === 'eco') {
        simulation.tick();
        tickCounter++;
      } else if (perfMode === 'standard') {
        simulation.tick();
        tickCounter++;
      }
    } else {
      // Normal speed multiplier (1x, 2x, 5x, 10x)
      const ticksToRun = perfMode === 'eco' ? 1 : (perfMode === 'standard' ? 1 : speed);
      for (let i = 0; i < ticksToRun; i++) {
        if (isPaused || !isRunning) break;
        simulation.tick();
        tickCounter++;
      }
    }
  }

  measureTpsAndSendTelemetry();

  if (!isRunning || isPaused) return;

  // Schedule next iteration based on performance limiter mode
  let delay = 16;
  if (perfMode === 'eco') {
    delay = 33; // ~30 TPS cap
  } else if (perfMode === 'standard') {
    delay = 16; // ~60 TPS cap
  }
  loopTimer = setTimeout(runLoopStep, delay);
}

function startLoop() {
  if (isRunning) return;
  isRunning = true;
  lastTpsTime = performance.now();
  tickCounter = 0;
  syncLoopPacing();
}

function stopLoop() {
  isRunning = false;
  isTurboPumping = false;
  if (loopTimer) {
    clearTimeout(loopTimer);
    loopTimer = null;
  }
}

// Compact agent representation for frame rendering
function packAgents(agents) {
  const packed = [];
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    packed.push({
      id: a.id,
      x: a.x,
      y: a.y,
      energy: Math.round(a.energy),
      generation: a.generation,
      age: a.age,
      biomassEaten: a.biomassEaten,
      trenchesDug: a.trenchesDug || 0,
      rootsHarvested: Math.round((a.rootsHarvested || 0) * 10) / 10,
      seedsSown: a.seedsSown || 0,
      lastAction: a.lastAction,
      color: a.color,
      isImmigrant: Boolean(a.isImmigrant),
      originIsland: a.originIsland
    });
  }
  return packed;
}

// Generate satellite snapshot pixel buffer on demand (defaults to native grid resolution)
function generateSnapshot(targetWidth = (CONFIG.SNAPSHOT_WIDTH || CONFIG.GRID_WIDTH || 128), targetHeight = (CONFIG.SNAPSHOT_HEIGHT || CONFIG.GRID_HEIGHT || 128)) {
  if (!simulation || !simulation.grid) return;

  const grid = simulation.grid;
  const gridW = grid.width;
  const gridH = grid.height;
  const elev = grid.elevation;
  const water = grid.water;
  const moist = grid.moisture;
  const bio = grid.biomass;

  const isRad = Boolean(simulation.isRadiationMode);
  const palette = isRad ? IRRADIATED_BIOME_COLORS : BIOME_COLORS;

  const pixels = new Uint8ClampedArray(targetWidth * targetHeight * 4);
  const scaleX = gridW / targetWidth;
  const scaleY = gridH / targetHeight;

  // 1. Downsampled Whittaker biome background
  for (let ty = 0; ty < targetHeight; ty++) {
    const gy = Math.min(gridH - 1, Math.floor(ty * scaleY));
    const gRowOffset = gy * gridW;
    const tRowOffset = ty * targetWidth * 4;

    for (let tx = 0; tx < targetWidth; tx++) {
      const gx = Math.min(gridW - 1, Math.floor(tx * scaleX));
      const gi = gRowOffset + gx;

      let c;
      if (isCoastal(gx, gy, CONFIG.COASTAL_BORDER_WIDTH || 3, gridW, gridH)) {
        c = isRad ? [30, 50, 45] : (water[gi] > 0.3 ? [16, 38, 90] : [48, 44, 40]);
      } else {
        const bName = classifyBiome(elev[gi], water[gi], moist[gi], bio[gi]);
        c = palette[bName] || [40, 40, 40];
      }

      const pi = tRowOffset + (tx * 4);
      pixels[pi] = c[0];
      pixels[pi + 1] = c[1];
      pixels[pi + 2] = c[2];
      pixels[pi + 3] = 255;
    }
  }

  // 2. Overlay living agents as bright high-contrast dots
  const agents = simulation.agents;
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    if (a.isDead) continue;
    const ax = Math.min(targetWidth - 1, Math.max(0, Math.floor(a.x / scaleX)));
    const ay = Math.min(targetHeight - 1, Math.max(0, Math.floor(a.y / scaleY)));
    const pi = (ay * targetWidth + ax) * 4;
    // High-contrast phosphor yellow/white agent dot
    pixels[pi] = 255;
    pixels[pi + 1] = 255;
    pixels[pi + 2] = 220;
    pixels[pi + 3] = 255;
  }

  // Zero-copy Transferable ArrayBuffer dispatch to main thread
  self.postMessage({
    type: 'SNAPSHOT_READY',
    islandId,
    width: targetWidth,
    height: targetHeight,
    pixels: pixels,
    tick: simulation.tickCount,
    population: simulation.agents.length,
    isRadiationMode: isRad
  }, [pixels.buffer]);
}

self.onmessage = function (e) {
  const msg = e.data;
  if (!msg || !msg.type) return;

  switch (msg.type) {
    case 'INIT': {
      islandId = msg.islandId !== undefined ? msg.islandId : 0;
      const seed = msg.seed || (Date.now() + islandId * 99991);
      simulation = new Simulation({
        islandId,
        width: msg.width || CONFIG.GRID_WIDTH,
        height: msg.height || CONFIG.GRID_HEIGHT,
        maxPopulation: msg.maxPopulation || CONFIG.MAX_POPULATION,
        minPopulationFloor: msg.minPopulationFloor || CONFIG.MIN_POPULATION_FLOOR
      });
      simulation.initWorld(seed);
      if (msg.initialPopulation) {
        // adjust initial population if specified
      }
      isPaused = Boolean(msg.isPaused);
      speed = msg.speed || 1;
      isTurbo = Boolean(msg.isTurbo);
      perfMode = msg.perfMode || 'turbo';
      if (msg.isRadiationMode) {
        simulation.setRadiationMode(true, msg.radiationMultiplier || 4.0);
      }

      self.postMessage({
        type: 'INITIALIZED',
        islandId,
        tick: simulation.tickCount,
        population: simulation.agents.length
      });

      startLoop();
      break;
    }

    case 'SET_RADIATION': {
      if (simulation) {
        simulation.setRadiationMode(Boolean(msg.enabled), msg.multiplier || 4.0);
      }
      break;
    }

    case 'SET_PERF_MODE': {
      perfMode = msg.perfMode || 'turbo';
      syncLoopPacing();
      break;
    }

    case 'SET_SPEED': {
      speed = msg.speed || 1;
      isTurbo = Boolean(msg.isTurbo);
      syncLoopPacing();
      break;
    }

    case 'SET_PAUSE': {
      isPaused = Boolean(msg.isPaused);
      syncLoopPacing();
      break;
    }

    case 'RESET': {
      const seed = msg.seed || (Date.now() + islandId * 99991);
      if (simulation) {
        simulation.initWorld(seed);
      }
      break;
    }

    case 'SPAWN_BATCH': {
      if (simulation) {
        simulation.spawnBatch(msg.count || 50);
      }
      break;
    }

    case 'SET_POP_LIMITS': {
      if (simulation) {
        if (msg.maxPopulation !== undefined) simulation.setMaxPopulation(msg.maxPopulation);
        if (msg.minPopulationFloor !== undefined) simulation.setMinPopulationFloor(msg.minPopulationFloor);
      }
      break;
    }

    case 'GET_FRAME': {
      if (!simulation) {
        self.postMessage({ type: 'FRAME_DATA', islandId, frame: null });
        return;
      }

      // Extract selected agent details if requested
      let selectedAgentData = null;
      if (msg.selectedAgentId !== null && msg.selectedAgentId !== undefined) {
        const agent = simulation.getAgentById(msg.selectedAgentId);
        if (agent) {
          selectedAgentData = {
            id: agent.id,
            x: agent.x,
            y: agent.y,
            energy: agent.energy,
            generation: agent.generation,
            age: agent.age,
            biomassEaten: agent.biomassEaten,
            offspringCount: agent.offspringCount,
            trenchesDug: agent.trenchesDug || 0,
            rootsHarvested: Math.round((agent.rootsHarvested || 0) * 10) / 10,
            seedsSown: agent.seedsSown || 0,
            lastAction: agent.lastAction,
            isImmigrant: Boolean(agent.isImmigrant),
            originIsland: agent.originIsland,
            brain: agent.brain ? agent.brain.toJSON() : null,
            lastInputs: Array.from(agent.lastInputs || []),
            lastOutputs: Array.from(agent.lastOutputs || []),
            hiddenState: agent.brain ? Array.from(agent.brain.hiddenState || []) : []
          };
        }
      }

      // Extract selected tile details if requested
      let selectedTileData = null;
      if (msg.selectedTile) {
        selectedTileData = simulation.getTileInfo(msg.selectedTile.x, msg.selectedTile.y);
      }

      // Grid layers
      const gridData = {
        width: simulation.grid.width,
        height: simulation.grid.height,
        elevation: simulation.grid.elevation,
        water: simulation.grid.water,
        moisture: simulation.grid.moisture,
        biomass: simulation.grid.biomass,
        trample: simulation.grid.trample,
        scent: simulation.grid.scent
      };

      self.postMessage({
        type: 'FRAME_DATA',
        islandId,
        requestId: msg.requestId,
        isRadiationMode: Boolean(simulation.isRadiationMode),
        radiationMultiplier: simulation.radiationMultiplier || 4.0,
        grid: gridData,
        agents: packAgents(simulation.agents),
        stats: { ...simulation.stats },
        history: {
          pop: Array.from(simulation.history.pop.subarray(0, simulation.history.count)),
          biomass: Array.from(simulation.history.biomass.subarray(0, simulation.history.count)),
          maxGen: Array.from(simulation.history.maxGen.subarray(0, simulation.history.count)),
          avgGen: Array.from(simulation.history.avgGen.subarray(0, simulation.history.count)),
          count: simulation.history.count,
          head: simulation.history.head
        },
        selectedAgent: selectedAgentData,
        selectedTile: selectedTileData,
        tps: currentTps
      });
      break;
    }

    case 'EXPORT_ELITES': {
      if (!simulation) {
        self.postMessage({ type: 'EXPORTED_ELITES', islandId, elites: [], requestId: msg.requestId });
        return;
      }
      const count = msg.count || 3;
      const elites = simulation.exportElites(count);
      self.postMessage({
        type: 'EXPORTED_ELITES',
        islandId,
        elites,
        requestId: msg.requestId
      });
      break;
    }

    case 'IMPORT_ELITES': {
      if (simulation && Array.isArray(msg.elites)) {
        const imported = simulation.importElites(msg.elites, msg.spawnCount || 2);
        self.postMessage({
          type: 'IMPORTED_ELITES',
          islandId,
          importedCount: imported,
          requestId: msg.requestId
        });
      }
      break;
    }

    case 'SERIALIZE': {
      if (!simulation) {
        self.postMessage({ type: 'SERIALIZED', islandId, data: null, requestId: msg.requestId });
        return;
      }
      const serialized = simulation.toJSON(msg.name);
      self.postMessage({
        type: 'SERIALIZED',
        islandId,
        data: serialized,
        requestId: msg.requestId
      });
      break;
    }

    case 'DESERIALIZE': {
      if (msg.data) {
        simulation = Simulation.fromJSON(msg.data);
        islandId = simulation.islandId;
      }
      self.postMessage({
        type: 'DESERIALIZED',
        islandId,
        requestId: msg.requestId
      });
      break;
    }

    case 'REQUEST_SNAPSHOT': {
      generateSnapshot(
        msg.width || CONFIG.SNAPSHOT_WIDTH || CONFIG.GRID_WIDTH || 128,
        msg.height || CONFIG.SNAPSHOT_HEIGHT || CONFIG.GRID_HEIGHT || 128
      );
      break;
    }

    case 'TERMINATE': {
      stopLoop();
      self.close();
      break;
    }

    default:
      console.warn(`[IslandWorker ${islandId}] Unknown message type:`, msg.type);
  }
};
