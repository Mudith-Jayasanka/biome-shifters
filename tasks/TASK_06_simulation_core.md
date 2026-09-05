# TASK_06: Simulation Coordinator & World Loop

- **Status**: `DONE`
- **Goal**: Implement `js/simulation.js` managing world ticks, environmental updates, agent lifecycle coordination, population limits, elite tracking, and save/load serialization.
- **Context**: Core coordinator of the artificial life engine, completely headless and ready for Web Worker offloading.

---

## Files to Create / Modify

- `[NEW]` `js/simulation.js`

---

## Detailed Specification

### `Simulation` Class Contract:
```javascript
export class Simulation {
  constructor(config = {}) {
    this.tickCount = 0;
    this.grid = new Grid(config.width || 128, config.height || 128);
    this.environment = new Environment(this.grid);
    this.agents = [];
    this.nextAgentId = 1;

    this.eliteArchive = []; // Top historical performers for extinction recovery
    this.stats = {
      population: 0,
      totalBiomass: 0,
      avgEnergy: 0,
      generationMax: 1
    };
  }

  initWorld() {
    this.grid.generateTerrain();
    this.spawnInitialPopulation(CONFIG.INITIAL_POPULATION);
  }

  tick() {
    this.tickCount++;
    // 1. Update Environmental CA
    this.environment.tick();

    // 2. Update Agents
    for (let i = this.agents.length - 1; i >= 0; i--) {
      const agent = this.agents[i];
      agent.tick(this.grid, this.environment);
      if (agent.isDead) {
        this.agents.splice(i, 1);
      }
    }

    // 3. Handle Extinction Protection
    if (this.agents.length < CONFIG.MIN_POPULATION_FLOOR) {
      this.reseedFromElites();
    }

    // 4. Update World Telemetry
    this.updateStats();
  }

  toJSON() { ... }
  static fromJSON(data) { ... }
}
```

---

## Test Plan

Execute via Node:
```bash
node -e "import('./js/simulation.js').then(({ Simulation }) => {
  const sim = new Simulation();
  sim.initWorld();
  for (let i = 0; i < 100; i++) sim.tick();
  console.log('Simulation 100 ticks complete. Pop:', sim.agents.length);
})"
```

---

## Acceptance Criteria

- [x] Simulation coordinates environmental CA and agent lifecycles smoothly.
- [x] Dead agents are purged without memory leaks.
- [x] Extinction safety floor prevents total population death.
- [x] `toJSON()` produces a complete snapshot capable of exact reconstruction via `fromJSON()`.
