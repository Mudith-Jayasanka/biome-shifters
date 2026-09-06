/**
 * Biome Shifters — Master Controller & Interactive Loop
 * Decoupled rendering, MessageChannel turbo pump, camera controls,
 * and live entity inspection.
 */

import { CONFIG, ACTIONS } from './config.js';
import { Simulation } from './simulation.js';
import { Renderer } from './renderer.js';
import { StorageManager } from './storage.js';

// Action names for human-readable display
const ACTION_NAMES = [
  'Resting (Idle)',
  'Moving North',
  'Moving South',
  'Moving East',
  'Moving West',
  'Grazing Flora',
  'Excavating Trench',
  'Mounding Earth',
  'Emitting Scent'
];

class App {
  constructor() {
    this.canvas = document.getElementById('sim-canvas');
    this.brainCanvas = document.getElementById('brain-canvas');
    this.telemetryCanvas = document.getElementById('telemetry-canvas');
    this.generationCanvas = document.getElementById('generation-canvas');
    
    this.simulation = new Simulation();
    this.renderer = new Renderer(this.canvas);

    // Execution & Loop state
    this.isPaused = false;
    this.speed = 1; // 1, 2, 5, 10, 'turbo'
    this.isTurbo = false;

    // Selection & Inspection state
    this.selectedAgentId = null;
    this.selectedTile = null;

    // Telemetry tracking
    this.lastFrameTime = performance.now();
    this.lastFpsUpdate = performance.now();
    this.tickCounter = 0;
    this.currentTps = 0;

    // MessageChannel for Turbo microtask pumping
    this.channel = new MessageChannel();
    this.channel.port1.onmessage = () => this.turboStep();

    this.init();
  }

  init() {
    this.setupResizeHandler();
    this.setupCanvasInteractions();
    this.setupUIControls();
    this.setupKeyboardShortcuts();

    // Initialize world
    this.simulation.initWorld();
    this.renderer.initCameraCentered();

    // Start render loop
    requestAnimationFrame((t) => this.renderLoop(t));
  }

  // --- Layout & Canvas Resizing ---

