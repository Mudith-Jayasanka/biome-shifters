/**
 * Biome Shifters — Environmental Cellular Automata Engine
 * Simulates Hydrology (water flow downhill), Soil Moisture Infiltration & Diffusion,
 * Logistic Biomass (Flora) Growth, Soil Compaction Decay, and Scent Evaporation.
 * Headless module: Zero DOM or canvas dependencies (Web Worker ready).
 */

import { CONFIG } from './config.js';

export class Environment {
  constructor(grid) {
    this.grid = grid;
    this.width = grid.width;
    this.height = grid.height;
    this.size = grid.size;

    // Ping-pong buffers to prevent directional update bias and avoid per-tick allocations
    this.waterBuffer = new Float32Array(this.size);
    this.moistureBuffer = new Float32Array(this.size);
    this.biomassBuffer = new Float32Array(this.size);
    this.scentBuffer = new Float32Array(this.size);
  }

  /**
   * Run one full environmental simulation cycle
   */
  tick() {
    this.simulateWaterSources();
    this.simulateRainAndEvaporation();
    this.simulateHydrology();
    this.simulateMoistureDiffusion();
    this.simulateVegetationGrowth();
    this.simulateTrailDecay();
    this.simulatePheromoneDiffusion();
  }

  /**
   * Replenish groundwater and sea level in natural low-elevation basins to prevent total drought
   */
  simulateWaterSources() {
    const elev = this.grid.elevation;
    const water = this.grid.water;
    for (let i = 0; i < this.size; i++) {
      if (elev[i] < 0.22 && water[i] < 0.4) {
        water[i] = Math.min(0.6, water[i] + 0.02);
      }
    }
  }

