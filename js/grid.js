/**
 * Biome Shifters — Multi-Layer World Grid
 * Flat 1D TypedArray representation for zero GC overhead and maximum memory locality.
 * Headless module: Zero DOM or canvas dependencies (Web Worker ready).
 */

import { CONFIG } from './config.js';

export function classifyBiome(elevation, water, moisture, biomass) {
  if (water > 0.15) {
    return water > 0.6 ? 'DEEP_WATER' : 'SHALLOW_WATER';
  }
  if (elevation > 0.82) {
    return 'MOUNTAIN_PEAK';
  }
  if (elevation > 0.65) {
    return moisture > 0.4 ? 'PINE_FOREST' : 'ROCKY_HIGHLAND';
  }
  if (moisture < 0.2) {
    return 'ARID_DESERT';
  }
  if (moisture < 0.45) {
    return biomass > 0.4 ? 'SAVANNA' : 'SHRUBLAND';
  }
  if (moisture < 0.75) {
    return biomass > 0.5 ? 'TEMPERATE_FOREST' : 'GRASSLAND';
  }
  return biomass > 0.6 ? 'TROPICAL_RAINFOREST' : 'WETLAND_SWAMP';
}

/**
 * Returns true if coordinates fall within the hostile coastal boundary perimeter
 */
export function isCoastal(x, y, margin = CONFIG.COASTAL_BORDER_WIDTH || 3, width = CONFIG.GRID_WIDTH, height = CONFIG.GRID_HEIGHT) {
  return (x < margin || x >= width - margin || y < margin || y >= height - margin);
}

/**
 * Fast seeded pseudo-random number generator (Mulberry32)
 */
export function createPRNG(seed = 1337) {
  let s = seed >>> 0;
  return function() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 2D Value Noise generator with cubic Hermite interpolation
 */
class ValueNoise2D {
  constructor(rand) {
    this.table = new Float32Array(512);
    for (let i = 0; i < 512; i++) {
      this.table[i] = rand();
    }
  }

  eval(x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;

    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);

    const x0 = (xi & 255);
    const x1 = ((xi + 1) & 255);
    const y0 = (yi & 255);
    const y1 = ((yi + 1) & 255);

    const v00 = this.table[y0 * 2 + (x0 % 2)];
    const v10 = this.table[y0 * 2 + (x1 % 2)];
    const v01 = this.table[y1 * 2 + (x0 % 2)];
    const v11 = this.table[y1 * 2 + (x1 % 2)];

    const xInterp0 = v00 + u * (v10 - v00);
    const xInterp1 = v01 + u * (v11 - v01);
    return xInterp0 + v * (xInterp1 - xInterp0);
  }

  fbm(x, y, octaves = 4, persistence = 0.5, lacunarity = 2.0) {
    let total = 0;
    let freq = 1;
    let amp = 1;
    let maxVal = 0;

    for (let i = 0; i < octaves; i++) {
      total += this.eval(x * freq, y * freq) * amp;
      maxVal += amp;
      amp *= persistence;
      freq *= lacunarity;
    }
    return total / maxVal;
  }
}

export class Grid {
  constructor(width = CONFIG.GRID_WIDTH, height = CONFIG.GRID_HEIGHT) {
    this.width = width;
    this.height = height;
    this.size = width * height;

    // Continuous physical layers (Float32Array)
    this.elevation = new Float32Array(this.size);
    this.baseElevation = new Float32Array(this.size);
    this.water = new Float32Array(this.size);
    this.moisture = new Float32Array(this.size);
    this.fertility = new Float32Array(this.size);
    this.biomass = new Float32Array(this.size);
    this.trample = new Float32Array(this.size);
    this.scent = new Float32Array(this.size);

    // Discrete occupancy layer (Int32Array: agent ID or -1)
    this.occupancy = new Int32Array(this.size).fill(-1);
  }

  getIndex(x, y) {
    return y * this.width + x;
  }