  setupResizeHandler() {
    const handleResize = () => {
      const container = this.canvas.parentElement;
      if (!container) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      this.canvas.width = Math.floor(rect.width * dpr);
      this.canvas.height = Math.floor(rect.height * dpr);
      
      const ctx = this.canvas.getContext('2d');
      if (ctx) {
        ctx.resetTransform();
        ctx.scale(dpr, dpr);
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();
  }

  // --- Interaction & Camera Controls ---

  setupCanvasInteractions() {
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let hasMoved = false;

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) { // Left click
        isDragging = true;
        hasMoved = false;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        this.renderer.camera.lastMouseX = e.clientX;
        this.renderer.camera.lastMouseY = e.clientY;
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - this.renderer.camera.lastMouseX;
      const dy = e.clientY - this.renderer.camera.lastMouseY;

      if (Math.abs(e.clientX - dragStartX) > 4 || Math.abs(e.clientY - dragStartY) > 4) {
        hasMoved = true;
      }

      this.renderer.camera.x += dx;
      this.renderer.camera.y += dy;
      this.renderer.camera.lastMouseX = e.clientX;
      this.renderer.camera.lastMouseY = e.clientY;
    });

    window.addEventListener('mouseup', (e) => {
      if (!isDragging) return;
      isDragging = false;

      // Click event without substantial dragging -> inspect clicked coordinate
      if (!hasMoved && e.target === this.canvas) {
        const rect = this.canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;

        const cell = this.renderer.screenToWorld(screenX, screenY);
        this.handleInspectClick(cell.x, cell.y);
      }
    });

    // Zoom on wheel towards cursor
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
      const oldZoom = this.renderer.camera.zoom;
      const newZoom = Math.max(
        this.renderer.camera.minZoom,
        Math.min(this.renderer.camera.maxZoom, oldZoom * zoomFactor)
      );

      // Adjust camera so mouse point stays fixed
      this.renderer.camera.x = mouseX - (mouseX - this.renderer.camera.x) * (newZoom / oldZoom);
      this.renderer.camera.y = mouseY - (mouseY - this.renderer.camera.y) * (newZoom / oldZoom);
      this.renderer.camera.zoom = newZoom;
    }, { passive: false });
  }

  handleInspectClick(cellX, cellY) {
    if (!this.simulation.grid.inBounds(cellX, cellY)) {
      this.selectedTile = null;
      this.selectedAgentId = null;
      this.updateInspectorUI();
      return;
    }

    this.selectedTile = { x: cellX, y: cellY };

    // Check if an agent occupies this cell
    const occupantId = this.simulation.grid.getOccupant(cellX, cellY);
    if (occupantId >= 0) {
      this.selectedAgentId = occupantId;
    } else {
      // Check if clicking near any agent
      let closestAgent = null;
      let closestDist = 1.5;
      for (const a of this.simulation.agents) {
        const dist = Math.hypot(a.x - cellX, a.y - cellY);
        if (dist < closestDist) {
          closestDist = dist;
          closestAgent = a;
        }
      }
      if (closestAgent) {
        this.selectedAgentId = closestAgent.id;
      }
    }

    this.updateInspectorUI();
  }

  // --- UI Controls & Event Listeners ---

  setupUIControls() {
    // Play / Pause
    const btnPause = document.getElementById('btn-pause');
    const pauseIcon = document.getElementById('pause-icon');
    const pauseText = document.getElementById('pause-text');

    btnPause.addEventListener('click', () => {
      this.isPaused = !this.isPaused;
      pauseIcon.textContent = this.isPaused ? '▶' : '⏸';
      pauseText.textContent = this.isPaused ? 'Resume' : 'Pause';
      btnPause.classList.toggle('btn-primary', !this.isPaused);
      btnPause.classList.toggle('btn-secondary', this.isPaused);
    });

    // Speed buttons
    const speedButtons = document.querySelectorAll('.btn-speed');
    speedButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        speedButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const val = btn.dataset.speed;
        if (val === 'turbo') {
          this.isTurbo = true;
          this.speed = 1;
          this.triggerTurbo();
        } else {
          this.isTurbo = false;
          this.speed = parseInt(val, 10) || 1;
        }
      });
    });

    // Layer Selector
    const layerSelect = document.getElementById('layer-select');
    layerSelect.addEventListener('change', (e) => {
      this.renderer.setLayer(e.target.value);
    });

    // Re-seed / Reset button
    const btnReset = document.getElementById('btn-reset');
    btnReset.addEventListener('click', () => {
      this.selectedAgentId = null;
      this.selectedTile = null;
      this.simulation.initWorld(Date.now());
      this.renderer.initCameraCentered();
      this.syncPopulationSliders();
      this.updateInspectorUI();
      this.updateHUD();
    });

    // Sidebar Minimize & Unhide Toggle
    const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
    const btnUnhideSidebar = document.getElementById('btn-unhide-sidebar');
    const sidebar = document.getElementById('inspector-sidebar');

    const setSidebarCollapsed = (collapsed) => {
      if (collapsed) {
        sidebar.classList.add('collapsed');
        if (btnUnhideSidebar) btnUnhideSidebar.classList.remove('hidden');
      } else {
        sidebar.classList.remove('collapsed');
        if (btnUnhideSidebar) btnUnhideSidebar.classList.add('hidden');
      }
      window.dispatchEvent(new Event('resize'));
    };

    if (btnToggleSidebar) {
      btnToggleSidebar.addEventListener('click', () => setSidebarCollapsed(true));
    }
    if (btnUnhideSidebar) {
      btnUnhideSidebar.addEventListener('click', () => setSidebarCollapsed(false));
    }

    // Sidebar Card Accordion Collapse/Expand
    document.querySelectorAll('.card-header').forEach(header => {
      header.addEventListener('click', () => {
        const card = header.closest('.inspector-card');
        if (card) {
          card.classList.toggle('card-collapsed');
        }
      });
    });

    // Population Management Controls
    this.setupPopulationControls();

    // Save & Load Modal
    this.setupSaveLoadModal();
  }

  setupPopulationControls() {
    const btnQuickSpawn = document.getElementById('btn-quick-spawn');
    if (btnQuickSpawn) {
      btnQuickSpawn.addEventListener('click', () => {
        this.simulation.spawnBatch(50);
        this.updateHUD();
      });
    }

    const btnSpawn50 = document.getElementById('btn-spawn-50');
    if (btnSpawn50) {
      btnSpawn50.addEventListener('click', () => {
        this.simulation.spawnBatch(50);
        this.updateHUD();
      });
    }

    const btnSpawn100 = document.getElementById('btn-spawn-100');
    if (btnSpawn100) {
      btnSpawn100.addEventListener('click', () => {
        this.simulation.spawnBatch(100);
        this.updateHUD();
      });
    }

    const sliderPopCap = document.getElementById('slider-pop-cap');
    const labelPopCap = document.getElementById('label-pop-cap');
    if (sliderPopCap) {
      sliderPopCap.value = this.simulation.maxPopulation;
      if (labelPopCap) labelPopCap.textContent = this.simulation.maxPopulation;
      sliderPopCap.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        this.simulation.setMaxPopulation(val);
        if (labelPopCap) labelPopCap.textContent = val;
        this.updateHUD();
      });
    }

    const sliderPopFloor = document.getElementById('slider-pop-floor');
    const labelPopFloor = document.getElementById('label-pop-floor');
    if (sliderPopFloor) {
      sliderPopFloor.value = this.simulation.minPopulationFloor;
      if (labelPopFloor) labelPopFloor.textContent = this.simulation.minPopulationFloor;
      sliderPopFloor.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        this.simulation.setMinPopulationFloor(val);
        if (labelPopFloor) labelPopFloor.textContent = val;
        this.updateHUD();
      });
    }
  }

  syncPopulationSliders() {
    const sliderPopCap = document.getElementById('slider-pop-cap');
    const labelPopCap = document.getElementById('label-pop-cap');
    if (sliderPopCap) {
      sliderPopCap.value = this.simulation.maxPopulation;
      if (labelPopCap) labelPopCap.textContent = this.simulation.maxPopulation;
    }

    const sliderPopFloor = document.getElementById('slider-pop-floor');
    const labelPopFloor = document.getElementById('label-pop-floor');
    if (sliderPopFloor) {
      sliderPopFloor.value = this.simulation.minPopulationFloor;
      if (labelPopFloor) labelPopFloor.textContent = this.simulation.minPopulationFloor;
    }
  }

  setupSaveLoadModal() {
    const modal = document.getElementById('modal-container');
    const btnSave = document.getElementById('btn-save');
    const btnLoadList = document.getElementById('btn-load-list');
    const btnClose = document.getElementById('modal-btn-close');
    const saveNameInput = document.getElementById('save-name-input');
    const btnSaveConfirm = document.getElementById('btn-save-confirm');
    const savesList = document.getElementById('saves-list');
    const loadingIndicator = document.getElementById('saves-list-loading');

    const openModal = async () => {
      modal.classList.remove('hidden');
      saveNameInput.value = `simulation_tick_${this.simulation.tickCount}`;
      await refreshList();
    };

    const closeModal = () => {
      modal.classList.add('hidden');
    };

    const refreshList = async () => {
      loadingIndicator.classList.remove('hidden');
      savesList.innerHTML = '';
      try {
        const saves = await StorageManager.listSaves();
        loadingIndicator.classList.add('hidden');
        if (saves.length === 0) {
          savesList.innerHTML = '<li style="padding: 16px; color: var(--text-muted); text-align: center;">No saves found on server.</li>';
          return;
        }

        saves.forEach(item => {
          const li = document.createElement('li');
          const dateStr = item.timestamp ? new Date(item.timestamp).toLocaleString() : 'Unknown';
          const sizeKb = item.fileSize ? Math.round(item.fileSize / 1024) : 0;

          li.innerHTML = `
            <div class="save-item-info">
              <span class="save-item-name">${item.name || item.filename}</span>
              <span class="save-item-meta">Tick ${item.tick || 0} • ${item.agentCount || 0} agents • ${sizeKb} KB • ${dateStr}</span>
            </div>
            <div class="save-item-actions">
              <button class="btn btn-primary btn-load-item" data-filename="${item.filename}">Load</button>
              <button class="btn btn-danger btn-delete-item" data-filename="${item.filename}">✕</button>
            </div>
          `;

          // Load item
          li.querySelector('.btn-load-item').addEventListener('click', async () => {
            try {
              const data = await StorageManager.loadSave(item.filename);
              this.simulation = Simulation.fromJSON(data);
              this.selectedAgentId = null;
              this.selectedTile = null;
              this.syncPopulationSliders();
              this.updateInspectorUI();
              this.updateHUD();
              closeModal();
            } catch (err) {
              alert(`Failed to load save: ${err.message}`);
            }
          });

          // Delete item
          li.querySelector('.btn-delete-item').addEventListener('click', async () => {
            if (confirm(`Delete save "${item.name}"?`)) {
              await StorageManager.deleteSave(item.filename);
              await refreshList();
            }
          });

          savesList.appendChild(li);
        });
      } catch (err) {
        loadingIndicator.textContent = `Error loading saves: ${err.message}`;
      }
    };

    btnSave.addEventListener('click', openModal);
    btnLoadList.addEventListener('click', openModal);
    btnClose.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    btnSaveConfirm.addEventListener('click', async () => {
      const name = saveNameInput.value.trim() || `save_${Date.now()}`;
      btnSaveConfirm.disabled = true;
      btnSaveConfirm.textContent = 'Saving...';
      try {
        await StorageManager.saveSimulation(this.simulation, name);
        btnSaveConfirm.textContent = 'Saved!';
        setTimeout(async () => {
          btnSaveConfirm.disabled = false;
          btnSaveConfirm.textContent = 'Save Current State';
          await refreshList();
        }, 800);
      } catch (err) {
        alert(`Save failed: ${err.message}`);
        btnSaveConfirm.disabled = false;
        btnSaveConfirm.textContent = 'Save Current State';
      }
    });
  }

  setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Ignore if typing inside input
      if (e.target.tagName === 'INPUT') return;

      if (e.code === 'Space') {
        e.preventDefault();
        document.getElementById('btn-pause').click();
      } else if (e.code === 'KeyC') {
        if (this.selectedAgentId !== null) {
          const agent = this.simulation.getAgentById(this.selectedAgentId);
          if (agent) this.renderer.centerOnCell(agent.x, agent.y);
          else this.renderer.initCameraCentered();
        } else if (this.selectedTile) {
          this.renderer.centerOnCell(this.selectedTile.x, this.selectedTile.y);
        } else {
          this.renderer.initCameraCentered();
        }
      } else if (e.key >= '1' && e.key <= '4') {
        const idx = parseInt(e.key, 10) - 1;
        const speedBtns = document.querySelectorAll('.btn-speed');
        if (speedBtns[idx]) speedBtns[idx].click();
      } else if (e.code === 'KeyT') {
        document.querySelector('.btn-turbo').click();
      } else if (e.code === 'KeyI') {
        const sidebar = document.getElementById('inspector-sidebar');
        const btnUnhideSidebar = document.getElementById('btn-unhide-sidebar');
        const isCollapsed = sidebar.classList.contains('collapsed');
        if (isCollapsed) {
          sidebar.classList.remove('collapsed');
          if (btnUnhideSidebar) btnUnhideSidebar.classList.add('hidden');
        } else {
          sidebar.classList.add('collapsed');
          if (btnUnhideSidebar) btnUnhideSidebar.classList.remove('hidden');
        }
        window.dispatchEvent(new Event('resize'));
      }
    });
  }

  // --- Simulation Loops (RAF & Turbo MessageChannel) ---

  triggerTurbo() {
    if (this.isTurbo && !this.isPaused) {
      this.channel.port2.postMessage(null);
    }
  }

  turboStep() {
    if (!this.isTurbo || this.isPaused) return;

    // Run batch of ticks per microtask pump
    const batchSize = 25;
    for (let i = 0; i < batchSize; i++) {
      this.simulation.tick();
      this.tickCounter++;
    }

    // Schedule next microtask immediately
    this.channel.port2.postMessage(null);
  }

  renderLoop(timestamp) {
    // 1. Step simulation ticks for normal speeds
    if (!this.isPaused && !this.isTurbo) {
      for (let i = 0; i < this.speed; i++) {
        this.simulation.tick();
        this.tickCounter++;
      }
    }

    // 2. Measure TPS
    const now = performance.now();
    const elapsedFps = now - this.lastFpsUpdate;
    if (elapsedFps >= 500) {
      this.currentTps = Math.round((this.tickCounter / elapsedFps) * 1000);
      this.tickCounter = 0;
      this.lastFpsUpdate = now;
      this.updateHUD();
    }

    // 3. Render world and agents
    this.renderer.render(this.simulation, this.selectedAgentId, this.selectedTile);

    // 4. Update live inspector (smooth 60 FPS update of vitals and brain)
    this.updateInspectorUI();

    requestAnimationFrame((t) => this.renderLoop(t));
  }

  // --- Telemetry & Inspector Updates ---

  updateHUD() {
    const stats = this.simulation.stats;
    const tickEl = document.getElementById('stat-tick');
    if (tickEl) tickEl.textContent = stats.tick.toLocaleString();
    const tickBadge = document.getElementById('stat-tick-badge');
    if (tickBadge) tickBadge.textContent = `Tick ${stats.tick.toLocaleString()}`;

    const tpsEl = document.getElementById('stat-tps');
    if (tpsEl) tpsEl.textContent = this.currentTps.toLocaleString();

    const popEl = document.getElementById('stat-pop');
    if (popEl) popEl.textContent = `${stats.population} / ${stats.maxPopulation || CONFIG.MAX_POPULATION}`;

    const avgEnergyEl = document.getElementById('stat-avg-energy');
    if (avgEnergyEl) avgEnergyEl.textContent = `${stats.avgEnergy} / ${CONFIG.MAX_ENERGY}`;

    const bioEl = document.getElementById('stat-biomass');
    if (bioEl) bioEl.textContent = stats.totalBiomass.toLocaleString();

    const waterEl = document.getElementById('stat-water');
    if (waterEl) waterEl.textContent = `${stats.waterCoveragePct}%`;

    const popRatioBadge = document.getElementById('pop-ratio-badge');
    if (popRatioBadge) popRatioBadge.textContent = `${stats.population} / ${stats.maxPopulation || CONFIG.MAX_POPULATION}`;

    // Evolution Card Stats
    const maxGenBadge = document.getElementById('stat-maxgen-badge');
    if (maxGenBadge) maxGenBadge.textContent = `Gen ${stats.generationMax}`;
    if (maxGenBadge) {
      maxGenBadge.textContent = stats.generationMaxAllTime > stats.generationMax
        ? `Gen ${stats.generationMax} (★${stats.generationMaxAllTime})`
        : `Gen ${stats.generationMax}`;
    }

    const maxGenEl = document.getElementById('stat-max-gen');
    if (maxGenEl) maxGenEl.textContent = `Gen ${stats.generationMax}`;
    if (maxGenEl) {
      maxGenEl.textContent = stats.generationMaxAllTime > stats.generationMax
        ? `Gen ${stats.generationMax} (Peak: ${stats.generationMaxAllTime})`
        : `Gen ${stats.generationMax}`;
    }

    const avgGenEl = document.getElementById('stat-avg-gen');
    if (avgGenEl) avgGenEl.textContent = `Gen ${stats.generationAvg}`;

    const elitesCountEl = document.getElementById('stat-elites-count');
    if (elitesCountEl) elitesCountEl.textContent = `${stats.elitesCount} / 25`;

    const genActiveCount = document.getElementById('gen-active-count');
    if (genActiveCount) {
      const activeCount = stats.generationCounts ? stats.generationCounts.length : 1;
      genActiveCount.textContent = `${activeCount} ${activeCount === 1 ? 'Gen' : 'Gens'} Active`;
    }
  }

  updateInspectorUI() {
    // 1. Live Telemetry & Generation Graphs
    if (this.telemetryCanvas) {
      Renderer.renderTelemetryGraph(this.telemetryCanvas, this.simulation);
    }
    if (this.generationCanvas) {
      Renderer.renderGenerationGraph(this.generationCanvas, this.simulation);
    }

    // 2. Tile Inspector Card
    if (this.selectedTile) {
      const info = this.simulation.getTileInfo(this.selectedTile.x, this.selectedTile.y);
      if (info) {
        document.getElementById('tile-coords').textContent = `${info.x}, ${info.y}`;
        document.getElementById('tile-biome').textContent = info.biome.replace(/_/g, ' ');
        document.getElementById('tile-elevation').textContent = `${(info.elevation * 100).toFixed(0)}%`;
        document.getElementById('tile-water').textContent = `${(info.water * 100).toFixed(0)}%`;
        document.getElementById('tile-moisture').textContent = `${(info.moisture * 100).toFixed(0)}%`;
        document.getElementById('tile-biomass').textContent = `${(info.biomass * 100).toFixed(0)}%`;
        document.getElementById('tile-trample').textContent = `${(info.trample * 100).toFixed(0)}%`;
        document.getElementById('tile-scent').textContent = `${(info.scent * 100).toFixed(0)}%`;
      }
    }

    // 3. Agent Inspector Card
    const emptyMsg = document.getElementById('agent-empty-msg');
    const details = document.getElementById('agent-details');
    const agentBadge = document.getElementById('agent-id');

    if (this.selectedAgentId !== null) {
      const agent = this.simulation.getAgentById(this.selectedAgentId);

      if (agent && !agent.isDead) {
        emptyMsg.classList.add('hidden');
        details.classList.remove('hidden');

        agentBadge.textContent = `#${agent.id}`;
        document.getElementById('agent-species').textContent = `Lineage ${agent.species}`;
        document.getElementById('agent-gen').textContent = `Gen ${agent.generation}`;
        document.getElementById('agent-age').textContent = `${agent.age} / ${CONFIG.MAX_AGE}`;
        document.getElementById('agent-pos').textContent = `(${agent.x}, ${agent.y})`;
        document.getElementById('agent-action').textContent = ACTION_NAMES[agent.lastAction] || 'Active';

        const energyPct = Math.max(0, Math.min(100, (agent.energy / CONFIG.MAX_ENERGY) * 100));
        document.getElementById('agent-energy-val').textContent = `${Math.round(agent.energy)} / ${CONFIG.MAX_ENERGY}`;
        document.getElementById('agent-energy-bar').style.width = `${energyPct}%`;

        // Render live RNN activations in miniature brain graph
        Renderer.renderBrain(this.brainCanvas, agent);
      } else {
        agentBadge.textContent = `#${this.selectedAgentId} (Deceased)`;
        document.getElementById('agent-action').textContent = 'Decomposed';
      }
    } else {
      emptyMsg.classList.remove('hidden');
      details.classList.add('hidden');
      agentBadge.textContent = 'None';
    }
  }
}

// Start application when DOM is ready (or immediately if already parsed)
function startApp() {
  try {
    if (!window.__APP__) {
      window.__APP__ = new App();
    }
  } catch (err) {
    console.error('Fatal initialization error in Biome Shifters:', err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}
