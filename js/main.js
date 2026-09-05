/**
 * Biome Shifters — Application Entrypoint & Initial UI Wiring
 */

// Canvas & Viewport Setup
const canvas = document.getElementById('sim-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;

function resizeCanvas() {
  if (!canvas) return;
  const container = canvas.parentElement;
  if (!container) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = container.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  
  if (ctx) {
    ctx.resetTransform();
    ctx.scale(dpr, dpr);
    renderPlaceholder(rect.width, rect.height);
  }
}

function renderPlaceholder(width, height) {
  if (!ctx) return;
  ctx.fillStyle = '#0a0e14';
  ctx.fillRect(0, 0, width, height);

  // Subtle grid background placeholder
  ctx.strokeStyle = '#141d27';
  ctx.lineWidth = 1;
  const gridSize = 32;
  ctx.beginPath();
  for (let x = 0; x <= width; x += gridSize) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let y = 0; y <= height; y += gridSize) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();

  // Center banner
  ctx.fillStyle = '#3fb950';
  ctx.font = '600 18px "Outfit", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Biome Shifters World Ready', width / 2, height / 2 - 12);
  
  ctx.fillStyle = '#8b949e';
  ctx.font = '400 13px "JetBrains Mono", monospace';
  ctx.fillText('Awaiting Simulation Engine Startup (TASK_02 - TASK_06)', width / 2, height / 2 + 16);
}

// Initial resize and event binding
window.addEventListener('resize', resizeCanvas);
window.addEventListener('DOMContentLoaded', () => {
  resizeCanvas();
  setupUIHandlers();
});

// Basic UI event handlers for scaffolding verification
function setupUIHandlers() {
  // Play / Pause button toggle
  const btnPause = document.getElementById('btn-pause');
  const pauseIcon = document.getElementById('pause-icon');
  const pauseText = document.getElementById('pause-text');
  let isPaused = false;

  if (btnPause) {
    btnPause.addEventListener('click', () => {
      isPaused = !isPaused;
      if (pauseIcon) pauseIcon.textContent = isPaused ? '▶' : '⏸';
      if (pauseText) pauseText.textContent = isPaused ? 'Resume' : 'Pause';
      btnPause.classList.toggle('btn-primary', !isPaused);
      btnPause.classList.toggle('btn-secondary', isPaused);
    });
  }

  // Speed buttons active state toggling
  const speedButtons = document.querySelectorAll('.btn-speed');
  speedButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      speedButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Sidebar toggle
  const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
  const sidebar = document.getElementById('inspector-sidebar');
  if (btnToggleSidebar && sidebar) {
    btnToggleSidebar.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
      btnToggleSidebar.textContent = sidebar.classList.contains('collapsed') ? '▶' : '◀';
      resizeCanvas();
    });
  }

  // Save/Load Modal toggling
  const modalContainer = document.getElementById('modal-container');
  const btnLoadList = document.getElementById('btn-load-list');
  const modalBtnClose = document.getElementById('modal-btn-close');

  if (btnLoadList && modalContainer) {
    btnLoadList.addEventListener('click', () => {
      modalContainer.classList.remove('hidden');
    });
  }

  if (modalBtnClose && modalContainer) {
    modalBtnClose.addEventListener('click', () => {
      modalContainer.classList.add('hidden');
    });
  }

  if (modalContainer) {
    modalContainer.addEventListener('click', (e) => {
      if (e.target === modalContainer) {
        modalContainer.classList.add('hidden');
      }
    });
  }
}

// Immediate call if already loaded
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  resizeCanvas();
  setupUIHandlers();
}

