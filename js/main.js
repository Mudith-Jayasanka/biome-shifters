/**
 * Biome Shifters — Master Controller & Multi-Core 8-Island Loop
 * Decoupled rendering, 8-core Web Worker supervision,
 * cross-island genetic migration, camera controls, and entity inspection.
 */

import { CONFIG, ACTIONS } from './config.js';
import { IslandManager } from './island-manager.js';
import { Renderer } from './renderer.js';
import { StorageManager } from './storage.js';
import { ClusterClient } from './cluster-client.js';

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

    // Host vs Contributor detection (Host is recognized strictly by localhost)
    this.isHost = window.location.hostname === 'localhost' ||
                  window.location.hostname === '127.0.0.1' ||
                  window.location.hostname === '[::1]';

    this.clusterClient = new ClusterClient({ isHost: this.isHost });
    this.selectedCores = Math.max(1, Math.min(8, Math.floor((navigator.hardwareConcurrency || 4) / 2)));

    this.islandManager = null;
    this.renderer = new Renderer(this.canvas);

    // Execution & Loop state
    this.isPaused = false;
    this.speed = 1;
    this.isTurbo = false;
    this.lastTurboRenderTime = 0;

    // Selection & Inspection state
    this.selectedAgentId = null;
    this.selectedTile = null;

    // Telemetry tracking
    this.lastFrameTime = performance.now();
    this.lastFpsUpdate = performance.now();
    this.tickCounter = 0;
    this.currentTps = 0;

    // Auto-Save Configuration
    this.autoSaveEnabled = localStorage.getItem('biome_shifters_autosave_enabled') !== 'false';
    this.autoSaveIntervalMinutes = parseInt(localStorage.getItem('biome_shifters_autosave_interval') || '2', 10);
    this.autoSaveAccumulatedMs = 0;
    this.lastAutoSaveCheckTime = Date.now();
    this.currentSaveTab = 'manual';
    this.allSavesCache = [];
    this.clusterPollInterval = null;
    this.activeSnooperIsland = null;
    this.snooperPollInterval = null;

    this.init();
  }

  async init() {
    this.setupResizeHandler();
    this.setupCanvasInteractions();
    this.setupUIControls();
    this.setupKeyboardShortcuts();

    // Verify host vs contributor role via server cluster status
    try {
      const status = await this.clusterClient.checkStatus();
      if (status && typeof status.isHost === 'boolean') {
        this.isHost = status.isHost;
        this.clusterClient.isHost = this.isHost;
      }
    } catch (err) {
      // Fallback to constructor localhost detection
    }

    if (this.isHost) {
      this.initHostSession();
    } else {
      this.initContributorSession();
    }
  }

  initHostSession() {
    // Multi-Core 8-Island Web Worker Coordinator for Host
    this.islandManager = new IslandManager({
      islandCount: 8,
      migrationInterval: 800
    });
    this.islandManager.setClusterClient(this.clusterClient);
    this.islandManager.onMigrationEvent = (event) => {
      this.showMigrationToast(event);
    };

    this.updateHudRoleBadge('👑 Host Admin • 8 Cores');
    this.buildIslandBarButtons();
    this.setupIslandControls();
    this.setupClusterModal();
    this.setupIslandCamModal();
    this.setupAutoSaveTimer();

    this.clusterClient.on('island_radiation_change', () => {
      this.updateMultiIslandCard();
      this.updateIslandBarUI();
    });

    // Center initial camera
    this.renderer.initCameraCentered();

    // Start heartbeat dispatch to cluster coordinator
    this.clusterClient.startHeartbeat(this.islandManager);

    // Start render loop
    requestAnimationFrame((t) => this.renderLoop(t));
  }

  async initContributorSession() {
    document.body.classList.add('mode-contributor');
    this.updateHudRoleBadge('💻 Contributor (Connecting...)');

    // Wire up contributor-specific cluster client events
    this.clusterClient.on('kicked', (reason) => this.handleClusterKicked(reason));
    this.clusterClient.on('name_change', (newName) => {
      this.updateHudRoleBadge(`💻 Contributor: ${newName} • 🟢 Synced`);
    });
    this.clusterClient.on('visibility_change', (isHidden) => {
      this.setVisualsHidden(isHidden);
    });

    this.setupJoinModal();
  }

  updateHudRoleBadge(text) {
    const badge = document.getElementById('hud-role-badge');
    if (badge) badge.textContent = text;
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

  // --- Canvas Interaction: Camera Pan, Zoom & Inspection ---

  setupCanvasInteractions() {
    let isMouseDown = false;
    let startX = 0;
    let startY = 0;

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        isMouseDown = true;
        startX = e.clientX;
        startY = e.clientY;
        this.renderer.camera.lastMouseX = e.clientX;
        this.renderer.camera.lastMouseY = e.clientY;
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!isMouseDown) return;
      const dx = e.clientX - this.renderer.camera.lastMouseX;
      const dy = e.clientY - this.renderer.camera.lastMouseY;
      this.renderer.camera.x += dx;
      this.renderer.camera.y += dy;
      this.renderer.camera.lastMouseX = e.clientX;
      this.renderer.camera.lastMouseY = e.clientY;

      // Redraw current cached frame while actively panning even if turbo throttles simulation ticks
      if (this.isTurbo && this.islandManager.activeFrame) {
        this.renderer.render(this.islandManager.activeFrame, this.selectedAgentId, this.selectedTile);
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0 && isMouseDown) {
        isMouseDown = false;
        const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
        if (dist < 5) {
          const rect = this.canvas.getBoundingClientRect();
          const screenX = e.clientX - rect.left;
          const screenY = e.clientY - rect.top;
          const worldPos = this.renderer.screenToWorld(screenX, screenY);
          this.handleInspectClick(worldPos.x, worldPos.y);
        }
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

      this.renderer.camera.x = mouseX - (mouseX - this.renderer.camera.x) * (newZoom / oldZoom);
      this.renderer.camera.y = mouseY - (mouseY - this.renderer.camera.y) * (newZoom / oldZoom);
      this.renderer.camera.zoom = newZoom;

      // Redraw current cached frame while actively zooming even if turbo throttles simulation ticks
      if (this.isTurbo && this.islandManager.activeFrame) {
        this.renderer.render(this.islandManager.activeFrame, this.selectedAgentId, this.selectedTile);
      }
    }, { passive: false });
  }

  handleInspectClick(cellX, cellY) {
    this.lastTurboRenderTime = 0; // Immediate render on inspect selection
    const frame = this.islandManager.activeFrame;
    const w = frame && frame.grid ? frame.grid.width : CONFIG.GRID_WIDTH;
    const h = frame && frame.grid ? frame.grid.height : CONFIG.GRID_HEIGHT;

    if (cellX < 0 || cellX >= w || cellY < 0 || cellY >= h) {
      this.selectedTile = null;
      this.selectedAgentId = null;
      return;
    }

    this.selectedTile = { x: cellX, y: cellY };

    // Check if an agent is near this cell
    let closestAgentId = null;
    if (frame && Array.isArray(frame.agents)) {
      let closestDist = 1.6;
      for (let i = 0; i < frame.agents.length; i++) {
        const a = frame.agents[i];
        const dist = Math.hypot(a.x - cellX, a.y - cellY);
        if (dist < closestDist) {
          closestDist = dist;
          closestAgentId = a.id;
        }
      }
    }
    this.selectedAgentId = closestAgentId;
    this.islandManager.requestActiveFrame(this.selectedAgentId, this.selectedTile);
  }

  buildIslandBarButtons() {
    const container = document.getElementById('island-buttons-container');
    if (!container || !this.islandManager) return;
    container.innerHTML = '';

    this.islandManager.islandIds.forEach((id, localIdx) => {
      const isIrradiated = this.islandManager.isIslandIrradiated(id);
      const btn = document.createElement('button');
      btn.className = `btn-island ${id === this.islandManager.activeIslandIndex ? 'active' : ''} ${isIrradiated ? 'irradiated' : ''}`;
      btn.dataset.island = String(id);
      btn.title = `Switch to Island ${id + 1} (Key ${localIdx + 1})${isIrradiated ? ' [☢️ Extreme Mutation Active]' : ''}`;
      btn.innerHTML = `
        <span class="island-icon">${isIrradiated ? '☢️' : '🏝️'}</span>
        <span class="island-name">Island ${id + 1}</span>
        <span class="island-pill" id="badge-island-${id}">Gen 1 • 0</span>
      `;
      btn.addEventListener('click', () => {
        this.switchIsland(id);
      });
      container.appendChild(btn);
    });
  }

  async setupJoinModal() {
    const modal = document.getElementById('cluster-join-modal');
    const inputName = document.getElementById('input-node-name');
    const coresContainer = document.getElementById('join-cores-selector');
    const hostAddrEl = document.getElementById('join-host-addr');
    const clusterCoresEl = document.getElementById('join-cluster-cores');
    const clusterTpsEl = document.getElementById('join-cluster-tps');
    const btnSubmit = document.getElementById('btn-join-cluster-submit');

    // Default node name
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    if (inputName) inputName.value = `Contributor-${randomSuffix}`;

    if (modal) modal.classList.remove('hidden');

    // Core selection buttons
    if (coresContainer) {
      const coreButtons = coresContainer.querySelectorAll('.btn-core-option');
      coreButtons.forEach(btn => {
        const cores = parseInt(btn.dataset.cores, 10);
        btn.classList.toggle('active', cores === this.selectedCores);
        btn.addEventListener('click', () => {
          coreButtons.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.selectedCores = cores;
        });
      });
    }

    // Fetch live cluster preview
    try {
      const status = await this.clusterClient.checkStatus();
      if (status) {
        if (hostAddrEl) hostAddrEl.textContent = `${status.hostIp}:${status.port}`;
        if (clusterCoresEl) clusterCoresEl.textContent = `${status.cluster.totalCores} Cores (${status.cluster.totalIslands} Islands)`;
        if (clusterTpsEl) clusterTpsEl.textContent = `${(status.cluster.clusterTps || 0).toLocaleString()} TPS`;
      }
    } catch (e) {
      if (hostAddrEl) hostAddrEl.textContent = window.location.host;
    }

    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = '🚀 Join Cluster & Start Simulating';

      btnSubmit.onclick = async () => {
        const nodeName = inputName?.value.trim() || `Contributor-${randomSuffix}`;
        btnSubmit.disabled = true;
        btnSubmit.textContent = '⏳ Spawning dedicated workers...';

        try {
          const reg = await this.clusterClient.join(nodeName, this.selectedCores);
          if (modal) modal.classList.add('hidden');

          // Instantiate IslandManager with allocated island IDs
          const initialPerfMode = reg.perfMode || this.clusterClient.perfMode || 'standard';
          this.islandManager = new IslandManager({
            islandIds: reg.islandIds,
            baseSeed: reg.baseSeed,
            migrationInterval: 800,
            perfMode: initialPerfMode
          });
          this.islandManager.setClusterClient(this.clusterClient);
          this.islandManager.setPerfMode(initialPerfMode);
          this.islandManager.onMigrationEvent = (event) => {
            this.showMigrationToast(event);
          };

          // Apply initial pause & speed from cluster state
          if (reg.globalState) {
            this.isPaused = Boolean(reg.globalState.isPaused);
            this.speed = reg.globalState.speed || 1;
            this.isTurbo = Boolean(reg.globalState.isTurbo);
            this.islandManager.setPause(this.isPaused);
            this.islandManager.setSpeed(this.speed, this.isTurbo);
          }

          this.updateHudRoleBadge(`💻 Contributor: ${reg.name} (${reg.islandIds.length} Cores) • 🟢 Synced`);
          this.buildIslandBarButtons();
          this.setupIslandControls();

          // Listen for cluster sync events (if not already attached)
          if (!this.hasClusterSyncListeners) {
            this.hasClusterSyncListeners = true;
            this.clusterClient.on('pause_change', (isPaused) => {
              this.isPaused = isPaused;
              const pauseIcon = document.getElementById('pause-icon');
              const pauseText = document.getElementById('pause-text');
              if (pauseIcon) pauseIcon.textContent = this.isPaused ? '▶' : '⏸';
              if (pauseText) pauseText.textContent = this.isPaused ? 'Resume' : 'Pause';
            });

            this.clusterClient.on('speed_change', ({ speed, isTurbo }) => {
              this.speed = speed;
              this.isTurbo = isTurbo;
            });

            this.clusterClient.on('island_radiation_change', () => {
              this.updateMultiIslandCard();
              this.updateIslandBarUI();
            });
          }

          // Center camera, start heartbeat and render loop
          this.renderer.initCameraCentered();
          this.clusterClient.startHeartbeat(this.islandManager);
          if (!this.hasRenderLoopStarted) {
            this.hasRenderLoopStarted = true;
            requestAnimationFrame((t) => this.renderLoop(t));
          }

        } catch (err) {
          alert(`Failed to join cluster: ${err.message}`);
          btnSubmit.disabled = false;
          btnSubmit.textContent = '🚀 Join Cluster & Start Simulating';
        }
      };
    }
  }

  handleClusterKicked(reason = 'Removed by Host Admin') {
    console.warn('[Cluster] Disconnected by Host:', reason);

    // Stop heartbeat immediately
    if (this.clusterClient) {
      this.clusterClient.stopHeartbeat();
      this.clusterClient.nodeId = null;
    }

    // Terminate all Web Worker threads
    if (this.islandManager) {
      this.islandManager.terminateAll();
      this.islandManager = null;
    }

    // Dismiss screen saver if active
    this.setVisualsHidden(false);

    // Clear island bar buttons and contributor badges
    const islandBar = document.getElementById('island-bar-container');
    if (islandBar) islandBar.innerHTML = '';

    // Update HUD role badge
    this.updateHudRoleBadge('💻 Contributor • Disconnected');

    // Alert user and re-open join modal
    alert(`Disconnected from cluster: ${reason}\n\nYou can select your desired CPU cores and re-join.`);
    this.setupJoinModal();
  }

  setVisualsHidden(hidden) {
    this.isVisualsHidden = Boolean(hidden);
    const overlay = document.getElementById('worker-screensaver-overlay');
    if (overlay) {
      overlay.classList.toggle('hidden', !this.isVisualsHidden);
    }
  }

  // --- UI Controls & Event Listeners ---

  setSimulationPaused(paused) {
    if (!this.isHost) return; // Feature gated: Guest cannot pause
    if (this.isPaused === Boolean(paused)) return;
    this.isPaused = Boolean(paused);
    const btnPause = document.getElementById('btn-pause');
    const pauseIcon = document.getElementById('pause-icon');
    const pauseText = document.getElementById('pause-text');
    if (pauseIcon) pauseIcon.textContent = this.isPaused ? '▶' : '⏸';
    if (pauseText) pauseText.textContent = this.isPaused ? 'Resume' : 'Pause';
    if (btnPause) {
      btnPause.classList.toggle('btn-primary', !this.isPaused);
      btnPause.classList.toggle('btn-secondary', this.isPaused);
    }
    this.lastTurboRenderTime = 0;
    this.lastAutoSaveCheckTime = Date.now();
    if (this.islandManager) this.islandManager.setPause(this.isPaused);
    this.updateAutoSaveHudButton();
    this.checkAutoSave();

    // Broadcast pause update to cluster
    this.clusterClient.sendControl({ isPaused: this.isPaused, speed: this.speed, isTurbo: this.isTurbo }).catch(() => {});
  }

  showLoadingOverlay(title = 'Loading Simulation', status = 'Restoring island worlds & neural populations...') {
    const overlay = document.getElementById('loading-overlay');
    const titleEl = document.getElementById('loading-overlay-title');
    const statusEl = document.getElementById('loading-overlay-status');
    if (titleEl) titleEl.textContent = title;
    if (statusEl) statusEl.textContent = status;
    if (overlay) overlay.classList.remove('hidden');
  }

  updateLoadingOverlayStatus(status) {
    const statusEl = document.getElementById('loading-overlay-status');
    if (statusEl) statusEl.textContent = status;
  }

  hideLoadingOverlay() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  setupUIControls() {
    // Play / Pause
    const btnPause = document.getElementById('btn-pause');
    btnPause?.addEventListener('click', () => {
      this.setSimulationPaused(!this.isPaused);
    });

    // Speed buttons
    const speedButtons = document.querySelectorAll('.btn-speed');
    speedButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        if (!this.isHost) return;
        speedButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        this.lastTurboRenderTime = 0; // Immediate render on mode/speed transition
        const val = btn.dataset.speed;
        if (val === 'turbo') {
          this.isTurbo = true;
          this.speed = 1;
          if (this.islandManager) this.islandManager.setSpeed(1, true);
        } else {
          this.isTurbo = false;
          this.speed = parseInt(val, 10) || 1;
          if (this.islandManager) this.islandManager.setSpeed(this.speed, false);
        }

        // Broadcast speed update to cluster
        this.clusterClient.sendControl({ isPaused: this.isPaused, speed: this.speed, isTurbo: this.isTurbo }).catch(() => {});
      });
    });

    // Layer Selector
    const layerSelect = document.getElementById('layer-select');
    layerSelect?.addEventListener('change', (e) => {
      this.lastTurboRenderTime = 0;
      this.renderer.setLayer(e.target.value);
    });

    // Reset All Islands button (Admin only)
    const btnReset = document.getElementById('btn-reset');
    btnReset?.addEventListener('click', () => {
      if (!this.isHost) return;
      this.selectedAgentId = null;
      this.selectedTile = null;
      this.lastTurboRenderTime = 0;
      this.autoSaveAccumulatedMs = 0;
      this.lastAutoSaveCheckTime = Date.now();
      if (this.islandManager) this.islandManager.resetAll(Date.now());
      this.renderer.initCameraCentered();
      this.updateAutoSaveHudButton();
      this.checkAutoSave();
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

    btnToggleSidebar?.addEventListener('click', () => setSidebarCollapsed(true));
    btnUnhideSidebar?.addEventListener('click', () => setSidebarCollapsed(false));

    // Accordion Collapse/Expand
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

    // Host Cluster Nodes Dashboard Modal
    this.setupClusterModal();
  }

  setupIslandControls() {
    // Manual Migration Button (Admin only)
    const btnMigrate = document.getElementById('btn-migrate-now');
    if (btnMigrate && this.isHost) {
      btnMigrate.addEventListener('click', async () => {
        btnMigrate.classList.add('migrating');
        btnMigrate.disabled = true;
        if (this.islandManager) await this.islandManager.triggerMigration();
        setTimeout(() => {
          btnMigrate.classList.remove('migrating');
          btnMigrate.disabled = false;
        }, 800);
      });
    }

    // Active Island Radiation / Extreme Mutation Toggle
    const btnActiveRadiation = document.getElementById('btn-toggle-active-radiation');
    if (btnActiveRadiation) {
      btnActiveRadiation.addEventListener('click', async () => {
        if (!this.islandManager) return;
        const activeIdx = this.islandManager.activeIslandIndex;
        const currentlyIrradiated = this.islandManager.isIslandIrradiated(activeIdx);
        try {
          if (this.clusterClient) {
            await this.clusterClient.toggleIslandRadiation(activeIdx, !currentlyIrradiated);
          } else {
            this.islandManager.setIslandRadiation(activeIdx, !currentlyIrradiated);
          }
          this.updateMultiIslandCard();
          this.updateIslandBarStats();
        } catch (err) {
          alert(`Failed to toggle radiation mode: ${err.message}`);
        }
      });
    }

    // Multi-Island Table Row Click Delegation
    const tableBody = document.getElementById('island-table-body');
    if (tableBody) {
      tableBody.addEventListener('click', (e) => {
        const row = e.target.closest('tr');
        if (row && row.dataset.island !== undefined) {
          this.switchIsland(parseInt(row.dataset.island, 10));
        }
      });
    }
  }

  showMigrationToast(event) {
    const toast = document.getElementById('hud-migration-toast');
    const toastText = document.getElementById('toast-migration-text');
    if (!toast || !toastText) return;

    const epoch = event.epoch || 1;
    const count = event.migrantsExchanged || event.foreignMigrants || 0;
    const machines = event.nodesCount || 1;

    toastText.textContent = `Migration Epoch ${epoch}: Exchanged ${count} genomes across ${machines} machine(s)`;
    toast.classList.remove('hidden');

    if (this.migrationToastTimer) clearTimeout(this.migrationToastTimer);
    this.migrationToastTimer = setTimeout(() => {
      toast.classList.add('hidden');
    }, 4000);
  }

  setupClusterModal() {
    if (this._clusterModalInitialized) return;
    this._clusterModalInitialized = true;

    const btnCluster = document.getElementById('btn-cluster-hud');
    const modal = document.getElementById('modal-cluster-nodes');
    const btnClose = document.getElementById('btn-close-cluster-modal');
    const btnCopy = document.getElementById('btn-copy-invite-link');

    if (btnCluster) {
      btnCluster.addEventListener('click', () => {
        this.openClusterModal();
      });
    }

    if (btnClose) {
      btnClose.addEventListener('click', () => {
        this.closeClusterModal();
      });
    }

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) this.closeClusterModal();
      });
    }

    if (btnCopy) {
      btnCopy.addEventListener('click', async () => {
        const urlEl = document.getElementById('cluster-lan-url-display');
        const url = urlEl ? urlEl.textContent.trim() : '';
        if (!url) return;

        const ok = await this.copyTextToClipboard(url);
        if (ok) {
          btnCopy.classList.add('copied');
          btnCopy.textContent = '✓ Copied!';
          setTimeout(() => {
            btnCopy.classList.remove('copied');
            btnCopy.textContent = '📋 Copy Invite Link';
          }, 2000);
        }
      });
    }

    // Delegated click handler for contributor action buttons in cluster dashboard
    const tbody = document.getElementById('cluster-nodes-table-body');
    if (tbody) {
      tbody.addEventListener('click', async (e) => {
        // Check for clicking on camera icon on island pill
        const camBtn = e.target.closest('.pill-cam-btn');
        if (camBtn && camBtn.dataset.island !== undefined) {
          e.stopPropagation();
          const islandId = parseInt(camBtn.dataset.island, 10);
          const nodeName = camBtn.dataset.nodename || 'Contributor';
          const nodeIp = camBtn.dataset.nodeip || '';
          this.openIslandCam(islandId, nodeName, nodeIp);
          return;
        }

        // Toggle radiation on an island pill button
        const pillBtn = e.target.closest('.island-pill-btn');
        if (pillBtn && pillBtn.dataset.island !== undefined) {
          const islandId = parseInt(pillBtn.dataset.island, 10);
          const isCurrentlyIrradiated = pillBtn.classList.contains('irradiated');
          try {
            await this.clusterClient.toggleIslandRadiation(islandId, !isCurrentlyIrradiated);
            await this.refreshClusterNodes();
            this.updateMultiIslandCard();
            this.updateIslandBarStats();
          } catch (err) {
            alert(`Failed to toggle island radiation: ${err.message}`);
          }
          return;
        }

        const btn = e.target.closest('.btn-cluster-action');
        if (!btn) return;
        const action = btn.dataset.action;
        const nodeId = btn.dataset.id;

        if (action === 'cam') {
          const islandId = parseInt(btn.dataset.island, 10);
          const nodeName = btn.dataset.name || 'Contributor';
          const nodeIp = btn.dataset.ip || '';
          this.openIslandCam(islandId, nodeName, nodeIp);
          return;
        }

        if (!nodeId) return;

        if (action === 'rename') {
          const currentName = btn.dataset.name || '';
          const newName = prompt(`Enter new custom name for contributor node:`, currentName);
          if (newName !== null && newName.trim() && newName.trim() !== currentName) {
            try {
              await this.clusterClient.renameNode(nodeId, newName.trim());
              await this.refreshClusterNodes();
            } catch (err) {
              alert(`Failed to rename node: ${err.message}`);
            }
          }
        } else if (action === 'hide') {
          try {
            await this.clusterClient.setNodeVisibility(nodeId, true);
            await this.refreshClusterNodes();
          } catch (err) {
            alert(`Failed to hide visuals: ${err.message}`);
          }
        } else if (action === 'unhide') {
          try {
            await this.clusterClient.setNodeVisibility(nodeId, false);
            await this.refreshClusterNodes();
          } catch (err) {
            alert(`Failed to unhide visuals: ${err.message}`);
          }
        } else if (action === 'kick') {
          const nodeName = btn.dataset.name || 'this contributor';
          if (confirm(`Are you sure you want to remove ${nodeName} from the cluster?\n\nTheir simulation will be disconnected and they will return to the join screen.`)) {
            try {
              await this.clusterClient.kickNode(nodeId);
              await this.refreshClusterNodes();
            } catch (err) {
              alert(`Failed to remove node: ${err.message}`);
            }
          }
        }
      });

      // Delegated change handler for performance mode limiter dropdown
      tbody.addEventListener('change', async (e) => {
        const select = e.target.closest('.select-cluster-perf');
        if (!select) return;
        const nodeId = select.dataset.id;
        const perfMode = select.value;
        if (!nodeId || !perfMode) return;
        try {
          await this.clusterClient.setNodePerf(nodeId, perfMode);
          await this.refreshClusterNodes();
        } catch (err) {
          alert(`Failed to update performance limiter: ${err.message}`);
        }
      });
    }
  }

  openClusterModal() {
    const modal = document.getElementById('modal-cluster-nodes');
    if (!modal) return;
    modal.classList.remove('hidden');
    this.refreshClusterNodes();

    if (this.clusterPollInterval) clearInterval(this.clusterPollInterval);
    this.clusterPollInterval = setInterval(() => {
      this.refreshClusterNodes();
    }, 2000);
  }

  closeClusterModal() {
    const modal = document.getElementById('modal-cluster-nodes');
    if (modal) modal.classList.add('hidden');
    if (this.clusterPollInterval) {
      clearInterval(this.clusterPollInterval);
      this.clusterPollInterval = null;
    }
  }

  setupIslandCamModal() {
    if (this._islandCamModalInitialized) return;
    this._islandCamModalInitialized = true;

    const modal = document.getElementById('modal-island-cam');
    const btnClose = document.getElementById('snooper-btn-close');
    const btnRefresh = document.getElementById('snooper-btn-refresh');
    const btnToggleRad = document.getElementById('snooper-btn-toggle-radiation');

    if (btnClose) {
      btnClose.addEventListener('click', () => {
        this.closeIslandCam();
      });
    }

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) this.closeIslandCam();
      });
    }

    if (btnRefresh) {
      btnRefresh.addEventListener('click', () => {
        this.refreshIslandCamFeed(true);
      });
    }

    if (btnToggleRad) {
      btnToggleRad.addEventListener('click', async () => {
        if (this.activeSnooperIsland === null || this.activeSnooperIsland === undefined) return;
        const islandId = this.activeSnooperIsland;
        const isCurrentlyIrradiated = this.islandManager ? this.islandManager.isIslandIrradiated(islandId) : false;
        try {
          if (this.clusterClient) {
            await this.clusterClient.toggleIslandRadiation(islandId, !isCurrentlyIrradiated);
          } else if (this.islandManager) {
            this.islandManager.setIslandRadiation(islandId, !isCurrentlyIrradiated);
          }
          this.updateSnooperRadiationState(!isCurrentlyIrradiated);
          this.refreshClusterNodes();
        } catch (err) {
          alert(`Failed to toggle radiation: ${err.message}`);
        }
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.activeSnooperIsland !== null && this.activeSnooperIsland !== undefined) {
        this.closeIslandCam();
      }
    });
  }

  async openIslandCam(islandId, nodeName = 'Contributor', nodeIp = '127.0.0.1') {
    this.activeSnooperIsland = islandId;

    const modal = document.getElementById('modal-island-cam');
    if (!modal) return;
    modal.classList.remove('hidden');

    const titleEl = document.getElementById('snooper-island-title');
    if (titleEl) titleEl.textContent = `Satellite Cam — Island ${islandId + 1}`;

    const subtitleEl = document.getElementById('snooper-node-subtitle');
    if (subtitleEl) subtitleEl.textContent = `${nodeName} (${nodeIp})`;

    const isRad = this.islandManager ? this.islandManager.isIslandIrradiated(islandId) : false;
    this.updateSnooperRadiationState(isRad);

    const isLocal = this.islandManager && this.islandManager.islandIds.includes(islandId);
    if (!isLocal && this.clusterClient) {
      // Lease signal: Tell coordinator host is viewing this island
      this.clusterClient.startWatchingIsland(islandId).catch(err => console.warn('[Snooper] startWatching failed:', err));
    }

    // Initial feed refresh with loading indicator
    await this.refreshIslandCamFeed(true);

    // Refresh every 1.5 seconds while open
    if (this.snooperPollInterval) clearInterval(this.snooperPollInterval);
    this.snooperPollInterval = setInterval(() => {
      this.refreshIslandCamFeed(false);
    }, 1500);
  }

  updateSnooperRadiationState(isRad) {
    const frame = document.getElementById('snooper-viewport-frame');
    const watermark = document.getElementById('snooper-rad-watermark');
    const radStat = document.getElementById('snooper-stat-radiation');
    const btnToggleRad = document.getElementById('snooper-btn-toggle-radiation');

    if (frame) {
      if (isRad) frame.classList.add('irradiated');
      else frame.classList.remove('irradiated');
    }

    if (watermark) {
      if (isRad) watermark.classList.remove('hidden');
      else watermark.classList.add('hidden');
    }

    if (radStat) {
      radStat.textContent = isRad ? '☢️ Irradiated (5.0x)' : 'Standard (1.0x)';
      radStat.className = `snooper-stat-val mono ${isRad ? 'highlight-rad' : ''}`;
    }

    if (btnToggleRad) {
      btnToggleRad.textContent = isRad ? 'Restore Normal' : '☢️ Irradiate Island';
    }
  }

  async refreshIslandCamFeed(forceLoading = false) {
    if (this.activeSnooperIsland === null || this.activeSnooperIsland === undefined) return;
    const islandId = this.activeSnooperIsland;

    const overlay = document.getElementById('snooper-loading-overlay');
    const img = document.getElementById('snooper-image');
    const popEl = document.getElementById('snooper-stat-pop');
    const tpsEl = document.getElementById('snooper-stat-tps');
    const tickEl = document.getElementById('snooper-stat-tick');
    const ageEl = document.getElementById('snooper-stat-age');

    if (forceLoading && overlay && (!img || !img.src)) {
      overlay.classList.remove('hidden');
    }

    const isLocal = this.islandManager && this.islandManager.islandIds.includes(islandId);

    if (isLocal) {
      try {
        const record = await this.islandManager.requestIslandSnapshot(islandId, 64, 64);
        if (this.activeSnooperIsland !== islandId) return;

        const dataUrl = (record && record.dataUrl) ? record.dataUrl : record;
        if (img && dataUrl && typeof dataUrl === 'string') {
          img.src = dataUrl;
          if (overlay) overlay.classList.add('hidden');
        }

        const island = this.islandManager.islands.get(islandId);
        if (island) {
          if (popEl) popEl.textContent = (island.agentCount || 0).toLocaleString();
          if (tpsEl) tpsEl.textContent = `${island.tps || 0} TPS`;
          if (tickEl) tickEl.textContent = (island.worldTick || 0).toLocaleString();
        }
        if (ageEl) {
          ageEl.textContent = `Updated: ${new Date().toLocaleTimeString()} (Local)`;
        }
        this.updateSnooperRadiationState(this.islandManager.isIslandIrradiated(islandId));
      } catch (err) {
        console.warn(`[Snooper] Local snapshot error:`, err);
      }
    } else if (this.clusterClient) {
      try {
        // Keep watch lease active
        await this.clusterClient.startWatchingIsland(islandId);
        const snap = await this.clusterClient.fetchIslandSnapshot(islandId);

        if (this.activeSnooperIsland !== islandId) return;

        if (snap && snap.dataUrl) {
          if (img) img.src = snap.dataUrl;
          if (overlay) overlay.classList.add('hidden');
          if (popEl) popEl.textContent = (snap.population || 0).toLocaleString();
          if (tpsEl) tpsEl.textContent = `${snap.tps || 0} TPS`;
          if (tickEl) tickEl.textContent = (snap.worldTick || 0).toLocaleString();
          if (ageEl) {
            const ageSec = snap.timestamp ? Math.max(0, Math.round((Date.now() - snap.timestamp) / 1000)) : 0;
            ageEl.textContent = `Updated: ${ageSec}s ago`;
          }
          if (snap.isIrradiated !== undefined) {
            this.updateSnooperRadiationState(Boolean(snap.isIrradiated));
          }
        }
      } catch (err) {
        console.warn(`[Snooper] Remote snapshot error:`, err);
      }
    }
  }

  closeIslandCam() {
    const modal = document.getElementById('modal-island-cam');
    if (modal) modal.classList.add('hidden');

    if (this.snooperPollInterval) {
      clearInterval(this.snooperPollInterval);
      this.snooperPollInterval = null;
    }

    if (this.activeSnooperIsland !== null && this.activeSnooperIsland !== undefined) {
      this.activeSnooperIsland = null;
      if (this.clusterClient) {
        this.clusterClient.stopWatchingIsland().catch(err => console.warn('[Snooper] stopWatching failed:', err));
      }
    }
  }

  async copyTextToClipboard(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (err) {
      // Fall through to execCommand
    }

    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      return success;
    } catch (err) {
      console.warn('[App] Copy to clipboard failed:', err);
      return false;
    }
  }

  async refreshClusterNodes() {
    if (!this.clusterClient) return;
    try {
      const data = await this.clusterClient.fetchNodes();
      const nodes = Array.isArray(data.nodes) ? data.nodes : [];
      const hostIp = data.hostIp || window.location.hostname;
      const port = data.port || window.location.port || 8080;
      const lanUrl = `http://${hostIp}:${port}`;

      // Update invite URL display
      const urlEl = document.getElementById('cluster-lan-url-display');
      if (urlEl) urlEl.textContent = lanUrl;

      // Update badge in HUD button
      const badgeCount = document.getElementById('badge-cluster-nodes-count');
      if (badgeCount) badgeCount.textContent = String(nodes.length);

      // Compute cluster metrics
      let totalCores = 0;
      let totalIslands = 0;
      let totalTps = 0;
      let totalPop = 0;

      for (const n of nodes) {
        totalCores += (n.cores || 0);
        totalIslands += (Array.isArray(n.islandIds) ? n.islandIds.length : (n.cores || 0));
        totalTps += (n.tps || 0);
        totalPop += (n.population || 0);
      }

      const elNodes = document.getElementById('metric-cluster-nodes');
      if (elNodes) elNodes.textContent = `${nodes.length} Node${nodes.length !== 1 ? 's' : ''}`;

      const elCores = document.getElementById('metric-cluster-cores');
      if (elCores) elCores.textContent = `${totalCores} Cores`;

      const elIslands = document.getElementById('metric-cluster-islands');
      if (elIslands) elIslands.textContent = `${totalIslands} Islands`;

      const elTps = document.getElementById('metric-cluster-tps');
      if (elTps) elTps.textContent = `${totalTps.toLocaleString()} TPS`;

      const elPop = document.getElementById('metric-cluster-pop');
      if (elPop) elPop.textContent = `${totalPop.toLocaleString()} Agents`;

      // Render table rows
      const tbody = document.getElementById('cluster-nodes-table-body');
      if (tbody) {
        // Avoid rebuilding rows while user is interacting with a performance dropdown
        if (document.activeElement && tbody.contains(document.activeElement) && document.activeElement.tagName === 'SELECT') {
          return;
        }

        tbody.innerHTML = nodes.map(n => {
          const isHost = Boolean(n.isHost);
          const roleHtml = isHost
            ? '<span class="node-role-badge host">👑 Host Admin</span>'
            : '<span class="node-role-badge contributor">💻 Contributor</span>';

          const statusClass = n.status === 'active' ? 'active' : (n.status === 'offline' ? 'offline' : 'delayed');
          const statusLabel = n.status === 'active' ? 'Active' : (n.status === 'offline' ? 'Offline' : 'Delayed');
          const statusHtml = `<span class="node-status-dot ${statusClass}"></span>${statusLabel}`;

          let islandsHtml = '—';
          if (Array.isArray(n.islandIds) && n.islandIds.length > 0) {
            const nodeRadSet = new Set(n.irradiatedIslands || []);
            islandsHtml = `
              <div class="island-pills-row">
                ${n.islandIds.map(islId => {
                  const isRad = nodeRadSet.has(islId) || (this.islandManager && this.islandManager.isIslandIrradiated(islId));
                  return `
                    <button class="island-pill-btn ${isRad ? 'irradiated' : ''}" 
                            data-island="${islId}" 
                            title="${isRad ? `Island ${islId + 1}: Irradiated (Extreme Mutation Active)\nClick to restore normal mutation` : `Island ${islId + 1}: Normal Mutation\nClick to activate Radiation & Extreme Mutation Mode`}">
                      ${isRad ? '☢️' : '🏝️'} Isl ${islId + 1}
                      <span class="pill-cam-btn" 
                            data-island="${islId}" 
                            data-nodename="${this.escapeHtml(n.name || (isHost ? 'Host' : 'Contributor'))}" 
                            data-nodeip="${this.escapeHtml(n.ip || (isHost ? 'Local' : '127.0.0.1'))}" 
                            title="Open live satellite cam for Island ${islId + 1}">📹</span>
                    </button>
                  `;
                }).join('')}
              </div>
            `;
          }

          let perfHtml = '<span class="perf-badge host">Host (Default)</span>';
          if (!isHost) {
            const currentPerf = n.perfMode || 'standard';
            perfHtml = `
              <select class="select-cluster-perf" data-id="${n.nodeId}">
                <option value="eco" ${currentPerf === 'eco' ? 'selected' : ''}>🌱 Eco (~30 TPS)</option>
                <option value="standard" ${currentPerf === 'standard' ? 'selected' : ''}>⚡ Standard (60 TPS)</option>
                <option value="turbo" ${currentPerf === 'turbo' ? 'selected' : ''}>🚀 Turbo (Max)</option>
              </select>
            `;
          }

          let actionsHtml = '<span class="text-muted text-xs">Host Admin</span>';
          if (!isHost) {
            const isHidden = Boolean(n.isHidden);
            const visBtnHtml = isHidden
              ? `<button class="btn btn-xs btn-cluster-action btn-action-vis unhide" data-action="unhide" data-id="${n.nodeId}" title="Unhide simulation canvas on this contributor">👁️ Unhide</button>`
              : `<button class="btn btn-xs btn-cluster-action btn-action-vis hide" data-action="hide" data-id="${n.nodeId}" title="Mute canvas and activate zero-render screensaver to save compute">🙈 Hide</button>`;

            const firstIslandId = (Array.isArray(n.islandIds) && n.islandIds.length > 0) ? n.islandIds[0] : null;
            const camBtnHtml = firstIslandId !== null
              ? `<button class="btn btn-xs btn-cluster-action btn-action-cam" data-action="cam" data-island="${firstIslandId}" data-name="${this.escapeHtml(n.name || 'Contributor')}" data-ip="${this.escapeHtml(n.ip || '')}" title="View live satellite camera for this contributor's island">📹 Cam</button>`
              : '';

            actionsHtml = `
              <div class="cluster-actions-cell">
                ${camBtnHtml}
                <button class="btn btn-xs btn-cluster-action btn-action-rename" data-action="rename" data-id="${n.nodeId}" data-name="${this.escapeHtml(n.name || '')}" title="Rename this contributor node">✏️ Rename</button>
                ${visBtnHtml}
                <button class="btn btn-xs btn-cluster-action btn-action-kick" data-action="kick" data-id="${n.nodeId}" data-name="${this.escapeHtml(n.name || '')}" title="Remove contributor from cluster">❌ Remove</button>
              </div>
            `;
          }

          const rowClass = isHost ? 'host-row' : '';

          return `
            <tr class="${rowClass}">
              <td class="font-bold">${this.escapeHtml(n.name || 'Unknown')}</td>
              <td>${roleHtml}</td>
              <td class="mono text-xs">${this.escapeHtml(n.ip || '127.0.0.1')}</td>
              <td class="mono">${n.cores || 0} Cores</td>
              <td>${islandsHtml}</td>
              <td class="mono highlight-action">${(n.tps || 0).toLocaleString()} TPS</td>
              <td class="mono">${(n.population || 0).toLocaleString()}</td>
              <td>${perfHtml}</td>
              <td>${statusHtml}</td>
              <td style="text-align: right;">${actionsHtml}</td>
            </tr>
          `;
        }).join('');
      }
    } catch (err) {
      console.warn('[App] Failed to refresh cluster nodes:', err);
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  switchIsland(targetId) {
    if (!this.islandManager || !this.islandManager.islandIds.includes(targetId)) return;
    this.selectedAgentId = null;
    this.selectedTile = null;
    this.lastTurboRenderTime = 0; // Immediate render on island switch
    this.islandManager.setActiveIsland(targetId);
    this.updateIslandBarUI();
  }

  setupPopulationControls() {
    const btnQuickSpawn = document.getElementById('btn-quick-spawn');
    btnQuickSpawn?.addEventListener('click', () => {
      this.islandManager.spawnOnActiveIsland(50);
    });

    const btnSpawn50 = document.getElementById('btn-spawn-50');
    btnSpawn50?.addEventListener('click', () => {
      this.islandManager.spawnOnActiveIsland(50);
    });

    const btnSpawn100 = document.getElementById('btn-spawn-100');
    btnSpawn100?.addEventListener('click', () => {
      this.islandManager.spawnOnActiveIsland(100);
    });

    const sliderPopCap = document.getElementById('slider-pop-cap');
    const labelPopCap = document.getElementById('label-pop-cap');
    sliderPopCap?.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      this.islandManager.setPopulationLimits(val, undefined);
      if (labelPopCap) labelPopCap.textContent = val;
    });

    const sliderPopFloor = document.getElementById('slider-pop-floor');
    const labelPopFloor = document.getElementById('label-pop-floor');
    sliderPopFloor?.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      this.islandManager.setPopulationLimits(undefined, val);
      if (labelPopFloor) labelPopFloor.textContent = val;
    });
  }

  setupAutoSaveTimer() {
    this.updateAutoSaveHudButton();
    setInterval(() => this.checkAutoSave(), 1000);
  }

  updateAutoSaveHudButton() {
    const hudBtn = document.getElementById('btn-autosave-hud');
    if (!hudBtn) return;
    if (this.autoSaveEnabled) {
      hudBtn.classList.remove('disabled');
      if (this.isPaused) {
        hudBtn.textContent = `⏱️ Auto: PAUSED (${this.autoSaveIntervalMinutes}m)`;
      } else {
        hudBtn.textContent = `⏱️ Auto: ON (${this.autoSaveIntervalMinutes}m)`;
      }
    } else {
      hudBtn.classList.add('disabled');
      hudBtn.textContent = '⏱️ Auto: OFF';
    }
  }

  checkAutoSave() {
    const now = Date.now();
    const deltaMs = Math.min(2000, Math.max(0, now - this.lastAutoSaveCheckTime));
    this.lastAutoSaveCheckTime = now;

    const statusText = document.getElementById('autosave-status-text');
    if (!this.autoSaveEnabled) {
      if (statusText) statusText.textContent = 'Auto-Save: Disabled';
      return;
    }

    const activeTick = this.islandManager.telemetry[this.islandManager.activeIslandIndex]?.tick || 0;
    if (activeTick === 0) {
      if (statusText) statusText.textContent = 'Waiting for world start...';
      return;
    }

    const intervalMs = this.autoSaveIntervalMinutes * 60 * 1000;
    const remainingSec = Math.max(0, Math.ceil((intervalMs - this.autoSaveAccumulatedMs) / 1000));

    // When paused: freeze accumulation and display paused status in UI
    if (this.isPaused) {
      if (statusText) {
        if (remainingSec >= 60) {
          const m = Math.floor(remainingSec / 60);
          const s = remainingSec % 60;
          statusText.textContent = `Next in: ${m}m ${s < 10 ? '0' : ''}${s}s (Paused)`;
        } else {
          statusText.textContent = `Next in: ${remainingSec}s (Paused)`;
        }
      }
      return;
    }

    // Accumulate active execution time
    this.autoSaveAccumulatedMs += deltaMs;
    const updatedRemainingSec = Math.max(0, Math.ceil((intervalMs - this.autoSaveAccumulatedMs) / 1000));

    if (statusText) {
      if (updatedRemainingSec >= 60) {
        const m = Math.floor(updatedRemainingSec / 60);
        const s = updatedRemainingSec % 60;
        statusText.textContent = `Next in: ${m}m ${s < 10 ? '0' : ''}${s}s`;
      } else {
        statusText.textContent = `Next in: ${updatedRemainingSec}s`;
      }
    }

    if (this.autoSaveAccumulatedMs >= intervalMs) {
      this.autoSaveAccumulatedMs = 0;
      this.triggerAutoSave();
    }
  }

  async triggerAutoSave() {
    const activeTick = this.islandManager.telemetry[this.islandManager.activeIslandIndex]?.tick || 0;
    if (activeTick === 0) return;

    const hudBtn = document.getElementById('btn-autosave-hud');
    if (hudBtn) {
      hudBtn.classList.add('saving');
      hudBtn.textContent = '💾 Auto-saving...';
    }

    try {
      const now = new Date();
      const dateTag = now.toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const saveName = `autosave_multi_tick_${activeTick}_${dateTag}`;
      const multiSave = await this.islandManager.serializeAll(saveName);
      await StorageManager.saveSimulation(multiSave, saveName, true);

      if (hudBtn) {
        hudBtn.textContent = `💾 Auto-saved (Tick ${activeTick})`;
        setTimeout(() => {
          hudBtn.classList.remove('saving');
          this.updateAutoSaveHudButton();
        }, 2200);
      }

      const modal = document.getElementById('modal-container');
      if (modal && !modal.classList.contains('hidden') && this.refreshModalSavesList) {
        await this.refreshModalSavesList();
      }
    } catch (err) {
      console.warn('[AutoSave] Multi-island save failed:', err);
      if (hudBtn) {
        hudBtn.classList.remove('saving');
        this.updateAutoSaveHudButton();
      }
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

    const hudAutoSaveBtn = document.getElementById('btn-autosave-hud');
    const autoSaveToggle = document.getElementById('autosave-toggle');
    const autoSaveIntervalSelect = document.getElementById('autosave-interval-select');
    const tabManual = document.getElementById('tab-manual-saves');
    const tabAuto = document.getElementById('tab-auto-saves');
    const badgeManual = document.getElementById('badge-manual-count');
    const badgeAuto = document.getElementById('badge-auto-count');
    const btnClearAutosaves = document.getElementById('btn-clear-autosaves');

    if (autoSaveToggle) autoSaveToggle.checked = this.autoSaveEnabled;
    if (autoSaveIntervalSelect) autoSaveIntervalSelect.value = String(this.autoSaveIntervalMinutes);

    autoSaveToggle?.addEventListener('change', (e) => {
      this.autoSaveEnabled = e.target.checked;
      localStorage.setItem('biome_shifters_autosave_enabled', String(this.autoSaveEnabled));
      this.lastAutoSaveCheckTime = Date.now();
      this.updateAutoSaveHudButton();
      this.checkAutoSave();
    });

    autoSaveIntervalSelect?.addEventListener('change', (e) => {
      this.autoSaveIntervalMinutes = parseInt(e.target.value, 10) || 2;
      localStorage.setItem('biome_shifters_autosave_interval', String(this.autoSaveIntervalMinutes));
      this.autoSaveAccumulatedMs = 0;
      this.lastAutoSaveCheckTime = Date.now();
      this.updateAutoSaveHudButton();
      this.checkAutoSave();
    });

    hudAutoSaveBtn?.addEventListener('click', () => {
      this.autoSaveEnabled = !this.autoSaveEnabled;
      localStorage.setItem('biome_shifters_autosave_enabled', String(this.autoSaveEnabled));
      if (autoSaveToggle) autoSaveToggle.checked = this.autoSaveEnabled;
      this.lastAutoSaveCheckTime = Date.now();
      this.updateAutoSaveHudButton();
      this.checkAutoSave();
    });

    const updateTabUI = () => {
      if (this.currentSaveTab === 'manual') {
        tabManual?.classList.add('active');
        tabAuto?.classList.remove('active');
        btnClearAutosaves?.classList.add('hidden');
      } else {
        tabManual?.classList.remove('active');
        tabAuto?.classList.add('active');
        const autoCount = (this.allSavesCache || []).filter(s => s.isAutosave).length;
        if (autoCount > 0) btnClearAutosaves?.classList.remove('hidden');
        else btnClearAutosaves?.classList.add('hidden');
      }
    };

    tabManual?.addEventListener('click', () => {
      this.currentSaveTab = 'manual';
      updateTabUI();
      renderCurrentList();
    });

    tabAuto?.addEventListener('click', () => {
      this.currentSaveTab = 'auto';
      updateTabUI();
      renderCurrentList();
    });

    btnClearAutosaves?.addEventListener('click', async () => {
      const autoCount = (this.allSavesCache || []).filter(s => s.isAutosave).length;
      if (autoCount === 0) return;
      if (confirm(`Delete all ${autoCount} auto-save files from the saves/ folder?`)) {
        btnClearAutosaves.disabled = true;
        btnClearAutosaves.textContent = 'Clearing...';
        await StorageManager.clearAutosaves(this.allSavesCache);
        btnClearAutosaves.disabled = false;
        btnClearAutosaves.textContent = 'Clear Auto-Saves';
        await this.refreshModalSavesList();
      }
    });

    const renderCurrentList = () => {
      savesList.innerHTML = '';
      const isAuto = this.currentSaveTab === 'auto';
      const filtered = (this.allSavesCache || []).filter(s => isAuto ? s.isAutosave : !s.isAutosave);

      if (filtered.length === 0) {
        savesList.innerHTML = `<li class="save-item-empty">No ${isAuto ? 'auto' : 'manual'} saves found.</li>`;
        return;
      }

      filtered.forEach(save => {
        const li = document.createElement('li');
        li.className = 'save-item';
        li.innerHTML = `
          <div class="save-info">
            <div class="save-name-row">
              <span class="save-item-name">${save.name || save.filename}</span>
              <span class="save-type-pill ${save.isAutosave ? 'pill-auto' : 'pill-manual'}">${save.isAutosave ? 'Auto' : 'Manual'}</span>
            </div>
            <div class="save-meta">
              <span>Tick ${(save.tick || 0).toLocaleString()}</span>
              <span>•</span>
              <span>Pop ${(save.population ?? save.agentCount ?? 0).toLocaleString()}</span>
              <span>•</span>
              <span>${save.modified || (save.timestamp ? new Date(save.timestamp).toLocaleString() : '')}</span>
            </div>
          </div>
          <div class="save-actions">
            <button class="btn btn-primary btn-sm btn-action-load" data-file="${save.filename}">Load</button>
            <button class="btn btn-danger btn-sm btn-action-delete" data-file="${save.filename}">Delete</button>
          </div>
        `;

        li.querySelector('.btn-action-load').addEventListener('click', async () => {
          const wasPausedBefore = this.isPaused;
          // 1. Immediately pause simulation & workers so world is frozen
          this.setSimulationPaused(true);

          // 2. Close modal & display full-screen loading spinner
          closeModal();
          this.showLoadingOverlay('Loading Simulation', `Fetching "${save.name || save.filename}"...`);

          try {
            // Allow browser to render the spinner frame before heavy transfer
            await new Promise(r => setTimeout(r, 60));

            const data = await StorageManager.loadSave(save.filename);
            this.updateLoadingOverlayStatus('Restoring 8 island worlds & neural populations...');
            await this.islandManager.deserializeData(data);

            this.autoSaveAccumulatedMs = 0;
            this.lastAutoSaveCheckTime = Date.now();
            this.checkAutoSave();
            this.renderer.initCameraCentered();

            this.updateLoadingOverlayStatus('Simulation restored successfully!');
            await new Promise(r => setTimeout(r, 220));
          } catch (err) {
            alert(`Failed to load save: ${err.message}`);
          } finally {
            this.hideLoadingOverlay();
            // Restore running state if it was running before clicking Load
            if (!wasPausedBefore) {
              this.setSimulationPaused(false);
            }
          }
        });

        li.querySelector('.btn-action-delete').addEventListener('click', async () => {
          if (confirm(`Delete save "${save.name || save.filename}"?`)) {
            await StorageManager.deleteSave(save.filename);
            await this.refreshModalSavesList();
          }
        });

        savesList.appendChild(li);
      });
    };

    this.refreshModalSavesList = async () => {
      loadingIndicator.classList.remove('hidden');
      savesList.innerHTML = '';
      try {
        const saves = await StorageManager.listSaves();
        loadingIndicator.classList.add('hidden');
        this.allSavesCache = saves;

        const manualCount = saves.filter(s => !s.isAutosave).length;
        const autoCount = saves.filter(s => s.isAutosave).length;
        if (badgeManual) badgeManual.textContent = String(manualCount);
        if (badgeAuto) badgeAuto.textContent = String(autoCount);

        updateTabUI();
        renderCurrentList();
      } catch (err) {
        loadingIndicator.textContent = `Error loading saves: ${err.message}`;
      }
    };

    const openModal = async (initialTab = 'manual') => {
      modal.classList.remove('hidden');
      const curTick = this.islandManager.telemetry[this.islandManager.activeIslandIndex]?.tick || 0;
      saveNameInput.value = `multi_island_tick_${curTick}`;
      this.currentSaveTab = initialTab;
      updateTabUI();
      await this.refreshModalSavesList();
    };

    const closeModal = () => {
      modal.classList.add('hidden');
    };

    btnSave?.addEventListener('click', () => openModal('manual'));
    btnLoadList?.addEventListener('click', () => openModal('manual'));
    btnClose?.addEventListener('click', closeModal);
    modal?.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    btnSaveConfirm?.addEventListener('click', async () => {
      const name = saveNameInput.value.trim() || `multi_island_${Date.now()}`;
      btnSaveConfirm.disabled = true;
      btnSaveConfirm.textContent = 'Saving...';
      try {
        const multiSave = await this.islandManager.serializeAll(name);
        await StorageManager.saveSimulation(multiSave, name, false);
        btnSaveConfirm.textContent = 'Saved to disk!';
        setTimeout(async () => {
          btnSaveConfirm.disabled = false;
          btnSaveConfirm.textContent = 'Save Current State';
          this.currentSaveTab = 'manual';
          updateTabUI();
          await this.refreshModalSavesList();
        }, 700);
      } catch (err) {
        alert(`Save failed: ${err.message}`);
        btnSaveConfirm.disabled = false;
        btnSaveConfirm.textContent = 'Save Current State';
      }
    });
  }

  setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (this.isHost) {
          document.getElementById('btn-pause')?.click();
        }
      } else if (e.code === 'KeyC') {
        if (!this.islandManager) return;
        this.lastTurboRenderTime = 0;
        const frame = this.islandManager.activeFrame;
        if (this.selectedAgentId !== null && frame && Array.isArray(frame.agents)) {
          const agent = frame.agents.find(a => a.id === this.selectedAgentId);
          if (agent) this.renderer.centerOnCell(agent.x, agent.y);
          else this.renderer.initCameraCentered();
        } else if (this.selectedTile) {
          this.renderer.centerOnCell(this.selectedTile.x, this.selectedTile.y);
        } else {
          this.renderer.initCameraCentered();
        }
      } else if (e.key >= '1' && e.key <= '9') {
        if (!this.islandManager) return;
        const keyNum = parseInt(e.key, 10);
        if (keyNum >= 1 && keyNum <= this.islandManager.islandIds.length) {
          const targetId = this.islandManager.islandIds[keyNum - 1];
          this.switchIsland(targetId);
        }
      } else if (e.code === 'KeyT') {
        if (this.isHost) {
          document.querySelector('.btn-turbo')?.click();
        }
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

  // --- Main Animation & Decoupled Render Loop ---

  renderLoop(timestamp) {
    if (!this.islandManager) return;

    // Zero-Render Contributor Worker Screen Saver Mode
    // When hidden by Host, completely bypass canvas rendering, worker frame requests, and DOM blitting
    // to dedicate 100% of processing power to background island simulation and eliminate GPU overhead
    if (this.isVisualsHidden) {
      this.updateScreensaverUI(timestamp);
      requestAnimationFrame((t) => this.renderLoop(t));
      return;
    }

    // In Turbo mode, throttle canvas rendering and UI updates to ~4 FPS (CONFIG.TURBO_UI_FPS)
    // to dedicate maximum CPU processing power to simulation workers and minimize IPC overhead
    if (this.isTurbo) {
      const minInterval = 1000 / (CONFIG.TURBO_UI_FPS || 4);
      if (timestamp - this.lastTurboRenderTime < minInterval) {
        requestAnimationFrame((t) => this.renderLoop(t));
        return;
      }
      this.lastTurboRenderTime = timestamp;
    }

    // 1. Request latest render frame from the active island worker
    this.islandManager.requestActiveFrame(this.selectedAgentId, this.selectedTile);
    const frame = this.islandManager.activeFrame;

    // 2. Render frame to canvas
    if (frame) {
      this.renderer.render(frame, this.selectedAgentId, this.selectedTile);
      this.updateHUD(frame);
      this.updateInspectorUI(frame);
    }

    // 3. Update multi-island UI
    this.updateIslandBarUI();
    this.updateMultiIslandCard();

    requestAnimationFrame((t) => this.renderLoop(t));
  }

  // --- Screensaver & Zero-Render UI ---

  updateScreensaverUI(timestamp) {
    if (!this.lastScreensaverFrame) this.lastScreensaverFrame = 0;
    // Throttle screensaver canvas and text updates to ~25 FPS (40ms) to consume negligible CPU (<0.5%)
    if (timestamp - this.lastScreensaverFrame < 40) return;
    this.lastScreensaverFrame = timestamp;

    // 1. Update text telemetry from local IslandManager
    if (this.islandManager) {
      const elIslands = document.getElementById('screensaver-islands');
      if (elIslands && Array.isArray(this.islandManager.islandIds)) {
        const ids = this.islandManager.islandIds;
        if (ids.length === 1) {
          elIslands.textContent = `Island ${ids[0] + 1}`;
        } else if (ids.length > 1) {
          elIslands.textContent = `Islands ${Math.min(...ids) + 1}–${Math.max(...ids) + 1} (${ids.length} Cores)`;
        }
      }

      const elTps = document.getElementById('screensaver-tps');
      if (elTps) {
        const tps = this.islandManager.getCombinedTps();
        elTps.textContent = `${tps.toLocaleString()} TPS`;
      }

      const elPop = document.getElementById('screensaver-pop');
      if (elPop) {
        const pop = this.islandManager.getTotalPopulation();
        elPop.textContent = `${pop.toLocaleString()} Agents`;
      }

      const elCycle = document.getElementById('screensaver-cycle-text');
      if (elCycle) {
        let maxTick = 0;
        for (const id of this.islandManager.islandIds) {
          const t = this.islandManager.telemetry[id]?.tick || 0;
          if (t > maxTick) maxTick = t;
        }
        elCycle.textContent = maxTick > 0 ? `Tick ${maxTick.toLocaleString()} • Simulating` : 'Simulating in background...';
      }
    }

    // 2. Animate subtle waveform/radar on screensaver canvas
    const canvas = document.getElementById('screensaver-radar-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Soft trail clear
    ctx.fillStyle = 'rgba(4, 9, 18, 0.25)';
    ctx.fillRect(0, 0, w, h);

    // Subtle cyber grid lines
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < w; x += 40) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = 0; y < h; y += 28) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();

    // Primary cyan waveform
    const t = timestamp * 0.003;
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x < w; x += 4) {
      const nx = x / w;
      const y = h * 0.5 + Math.sin(nx * 10 + t) * 20 * Math.sin(t * 0.4) + Math.cos(nx * 5 - t * 1.3) * 12;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Secondary emerald harmonic waveform
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = 0; x < w; x += 6) {
      const nx = x / w;
      const y = h * 0.5 + Math.sin(nx * 7 - t * 1.1) * 16 * Math.cos(t * 0.6);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // --- UI Updates ---

  updateHUD(frame) {
    const stats = frame.stats || {};
    const tickEl = document.getElementById('stat-tick');
    if (tickEl) tickEl.textContent = (stats.tick || 0).toLocaleString();
    const tickBadge = document.getElementById('stat-tick-badge');
    if (tickBadge) tickBadge.textContent = `Tick ${(stats.tick || 0).toLocaleString()}`;

    const tpsEl = document.getElementById('stat-tps');
    if (tpsEl) tpsEl.textContent = (frame.tps || 0).toLocaleString();

    const popEl = document.getElementById('stat-pop');
    if (popEl) popEl.textContent = `${stats.population || 0} / ${stats.maxPopulation || CONFIG.MAX_POPULATION}`;

    const avgEnergyEl = document.getElementById('stat-avg-energy');
    if (avgEnergyEl) avgEnergyEl.textContent = `${stats.avgEnergy || 0} / ${CONFIG.MAX_ENERGY}`;

    const bioEl = document.getElementById('stat-biomass');
    if (bioEl) bioEl.textContent = (stats.totalBiomass || 0).toLocaleString();

    const waterEl = document.getElementById('stat-water');
    if (waterEl) waterEl.textContent = `${stats.waterCoveragePct || 0}%`;

    const popRatioBadge = document.getElementById('pop-ratio-badge');
    if (popRatioBadge) popRatioBadge.textContent = `${stats.population || 0} / ${stats.maxPopulation || CONFIG.MAX_POPULATION}`;

    // Evolution Card Stats
    const maxGenBadge = document.getElementById('stat-maxgen-badge');
    if (maxGenBadge) {
      maxGenBadge.textContent = stats.generationMaxAllTime > stats.generationMax
        ? `Gen ${stats.generationMax} (★${stats.generationMaxAllTime})`
        : `Gen ${stats.generationMax || 1}`;
    }

    const maxGenEl = document.getElementById('stat-max-gen');
    if (maxGenEl) {
      maxGenEl.textContent = stats.generationMaxAllTime > stats.generationMax
        ? `Gen ${stats.generationMax} (Peak: ${stats.generationMaxAllTime})`
        : `Gen ${stats.generationMax || 1}`;
    }

    const avgGenEl = document.getElementById('stat-avg-gen');
    if (avgGenEl) avgGenEl.textContent = `Gen ${stats.generationAvg || 1.0}`;

    const elitesCountEl = document.getElementById('stat-elites-count');
    if (elitesCountEl) elitesCountEl.textContent = `${stats.elitesCount || 0} / 25`;

    const genActiveCount = document.getElementById('gen-active-count');
    if (genActiveCount) {
      const activeCount = stats.generationCounts ? stats.generationCounts.length : 1;
      genActiveCount.textContent = `${activeCount} ${activeCount === 1 ? 'Gen' : 'Gens'} Active`;
    }

    const activeImmigrantsEl = document.getElementById('stat-active-immigrants');
    if (activeImmigrantsEl) {
      activeImmigrantsEl.textContent = String(stats.immigrantsReceived || 0);
    }
  }

  updateInspectorUI(frame) {
    // 1. Live Telemetry & Generation Graphs
    if (this.telemetryCanvas && frame) {
      Renderer.renderTelemetryGraph(this.telemetryCanvas, frame);
    }
    if (this.generationCanvas && frame) {
      Renderer.renderGenerationGraph(this.generationCanvas, frame);
    }

    // 2. Tile Inspector Card
    if (this.selectedTile && frame && frame.selectedTile) {
      const info = frame.selectedTile;
      document.getElementById('tile-coords').textContent = `${info.x}, ${info.y}`;
      document.getElementById('tile-biome').textContent = (info.biome || '').replace(/_/g, ' ');
      document.getElementById('tile-elevation').textContent = `${((info.elevation || 0) * 100).toFixed(0)}%`;
      document.getElementById('tile-water').textContent = `${((info.water || 0) * 100).toFixed(0)}%`;
      document.getElementById('tile-moisture').textContent = `${((info.moisture || 0) * 100).toFixed(0)}%`;
      document.getElementById('tile-biomass').textContent = `${((info.biomass || 0) * 100).toFixed(0)}%`;
      document.getElementById('tile-trample').textContent = `${((info.trample || 0) * 100).toFixed(0)}%`;
      document.getElementById('tile-scent').textContent = `${((info.scent || 0) * 100).toFixed(0)}%`;
    }

    // 3. Agent Inspector Card
    const emptyMsg = document.getElementById('agent-empty-msg');
    const details = document.getElementById('agent-details');
    const agentBadge = document.getElementById('agent-id');

    if (this.selectedAgentId !== null) {
      const agent = frame && frame.selectedAgent ? frame.selectedAgent : null;

      if (agent) {
        emptyMsg?.classList.add('hidden');
        details?.classList.remove('hidden');

        if (agentBadge) agentBadge.textContent = `#${agent.id}`;
        const speciesEl = document.getElementById('agent-species');
        if (speciesEl) speciesEl.textContent = agent.isImmigrant ? `Immigrant (Island ${agent.originIsland + 1})` : `Native Island ${this.islandManager.activeIslandIndex + 1}`;

        const originEl = document.getElementById('agent-origin');
        if (originEl) originEl.textContent = agent.isImmigrant ? `Island ${agent.originIsland + 1} Pioneer` : `Island ${this.islandManager.activeIslandIndex + 1}`;

        const genEl = document.getElementById('agent-gen');
        if (genEl) genEl.textContent = `Gen ${agent.generation}`;

        const ageEl = document.getElementById('agent-age');
        if (ageEl) ageEl.textContent = `${agent.age} / ${CONFIG.MAX_AGE}`;

        const posEl = document.getElementById('agent-pos');
        if (posEl) posEl.textContent = `(${agent.x}, ${agent.y})`;

        const actionEl = document.getElementById('agent-action');
        if (actionEl) actionEl.textContent = ACTION_NAMES[agent.lastAction] || 'Active';

        const energyPct = Math.max(0, Math.min(100, (agent.energy / CONFIG.MAX_ENERGY) * 100));
        const energyVal = document.getElementById('agent-energy-val');
        if (energyVal) energyVal.textContent = `${Math.round(agent.energy)} / ${CONFIG.MAX_ENERGY}`;
        const energyBar = document.getElementById('agent-energy-bar');
        if (energyBar) energyBar.style.width = `${energyPct}%`;

        // Render live RNN activations in miniature brain graph
        if (this.brainCanvas && agent.brain) {
          Renderer.renderBrain(this.brainCanvas, agent);
        }
      } else {
        if (agentBadge) agentBadge.textContent = `#${this.selectedAgentId} (Deceased)`;
        const actionEl = document.getElementById('agent-action');
        if (actionEl) actionEl.textContent = 'Decomposed';
      }
    } else {
      emptyMsg?.classList.remove('hidden');
      details?.classList.add('hidden');
      if (agentBadge) agentBadge.textContent = 'None';
    }
  }

  updateIslandBarUI() {
    if (!this.islandManager) return;
    const activeIdx = this.islandManager.activeIslandIndex;
    const telemetry = this.islandManager.telemetry;

    // Update dynamic island buttons
    for (const id of this.islandManager.islandIds) {
      const btn = document.querySelector(`.btn-island[data-island="${id}"]`);
      const isIrradiated = this.islandManager.isIslandIrradiated(id);
      if (btn) {
        btn.classList.toggle('active', id === activeIdx);
        btn.classList.toggle('irradiated', isIrradiated);
        const icon = btn.querySelector('.island-icon');
        if (icon) {
          icon.textContent = isIrradiated ? '☢️' : '🏝️';
        }
      }
      const badge = document.getElementById(`badge-island-${id}`);
      if (badge && telemetry[id]) {
        const t = telemetry[id];
        badge.textContent = `Gen ${t.maxGen || 1} • ${t.population || 0}`;
      }
    }

    // Update combined TPS
    const combinedTps = this.islandManager.getCombinedTps();
    const combinedTpsEl = document.getElementById('stat-combined-tps');
    if (combinedTpsEl) {
      combinedTpsEl.textContent = `${combinedTps.toLocaleString()} TPS`;
    }

    // Update migration countdown & badge
    const activeTick = telemetry[activeIdx]?.tick || 0;
    const interval = this.islandManager.migrationInterval;
    const remaining = Math.max(0, interval - (activeTick - this.islandManager.lastMigrationTick));
    const timerText = document.getElementById('migration-timer-text');
    if (timerText) {
      timerText.textContent = `Next: ${remaining}t (Ep ${this.islandManager.migrationEpoch})`;
    }
  }

  updateMultiIslandCard() {
    if (!this.islandManager) return;
    const activeIdx = this.islandManager.activeIslandIndex;
    const telemetry = this.islandManager.telemetry;

    const activeNameEl = document.getElementById('multi-active-island-name');
    if (activeNameEl) activeNameEl.textContent = `Island ${activeIdx + 1}`;

    const activeBadge = document.getElementById('multi-island-tps-badge');
    if (activeBadge) activeBadge.textContent = `Active: Island ${activeIdx + 1}`;

    const combinedTpsEl = document.getElementById('multi-combined-tps');
    if (combinedTpsEl) {
      combinedTpsEl.textContent = `${this.islandManager.getCombinedTps().toLocaleString()} TPS`;
    }

    const epochEl = document.getElementById('multi-migration-epoch');
    if (epochEl) epochEl.textContent = `Epoch ${this.islandManager.migrationEpoch}`;

    const totalMigrantsEl = document.getElementById('multi-total-migrants');
    if (totalMigrantsEl) totalMigrantsEl.textContent = `${this.islandManager.totalMigrantsExchanged}`;

    // Update active island radiation lab status & toggle button
    const activeIsIrradiated = this.islandManager.isIslandIrradiated(activeIdx);
    const radStatusEl = document.getElementById('active-island-radiation-status');
    const radBtn = document.getElementById('btn-toggle-active-radiation');
    if (radStatusEl) {
      if (activeIsIrradiated) {
        radStatusEl.textContent = 'Active (4.0x ☢️)';
        radStatusEl.style.color = '#4ade80';
      } else {
        radStatusEl.textContent = 'Normal (1.0x)';
        radStatusEl.style.color = 'var(--text-muted)';
      }
    }
    if (radBtn) {
      radBtn.textContent = activeIsIrradiated ? 'Restore Normal' : '☢️ Mutate Lab';
      radBtn.classList.toggle('active', activeIsIrradiated);
      radBtn.title = activeIsIrradiated
        ? `Restore Island ${activeIdx + 1} to normal mutation rates`
        : `Activate Radiation & Extreme Mutation Mode (4.0x) on Island ${activeIdx + 1}`;
    }

    // Table rows for all islands managed by this node
    const tbody = document.getElementById('island-table-body');
    if (tbody) {
      let html = '';
      for (const id of this.islandManager.islandIds) {
        const t = telemetry[id] || {};
        const isActive = id === activeIdx;
        const isRad = this.islandManager.isIslandIrradiated(id);
        html += `
          <tr class="${isActive ? 'active-row' : ''} ${isRad ? 'irradiated-row' : ''}" data-island="${id}">
            <td>${isRad ? '☢️' : '🏝️'} ${id + 1}</td>
            <td>Gen ${t.maxGen || 1} <span style="color:var(--accent-warning);font-size:0.68rem;">(★${t.maxGenAllTime || 1})</span></td>
            <td>${(t.population || 0).toLocaleString()}</td>
            <td>${(t.tps || 0).toLocaleString()}</td>
            <td>${t.immigrantsReceived || 0}</td>
          </tr>
        `;
      }
      tbody.innerHTML = html;
    }
  }
}

// Start application when DOM is ready
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