  /**
   * Rainfall deposits and surface water evaporation
   */
  simulateRainAndEvaporation() {
    const water = this.grid.water;
    const evapFactor = 1.0 - CONFIG.WATER_EVAP_RATE;

    // Baseline evaporation across all standing water
    for (let i = 0; i < this.size; i++) {
      if (water[i] > 0) {
        water[i] *= evapFactor;
        if (water[i] < 0.001) water[i] = 0;
      }
    }

    // Stochastic rain cloud precipitation
    if (Math.random() < CONFIG.RAIN_PROBABILITY) {
      const centerX = Math.floor(Math.random() * this.width);
      const centerY = Math.floor(Math.random() * this.height);
      const radius = 6 + Math.floor(Math.random() * 8);
      const intensity = CONFIG.RAIN_INTENSITY * (0.5 + Math.random() * 0.5);

      const rSq = radius * radius;
      const minX = Math.max(0, centerX - radius);
      const maxX = Math.min(this.width - 1, centerX + radius);
      const minY = Math.max(0, centerY - radius);
      const maxY = Math.min(this.height - 1, centerY + radius);

      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const dx = x - centerX;
          const dy = y - centerY;
          const d2 = dx * dx + dy * dy;
          if (d2 <= rSq) {
            const drop = intensity * (1.0 - Math.sqrt(d2) / radius);
            const idx = y * this.width + x;
            water[idx] = Math.min(1.0, water[idx] + drop);
          }
        }
      }
    }
  }

  /**
   * Hydrology: Surface water flows downhill based on total hydraulic head (Elevation + Water).
   * Uses ping-pong waterBuffer to eliminate directional sweep bias.
   */
  simulateHydrology() {
    const w = this.width;
    const h = this.height;
    const elev = this.grid.elevation;
    const water = this.grid.water;
    const nextWater = this.waterBuffer;

    // Initialize next buffer with current water levels
    nextWater.set(water);

    const flowRate = CONFIG.WATER_FLOW_RATE;

    for (let y = 0; y < h; y++) {
      const yOffset = y * w;
      for (let x = 0; x < w; x++) {
        const i = yOffset + x;
        const currentWater = water[i];
        if (currentWater <= 0.005) continue;

        const currentHead = elev[i] + currentWater;

        // Find downhill neighbors (von Neumann 4-neighborhood)
        let totalHeadDiff = 0;
        let diffN = 0, diffS = 0, diffE = 0, diffW = 0;

        if (y > 0) {
          const nIdx = i - w;
          const headN = elev[nIdx] + water[nIdx];
          if (currentHead > headN) {
            diffN = currentHead - headN;
            totalHeadDiff += diffN;
          }
        }
        if (y < h - 1) {
          const sIdx = i + w;
          const headS = elev[sIdx] + water[sIdx];
          if (currentHead > headS) {
            diffS = currentHead - headS;
            totalHeadDiff += diffS;
          }
        }
        if (x < w - 1) {
          const eIdx = i + 1;
          const headE = elev[eIdx] + water[eIdx];
          if (currentHead > headE) {
            diffE = currentHead - headE;
            totalHeadDiff += diffE;
          }
        }
        if (x > 0) {
          const wIdx = i - 1;
          const headW = elev[wIdx] + water[wIdx];
          if (currentHead > headW) {
            diffW = currentHead - headW;
            totalHeadDiff += diffW;
          }
        }

        if (totalHeadDiff > 0) {
          // Transfer water proportionally to slopes, capped by available volume
          const maxFlow = Math.min(currentWater * 0.5, totalHeadDiff * flowRate * 0.25);
          const ratio = maxFlow / totalHeadDiff;

          if (diffN > 0) {
            const flow = diffN * ratio;
            nextWater[i] -= flow;
            nextWater[i - w] += flow;
          }
          if (diffS > 0) {
            const flow = diffS * ratio;
            nextWater[i] -= flow;
            nextWater[i + w] += flow;
          }
          if (diffE > 0) {
            const flow = diffE * ratio;
            nextWater[i] -= flow;
            nextWater[i + 1] += flow;
          }
          if (diffW > 0) {
            const flow = diffW * ratio;
            nextWater[i] -= flow;
            nextWater[i - 1] += flow;
          }
        }
      }
    }

    // Clamp and commit new water state
    for (let i = 0; i < this.size; i++) {
      let val = nextWater[i];
      if (val < 0.001) val = 0;
      else if (val > 1.0) val = 1.0;
      water[i] = val;
    }
  }

  /**
   * Soil Moisture Infiltration from standing water and lateral soil diffusion
   */
  simulateMoistureDiffusion() {
    const w = this.width;
    const h = this.height;
    const water = this.grid.water;
    const moisture = this.grid.moisture;
    const nextMoisture = this.moistureBuffer;

    const infilRate = CONFIG.SOIL_INFILTRATION;
    const diffRate = CONFIG.MOISTURE_DIFFUSION;
    const dryRate = CONFIG.MOISTURE_DRYING;

    // 1. Direct surface absorption
    for (let i = 0; i < this.size; i++) {
      if (water[i] > 0.05) {
        const absorption = Math.min(water[i], infilRate * water[i] * (1.0 - moisture[i]));
        moisture[i] = Math.min(1.0, moisture[i] + absorption);
        water[i] -= absorption * 0.5; // Absorbed into ground
      }
    }

    // 2. Lateral 4-point diffusion with environmental drying
    for (let y = 0; y < h; y++) {
      const yOffset = y * w;
      for (let x = 0; x < w; x++) {
        const i = yOffset + x;
        const currentM = moisture[i];

        let neighborSum = 0;
        let count = 0;

        if (y > 0) { neighborSum += moisture[i - w]; count++; }
        if (y < h - 1) { neighborSum += moisture[i + w]; count++; }
        if (x > 0) { neighborSum += moisture[i - 1]; count++; }
        if (x < w - 1) { neighborSum += moisture[i + 1]; count++; }

        const avgNeighbors = count > 0 ? neighborSum / count : currentM;
        let newM = currentM + diffRate * (avgNeighbors - currentM) - dryRate;

        // Keep water tiles saturated
        if (water[i] > 0.1) {
          newM = Math.max(newM, 0.85);
        }

        nextMoisture[i] = Math.max(0.02, Math.min(1.0, newM));
      }
    }

    // Commit new moisture state
    moisture.set(nextMoisture);
  }

  /**
   * Logistic Vegetation Growth, Seed Colonization, and Over-grazing/Drought Decay
   */
  simulateVegetationGrowth() {
    const w = this.width;
    const h = this.height;
    const water = this.grid.water;
    const moisture = this.grid.moisture;
    const fertility = this.grid.fertility;
    const biomass = this.grid.biomass;
    const trample = this.grid.trample;
    const nextBiomass = this.biomassBuffer;

    const r = CONFIG.BIOMASS_GROWTH_RATE;
    const K = CONFIG.BIOMASS_MAX;
    const spreadChance = CONFIG.BIOMASS_SPREAD_CHANCE;

    for (let y = 0; y < h; y++) {
      const yOffset = y * w;
      for (let x = 0; x < w; x++) {
        const i = yOffset + x;
        
        // Deep standing water inhibits terrestrial plants
        if (water[i] > 0.35) {
          nextBiomass[i] = 0;
          continue;
        }

        const currentB = biomass[i];
        const m = moisture[i];
        const f = fertility[i];
        const t = trample[i];

        if (currentB > 0.02) {
          // Continuous logistic growth: dB/dt = r * B * (1 - B/K) * m * f * (1 - t)
          const growth = r * currentB * (1.0 - currentB / K) * m * f * (1.0 - t);
          let newB = currentB + growth;

          // Severe drought decay
          if (m < 0.15) {
            newB *= 0.99;
          }

          nextBiomass[i] = Math.max(0, Math.min(K, newB));
        } else {
          // Barren or grazed tile: Seed dispersal from adjacent flora OR subterranean seed dormancy
          let hasFloraNeighbor = false;
          if (y > 0 && biomass[i - w] > 0.3) hasFloraNeighbor = true;
          else if (y < h - 1 && biomass[i + w] > 0.3) hasFloraNeighbor = true;
          else if (x > 0 && biomass[i - 1] > 0.3) hasFloraNeighbor = true;
          else if (x < w - 1 && biomass[i + 1] > 0.3) hasFloraNeighbor = true;

          const seedGermination = hasFloraNeighbor
            ? (m > 0.25 && Math.random() < spreadChance * m * f * (1.0 - t))
            : (m > 0.35 && f > 0.35 && Math.random() < 0.001 * (1.0 - t));

          if (seedGermination) {
            nextBiomass[i] = 0.05; // Seed sprouts
          } else {
            nextBiomass[i] = 0;
          }
        }
      }
    }

    // Commit new biomass state
    biomass.set(nextBiomass);
  }

  /**
   * Soil Trampling / Highway Trail Compaction Decay
   */
  simulateTrailDecay() {
    const trample = this.grid.trample;
    const decay = 1.0 - CONFIG.TRAMPLE_DECAY;

    for (let i = 0; i < this.size; i++) {
      if (trample[i] > 0) {
        trample[i] *= decay;
        if (trample[i] < 0.005) trample[i] = 0;
      }
    }
  }

  /**
   * Pheromone Scent Evaporation & Lateral Diffusion
   */
  simulatePheromoneDiffusion() {
    const w = this.width;
    const h = this.height;
    const scent = this.grid.scent;
    const nextScent = this.scentBuffer;
    const evap = 1.0 - CONFIG.SCENT_EVAPORATION;
    const diff = CONFIG.SCENT_DIFFUSION;

    for (let y = 0; y < h; y++) {
      const yOffset = y * w;
      for (let x = 0; x < w; x++) {
        const i = yOffset + x;
        const currentS = scent[i];

        if (currentS < 0.005) {
          nextScent[i] = 0;
          continue;
        }

        // Diffusion to 4 neighbors
        let neighborSum = 0;
        let count = 0;
        if (y > 0) { neighborSum += scent[i - w]; count++; }
        if (y < h - 1) { neighborSum += scent[i + w]; count++; }
        if (x > 0) { neighborSum += scent[i - 1]; count++; }
        if (x < w - 1) { neighborSum += scent[i + 1]; count++; }

        const avg = count > 0 ? neighborSum / count : currentS;
        let newS = (currentS + diff * (avg - currentS)) * evap;
        if (newS < 0.005) newS = 0;

        nextScent[i] = Math.min(1.0, newS);
      }
    }

    scent.set(nextScent);
  }
}

