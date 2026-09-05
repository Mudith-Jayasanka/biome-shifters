/**
 * Biome Shifters — Multi-Layer Canvas Renderer
 * High-performance offscreen ImageData rasterizer with camera pan/zoom,
 * layer switching, agent sprites, reticles, and neural network visualization.
 */

import { CONFIG, ACTIONS } from './config.js';
import { classifyBiome } from './grid.js';

// Pre-computed RGB palettes for Whittaker biomes
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

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.activeLayer = 'biome'; // 'biome', 'elevation', 'water', 'biomass', 'trample', 'scent'

    // Virtual camera
    this.camera = {
      x: 0,
      y: 0,
      zoom: 1.0,
      minZoom: 0.25,
      maxZoom: 16.0,
      isDragging: false,
      lastMouseX: 0,
      lastMouseY: 0
    };

    // Offscreen pixel canvas and buffer for direct ImageData blitting
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCtx = this.offscreenCanvas.getContext('2d');
    this.imageData = null;
    this.imageBuffer32 = null;

    this.initCameraCentered();
  }

  initCameraCentered() {
    if (!this.canvas) return;
    const worldPxWidth = CONFIG.GRID_WIDTH * CONFIG.CELL_SIZE_PX;
    const worldPxHeight = CONFIG.GRID_HEIGHT * CONFIG.CELL_SIZE_PX;
    const rect = this.canvas.getBoundingClientRect();
    
    // Default zoom to comfortably fill viewport
    const scaleX = (rect.width * 0.85) / worldPxWidth;
    const scaleY = (rect.height * 0.85) / worldPxHeight;
    this.camera.zoom = Math.max(0.75, Math.min(scaleX, scaleY));

    this.camera.x = (rect.width - worldPxWidth * this.camera.zoom) / 2;
    this.camera.y = (rect.height - worldPxHeight * this.camera.zoom) / 2;
  }

  setLayer(layerName) {
    this.activeLayer = layerName.toLowerCase();
  }

  ensureBuffers(width, height) {
    if (!this.imageData || this.offscreenCanvas.width !== width || this.offscreenCanvas.height !== height) {
      this.offscreenCanvas.width = width;
      this.offscreenCanvas.height = height;
      this.imageData = this.offscreenCtx.createImageData(width, height);
      this.imageBuffer32 = new Uint32Array(this.imageData.data.buffer);
    }
  }

  /**
   * Main render dispatch called on each requestAnimationFrame
   */
  render(simulation, selectedAgentId = null, selectedTile = null) {
    if (!this.ctx || !simulation) return;

    const grid = simulation.grid;
    const w = grid.width;
    const h = grid.height;
    this.ensureBuffers(w, h);

    const dpr = window.devicePixelRatio || 1;
    const viewWidth = this.canvas.width / dpr;
    const viewHeight = this.canvas.height / dpr;

    // 1. Clear main viewport with dark space background
    this.ctx.fillStyle = '#06090e';
    this.ctx.fillRect(0, 0, viewWidth, viewHeight);

    // 2. Rasterize grid cells to offscreen pixel buffer
    this.rasterizeGridLayer(grid);
    this.offscreenCtx.putImageData(this.imageData, 0, 0);

    // 3. Apply Camera pan & zoom transformation
    this.ctx.save();
    this.ctx.translate(Math.round(this.camera.x), Math.round(this.camera.y));
    this.ctx.scale(this.camera.zoom, this.camera.zoom);

    // Draw world terrain offscreen canvas
    this.ctx.imageSmoothingEnabled = false;
    const worldW = w * CONFIG.CELL_SIZE_PX;
    const worldH = h * CONFIG.CELL_SIZE_PX;
    this.ctx.drawImage(this.offscreenCanvas, 0, 0, worldW, worldH);

    // World border
    this.ctx.strokeStyle = '#263342';
    this.ctx.lineWidth = 1 / this.camera.zoom;
    this.ctx.strokeRect(0, 0, worldW, worldH);

    // 4. Render selected tile reticle
    if (selectedTile && grid.inBounds(selectedTile.x, selectedTile.y)) {
      const tx = selectedTile.x * CONFIG.CELL_SIZE_PX;
      const ty = selectedTile.y * CONFIG.CELL_SIZE_PX;
      this.ctx.strokeStyle = '#58a6ff';
      this.ctx.lineWidth = 2 / this.camera.zoom;
      this.ctx.strokeRect(tx, ty, CONFIG.CELL_SIZE_PX, CONFIG.CELL_SIZE_PX);
    }

    // 5. Render living neural agents
    this.renderAgents(simulation.agents, selectedAgentId);

    this.ctx.restore();
  }

  /**
   * Directly write 32-bit RGBA pixel values to offscreen buffer
   */
  rasterizeGridLayer(grid) {
    const buf = this.imageBuffer32;
    const w = grid.width;
    const h = grid.height;
    const elev = grid.elevation;
    const water = grid.water;
    const moist = grid.moisture;
    const bio = grid.biomass;
    const trample = grid.trample;
    const scent = grid.scent;

    const layer = this.activeLayer;

    for (let y = 0; y < h; y++) {
      const yOffset = y * w;
      for (let x = 0; x < w; x++) {
        const i = yOffset + x;
        let r = 0, g = 0, b = 0;

        switch (layer) {
          case 'biome': {
            const biome = classifyBiome(elev[i], water[i], moist[i], bio[i]);
            const c = BIOME_COLORS[biome] || [40, 40, 40];
            r = c[0];
            g = c[1];
            b = c[2];

            // Overlay trampled paths subtly on biome map
            if (trample[i] > 0.05 && water[i] < 0.2) {
              const t = Math.min(1.0, trample[i]);
              r = Math.floor(r * (1 - t * 0.4) + 160 * (t * 0.4));
              g = Math.floor(g * (1 - t * 0.4) + 110 * (t * 0.4));
              b = Math.floor(b * (1 - t * 0.4) + 75 * (t * 0.4));
            }
            break;
          }

          case 'elevation': {
            const val = Math.floor(elev[i] * 255);
            r = val;
            g = val;
            b = val;
            break;
          }

          case 'water': {
            if (water[i] > 0.01) {
              const depth = Math.min(1.0, water[i]);
              r = Math.floor(20 + 30 * (1 - depth));
              g = Math.floor(80 + 90 * depth);
              b = Math.floor(180 + 75 * depth);
            } else {
              // Show soil moisture in dry areas
              const m = Math.floor(moist[i] * 120);
              r = 20;
              g = 20 + m;
              b = 40 + m;
            }
            break;
          }

          case 'biomass': {
            const val = bio[i];
            r = Math.floor(15 + val * 40);
            g = Math.floor(30 + val * 220);
            b = Math.floor(15 + val * 50);
            break;
          }

          case 'trample': {
            const val = trample[i];
            r = Math.floor(val * 240);
            g = Math.floor(val * 130);
            b = Math.floor(val * 60);
            break;
          }

          case 'scent': {
            const val = scent[i];
            r = Math.floor(val * 180);
            g = Math.floor(val * 60);
            b = Math.floor(val * 255);
            break;
          }

          default:
            r = 30; g = 30; b = 30;
        }

        // Little-endian RGBA packing: ABGR in uint32
        buf[i] = (255 << 24) | (b << 16) | (g << 8) | r;
      }
    }
  }

  /**
   * Render creature sprites and highlight ring around inspected agent
   */
  renderAgents(agents, selectedAgentId) {
    const cellSize = CONFIG.CELL_SIZE_PX;
    const radius = Math.max(2, cellSize * 0.48);

    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i];
      if (agent.isDead) continue;

      const px = agent.x * cellSize + cellSize / 2;
      const py = agent.y * cellSize + cellSize / 2;

      // Agent body
      this.ctx.fillStyle = agent.color || '#4caf50';
      this.ctx.beginPath();
      this.ctx.arc(px, py, radius, 0, Math.PI * 2);
      this.ctx.fill();

      // Energy core / indicator
      const energyRatio = Math.max(0.1, agent.energy / CONFIG.MAX_ENERGY);
      this.ctx.fillStyle = '#ffffff';
      this.ctx.beginPath();
      this.ctx.arc(px, py, radius * 0.4 * energyRatio, 0, Math.PI * 2);
      this.ctx.fill();

      // Selected inspected agent halo reticle
      if (selectedAgentId !== null && agent.id === selectedAgentId) {
        this.ctx.strokeStyle = '#39c5bb';
        this.ctx.lineWidth = 2.5 / this.camera.zoom;
        this.ctx.beginPath();
        this.ctx.arc(px, py, radius * 2.2, 0, Math.PI * 2);
        this.ctx.stroke();

        // Pulsing crosshair ticks
        const tickLen = radius * 0.8;
        this.ctx.beginPath();
        this.ctx.moveTo(px, py - radius * 2.5);
        this.ctx.lineTo(px, py - radius * 2.5 - tickLen);
        this.ctx.moveTo(px, py + radius * 2.5);
        this.ctx.lineTo(px, py + radius * 2.5 + tickLen);
        this.ctx.moveTo(px - radius * 2.5, py);
        this.ctx.lineTo(px - radius * 2.5 - tickLen, py);
        this.ctx.moveTo(px + radius * 2.5, py);
        this.ctx.lineTo(px + radius * 2.5 + tickLen, py);
        this.ctx.stroke();
      }
    }
  }

  /**
   * Convert screen viewport pixel coordinates to world grid cell coordinates
   */
  screenToWorld(screenX, screenY) {
    const cellSize = CONFIG.CELL_SIZE_PX;
    const worldPixelX = (screenX - this.camera.x) / this.camera.zoom;
    const worldPixelY = (screenY - this.camera.y) / this.camera.zoom;

    const cellX = Math.floor(worldPixelX / cellSize);
    const cellY = Math.floor(worldPixelY / cellSize);

    return { x: cellX, y: cellY };
  }

  /**
   * Convert world cell coordinates to screen pixel coordinates
   */
  worldToScreen(cellX, cellY) {
    const cellSize = CONFIG.CELL_SIZE_PX;
    const worldPixelX = cellX * cellSize;
    const worldPixelY = cellY * cellSize;

    const screenX = worldPixelX * this.camera.zoom + this.camera.x;
    const screenY = worldPixelY * this.camera.zoom + this.camera.y;

    return { x: screenX, y: screenY };
  }

  /**
   * Center camera on specific world grid cell
   */
  centerOnCell(cellX, cellY) {
    const cellSize = CONFIG.CELL_SIZE_PX;
    const dpr = window.devicePixelRatio || 1;
    const viewW = this.canvas.width / dpr;
    const viewH = this.canvas.height / dpr;

    this.camera.x = viewW / 2 - (cellX * cellSize + cellSize / 2) * this.camera.zoom;
    this.camera.y = viewH / 2 - (cellY * cellSize + cellSize / 2) * this.camera.zoom;
  }

  /**
   * Render miniature Recurrent Neural Network graph in sidebar
   */
  static renderBrain(canvas, agent) {
    if (!canvas || !agent || !agent.brain) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = '#06090e';
    ctx.fillRect(0, 0, w, h);

    const brain = agent.brain;
    const inCount = Math.min(12, brain.inputSize); // Sample representative nodes for mini display
    const hidCount = brain.hiddenSize; // 16
    const outCount = brain.outputSize; // 9

    const colX = [30, w / 2, w - 30];

    // Node Y generator
    const getNodeY = (index, total) => {
      const step = (h - 24) / (total - 1 || 1);
      return 12 + index * step;
    };

    // Draw synapic connections from hidden to output
    const weightsOut = brain.weightsOutput;
    for (let hid = 0; hid < hidCount; hid++) {
      const hy = getNodeY(hid, hidCount);
      for (let out = 0; out < outCount; out++) {
        const oy = getNodeY(out, outCount);
        const weight = weightsOut[hid * outCount + out];
        if (Math.abs(weight) > 0.3) {
          ctx.strokeStyle = weight > 0 ? 'rgba(63, 185, 80, 0.25)' : 'rgba(248, 81, 73, 0.25)';
          ctx.lineWidth = Math.min(2, Math.abs(weight));
          ctx.beginPath();
          ctx.moveTo(colX[1], hy);
          ctx.lineTo(colX[2], oy);
          ctx.stroke();
        }
      }
    }

    // Draw Input nodes
    for (let i = 0; i < inCount; i++) {
      const ny = getNodeY(i, inCount);
      const val = agent.sensorBuffer[i] || 0;
      ctx.fillStyle = val > 0.5 ? '#58a6ff' : '#263342';
      ctx.beginPath();
      ctx.arc(colX[0], ny, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw Hidden nodes (glowing based on persistent carry activation)
    for (let i = 0; i < hidCount; i++) {
      const ny = getNodeY(i, hidCount);
      const act = brain.hiddenState[i] || 0;
      const intensity = Math.min(255, Math.floor(Math.abs(act) * 200 + 55));
      ctx.fillStyle = act >= 0 ? `rgb(50, ${intensity}, 80)` : `rgb(${intensity}, 50, 60)`;
      ctx.beginPath();
      ctx.arc(colX[1], ny, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw Output nodes
    for (let i = 0; i < outCount; i++) {
      const ny = getNodeY(i, outCount);
      const isChosen = agent.lastAction === i;
      ctx.fillStyle = isChosen ? '#ff6b4a' : '#57606a';
      ctx.beginPath();
      ctx.arc(colX[2], ny, isChosen ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

