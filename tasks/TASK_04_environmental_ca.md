# TASK_04: Environmental Cellular Automata (Hydrology & Flora)

- **Status**: `TODO`
- **Goal**: Implement `js/environment.js` running cellular automata rules for water downhill flow, moisture diffusion, vegetation growth, and trail decay.
- **Context**: Turns the static grid into a living, responsive ecosystem.

---

## Files to Create / Modify

- `[NEW]` `js/environment.js`

---

## Detailed Specification

### `Environment` Class Contract:
```javascript
export class Environment {
  constructor(grid) {
    this.grid = grid;
    // Ping-pong buffers to prevent directional update bias
    this.waterBuffer = new Float32Array(grid.size);
    this.moistureBuffer = new Float32Array(grid.size);
    this.biomassBuffer = new Float32Array(grid.size);
  }

  tick() {
    this.simulateRainAndEvaporation();
    this.simulateHydrology();
    this.simulateMoistureDiffusion();
    this.simulateVegetationGrowth();
    this.simulateTrailDecay();
    this.simulatePheromoneDiffusion();
  }

  simulateHydrology() {
    // Water flows to lower elevation + water neighbors
  }

  simulateMoistureDiffusion() {
    // Soil moisture diffuses laterally and absorbs surface water
  }

  simulateVegetationGrowth() {
    // Logistic growth: r * biomass * (1 - biomass/K) * moisture * (1 - trample)
  }

  simulateTrailDecay() {
    // trample *= (1 - decay)
  }

  simulatePheromoneDiffusion() {
    // scent *= (1 - evap)
  }
}
```

---

## Test Plan

Execute via Node:
```bash
node -e "import('./js/grid.js').then(({ Grid }) => {
  import('./js/environment.js').then(({ Environment }) => {
    const g = new Grid(32, 32);
    g.generateTerrain();
    const env = new Environment(g);
    for (let i = 0; i < 50; i++) env.tick();
    console.log('Environment CA 50 ticks simulated successfully.');
  });
})"
```

---

## Acceptance Criteria

- [ ] Surface water realistically cascades down elevation slopes into depressions.
- [ ] Soil moisture increases near water bodies and diffuses laterally.
- [ ] Vegetation blooms where moisture is high and withers in arid/compacted soil.
- [ ] Ping-pong buffers eliminate directional propagation artifacts.
