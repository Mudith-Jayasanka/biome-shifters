# TASK_02: Flat TypedArray Grid World

- **Status**: `TODO`
- **Goal**: Implement `js/grid.js` managing multi-layer continuous and discrete world data using flat 1D TypedArrays.
- **Context**: High-performance foundation for environmental cellular automata and agent navigation, incorporating the zero-allocation lesson from EvoSimSpheres.

---

## Files to Create / Modify

- `[NEW]` `js/grid.js`

---

## Detailed Specification

### `Grid` Class Contract:
```javascript
export class Grid {
  constructor(width = 128, height = 128) {
    this.width = width;
    this.height = height;
    this.size = width * height;

    // Continuous physical layers (Float32Array)
    this.elevation = new Float32Array(this.size);
    this.water = new Float32Array(this.size);
    this.moisture = new Float32Array(this.size);
    this.fertility = new Float32Array(this.size);
    this.biomass = new Float32Array(this.size);
    this.trample = new Float32Array(this.size);
    this.scent = new Float32Array(this.size);

    // Discrete occupancy layer (Int32Array: agent ID or -1)
    this.occupancy = new Int32Array(this.size).fill(-1);
  }

  getIndex(x, y) { ... }
  inBounds(x, y) { ... }

  // Safe clamping or wrapping coordinates
  clampX(x) { ... }
  clampY(y) { ... }

  // Layer Getters & Setters with boundary protection
  getElevation(x, y) { ... }
  setElevation(x, y, val) { ... }
  getWater(x, y) { ... }
  setWater(x, y, val) { ... }
  getMoisture(x, y) { ... }
  setMoisture(x, y, val) { ... }
  getBiomass(x, y) { ... }
  setBiomass(x, y, val) { ... }
  getTrample(x, y) { ... }
  addTrample(x, y, delta) { ... }

  // Occupancy management
  getOccupant(x, y) { ... }
  setOccupant(x, y, agentId) { ... }
  clearOccupant(x, y) { ... }

  // Procedural World Generation
  generateTerrain(seed) { ... } // Simplex/Perlin noise or fractal diamond-square

  // Serialization (Day 1 discipline)
  toJSON() { ... }
  static fromJSON(data) { ... }
}
```

---

## Test Plan

Execute via Node:
```bash
node -e "import('./js/grid.js').then(({ Grid }) => { const g = new Grid(64, 64); g.generateTerrain(); console.log('Grid init ok, size:', g.size); })"
```

---

## Acceptance Criteria

- [ ] All layers are backed by flat 1D `Float32Array` or `Int32Array`.
- [ ] Safe coordinate indexing prevents out-of-bounds array access.
- [ ] `generateTerrain()` creates realistic natural heightmaps with valleys and plateaus.
- [ ] `toJSON()` and `fromJSON()` serialize and restore all grid layers faithfully.
