# TASK_07: Multi-Layer Canvas Renderer

- **Status**: `DONE`
- **Goal**: Implement `js/renderer.js` to render the layered grid world and agents with camera pan/zoom and multi-channel layer switching.
- **Context**: High-performance visual presentation layer decoupled from the simulation physics tick.

---

## Files to Create / Modify

- `[NEW]` `js/renderer.js`

---

## Detailed Specification

### `Renderer` Class Contract:
```javascript
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.activeLayer = 'BIOME'; // 'BIOME', 'ELEVATION', 'WATER', 'BIOMASS', 'TRAILS', 'SCENT'

    // Camera viewport
    this.camera = {
      x: 0,
      y: 0,
      zoom: 1.0,
      isDragging: false
    };

    // Offscreen ImageData for fast direct pixel manipulation
    this.imageBuffer = null;
  }

  render(simulation, selectedAgentId = null) {
    // 1. Clear screen
    // 2. Render active grid layer (using direct ImageData pixel buffers for maximum speed)
    // 3. Render agent sprites / directional triangles
    // 4. Highlight inspected agent or tile
  }

  setLayer(layerName) { ... }
  screenToWorld(screenX, screenY) { ... }
  worldToScreen(worldX, worldY) { ... }
}
```

---

## Test Plan

1. Open `http://localhost:8080` in browser.
2. Verify that clicking layer dropdown switches rendering mode smoothly.
3. Test mouse drag pan and wheel zoom.

---

## Acceptance Criteria

- [x] 60 FPS rendering using direct pixel buffer rendering.
- [x] Layer modes render correct visual palettes (Biome, Topography, Water, Biomass, Trails, Scent).
- [x] Smooth mouse drag panning and wheel zooming.