  inBounds(x, y) {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  /**
   * Returns true if coordinates fall within the hostile coastal boundary perimeter
   */
  isCoastal(x, y, margin = CONFIG.COASTAL_BORDER_WIDTH || 3) {
    return isCoastal(x, y, margin, this.width, this.height);
  }

  clampX(x) {
    if (x < 0) return 0;
    if (x >= this.width) return this.width - 1;
    return x;
  }

  clampY(y) {
    if (y < 0) return 0;
    if (y >= this.height) return this.height - 1;
    return y;
  }

  // --- Layer Getters and Setters with boundary clamping ---

  getElevation(x, y) {
    return this.elevation[this.clampY(y) * this.width + this.clampX(x)];
  }

  setElevation(x, y, val) {
    if (!this.inBounds(x, y)) return;
    this.elevation[this.getIndex(x, y)] = Math.max(0, Math.min(1, val));
  }

  getWater(x, y) {
    return this.water[this.clampY(y) * this.width + this.clampX(x)];
  }

  setWater(x, y, val) {
    if (!this.inBounds(x, y)) return;
    this.water[this.getIndex(x, y)] = Math.max(0, Math.min(1, val));
  }

  getMoisture(x, y) {
    return this.moisture[this.clampY(y) * this.width + this.clampX(x)];
  }

  setMoisture(x, y, val) {
    if (!this.inBounds(x, y)) return;
    this.moisture[this.getIndex(x, y)] = Math.max(0, Math.min(1, val));
  }

  getFertility(x, y) {
    return this.fertility[this.clampY(y) * this.width + this.clampX(x)];
  }

  setFertility(x, y, val) {
    if (!this.inBounds(x, y)) return;
    this.fertility[this.getIndex(x, y)] = Math.max(0, Math.min(1, val));
  }

  getBiomass(x, y) {
    return this.biomass[this.clampY(y) * this.width + this.clampX(x)];
  }

  setBiomass(x, y, val) {
    if (!this.inBounds(x, y)) return;
    this.biomass[this.getIndex(x, y)] = Math.max(0, Math.min(1, val));
  }

  getTrample(x, y) {
    return this.trample[this.clampY(y) * this.width + this.clampX(x)];
  }

  setTrample(x, y, val) {
    if (!this.inBounds(x, y)) return;
    this.trample[this.getIndex(x, y)] = Math.max(0, Math.min(1, val));
  }

  addTrample(x, y, delta) {
    if (!this.inBounds(x, y)) return;
    const idx = this.getIndex(x, y);
    this.trample[idx] = Math.max(0, Math.min(1, this.trample[idx] + delta));
  }

  getScent(x, y) {
    return this.scent[this.clampY(y) * this.width + this.clampX(x)];
  }

  setScent(x, y, val) {
    if (!this.inBounds(x, y)) return;
    this.scent[this.getIndex(x, y)] = Math.max(0, Math.min(1, val));
  }

  addScent(x, y, delta) {
    if (!this.inBounds(x, y)) return;
    const idx = this.getIndex(x, y);
    this.scent[idx] = Math.max(0, Math.min(1, this.scent[idx] + delta));
  }

  // --- Occupancy Layer Management ---

  getOccupant(x, y) {
    if (!this.inBounds(x, y)) return -1;
    return this.occupancy[this.getIndex(x, y)];
  }

  setOccupant(x, y, agentId) {
    if (!this.inBounds(x, y)) return;
    this.occupancy[this.getIndex(x, y)] = agentId;
  }

  clearOccupant(x, y) {
    if (!this.inBounds(x, y)) return;
    this.occupancy[this.getIndex(x, y)] = -1;
  }

  // --- Procedural World Generation ---

  generateTerrain(seed = Date.now()) {
    const rand = createPRNG(seed);
    const noise = new ValueNoise2D(rand);
    const moistureNoise = new ValueNoise2D(rand);

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const idx = this.getIndex(x, y);
        const nx = x / this.width;
        const ny = y / this.height;

        // Elevation multi-octave FBM
        let elev = noise.fbm(nx * 4, ny * 4, 4, 0.5, 2.0);
        // Continental shelf / center elevation bias
        const dx = nx - 0.5;
        const dy = ny - 0.5;
        const distFromCenter = Math.sqrt(dx * dx + dy * dy) * 1.414; // [0, 1]
        elev = elev * 0.85 + (1 - distFromCenter) * 0.15;
        elev = Math.max(0, Math.min(1, elev));
        this.elevation[idx] = elev;
        this.baseElevation[idx] = elev;

        // Water basin in lowest areas
        if (elev < 0.28) {
          const depth = (0.28 - elev) / 0.28;
          this.water[idx] = Math.min(1.0, depth * 0.85 + 0.15);
        } else {
          this.water[idx] = 0;
        }

        // Moisture: combination of proximity to lowlands and moisture noise
        const rawMoist = moistureNoise.fbm(nx * 3 + 12.3, ny * 3 + 45.6, 3, 0.5, 2.0);
        let moist = rawMoist * 0.6 + (1 - elev) * 0.4;
        if (this.water[idx] > 0) {
          moist = Math.max(moist, 0.85);
        }
        moist = Math.max(0, Math.min(1, moist));
        this.moisture[idx] = moist;

        // Fertility: higher in moderate moisture and gentle slopes
        let fert = moist * 0.8 + (1 - Math.abs(elev - 0.4)) * 0.2;
        if (elev > 0.75) fert *= 0.3; // Rocky peaks have low fertility
        fert = Math.max(0.05, Math.min(1.0, fert));

        // Inhospitable coastal perimeter: barren rock with zero fertility
        if (this.isCoastal(x, y)) {
          fert = 0.0;
        }
        this.fertility[idx] = fert;

        // Initial Biomass: seeded where moisture and fertility allow (forbidden on coastal perimeter)
        if (!this.isCoastal(x, y) && this.water[idx] === 0 && moist > 0.25 && elev < 0.78) {
          this.biomass[idx] = Math.max(0, Math.min(1.0, fert * moist * (0.4 + rand() * 0.5)));
        } else {
          this.biomass[idx] = 0;
        }

        // Trails and Scent start clean
        this.trample[idx] = 0;
        this.scent[idx] = 0;
        this.occupancy[idx] = -1;
      }
    }
  }

  // --- Serialization ---

  toJSON() {
    return {
      width: this.width,
      height: this.height,
      elevation: Array.from(this.elevation),
      baseElevation: Array.from(this.baseElevation),
      water: Array.from(this.water),
      moisture: Array.from(this.moisture),
      fertility: Array.from(this.fertility),
      biomass: Array.from(this.biomass),
      trample: Array.from(this.trample),
      scent: Array.from(this.scent),
      occupancy: Array.from(this.occupancy)
    };
  }

  static fromJSON(data) {
    const grid = new Grid(data.width, data.height);
    grid.elevation.set(data.elevation);
    if (data.baseElevation) {
      grid.baseElevation.set(data.baseElevation);
    } else {
      // Legacy save without baseElevation:
      // If the map suffered runaway elevation (mean > 0.8), synthesize a natural
      // baseline landscape so geological erosion can heal the runaway topography.
      let sumElev = 0;
      for (let i = 0; i < grid.size; i++) sumElev += grid.elevation[i];
      const meanElev = sumElev / grid.size;
      if (meanElev > 0.8) {
        const rand = createPRNG(42);
        const noise = new ValueNoise2D(rand);
        for (let y = 0; y < grid.height; y++) {
          for (let x = 0; x < grid.width; x++) {
            const idx = grid.getIndex(x, y);
            const nx = x / grid.width;
            const ny = y / grid.height;
            let base = noise.fbm(nx * 4, ny * 4, 4, 0.5, 2.0);
            const dx = nx - 0.5;
            const dy = ny - 0.5;
            const dist = Math.sqrt(dx * dx + dy * dy) * 1.414;
            base = base * 0.85 + (1 - dist) * 0.15;
            grid.baseElevation[idx] = Math.max(0.12, Math.min(0.75, base));
          }
        }
      } else {
        grid.baseElevation.set(data.elevation);
      }
    }

    grid.water.set(data.water);
    grid.moisture.set(data.moisture);
    grid.fertility.set(data.fertility);
    grid.biomass.set(data.biomass);
    grid.trample.set(data.trample);
    if (data.scent) grid.scent.set(data.scent);
    if (data.occupancy) grid.occupancy.set(data.occupancy);

    // Enforce inhospitable coastal perimeter on deserialized worlds
    const margin = CONFIG.COASTAL_BORDER_WIDTH || 3;
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        if (isCoastal(x, y, margin, grid.width, grid.height)) {
          const idx = grid.getIndex(x, y);
          grid.fertility[idx] = 0;
          grid.biomass[idx] = 0;
        }
      }
    }

    return grid;
  }
}

