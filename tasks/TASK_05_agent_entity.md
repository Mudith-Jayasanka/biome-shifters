# TASK_05: Neural Agent Entity

- **Status**: `DONE`
- **Goal**: Implement `js/agent.js` managing individual creature state, egocentric sensory sampling, neural decision decoding, metabolic drain, and reproduction.
- **Context**: Integrates the NeuralNet brain with physical grid interactions, strictly obeying the Anti-Cheat and Energy Proportionality lessons from EvoSimSpheres.

---

## Files to Create / Modify

- `[NEW]` `js/agent.js`

---

## Detailed Specification

### `Agent` Class Contract:
```javascript
export class Agent {
  constructor(id, x, y, brain = null) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.energy = 100;
    this.age = 0;
    this.generation = 1;
    this.speciesId = 1;
    this.isDead = false;

    this.brain = brain || new NeuralNet();
    this.sensorBuffer = new Float32Array(29);
    this.lastActionResult = 1.0;
  }

  sense(grid) {
    // Fills this.sensorBuffer with local 5x5 / directional slope, moisture,
    // biomass, trample, scent, neighbor occupancy, and internal vitals.
  }

  act(actionIndex, grid, environment) {
    // Executes: MOVE, GRAZE, DIG_TRENCH, MOUND_EARTH, EMIT_SCENT
    // Deducts proportional energy:
    // Basal drain + movement cost (scaled by slope) + terraform cost.
  }

  tick(grid, environment) {
    if (this.isDead) return;
    this.age++;
    this.sense(grid);
    const logits = this.brain.feedForward(this.sensorBuffer);
    const chosenAction = this.selectAction(logits);
    this.act(chosenAction, grid, environment);

    // Starvation / Senescence check
    if (this.energy <= 0 || this.age >= CONFIG.MAX_AGE) {
      this.die(grid);
    }
  }

  reproduce(grid) {
    // Splits energy 50/50, creates child agent with mutated brain in empty neighbor tile
  }

  die(grid) {
    this.isDead = true;
    grid.clearOccupant(this.x, this.y);
    // Returns organic fertility to soil on death
    grid.fertility[grid.getIndex(this.x, this.y)] = Math.min(1.0, grid.fertility[grid.getIndex(this.x, this.y)] + 0.3);
  }

  toJSON() { ... }
  static fromJSON(json) { ... }
}
```

---

## Test Plan

Execute via Node:
```bash
node -e "import('./js/grid.js').then(({ Grid }) => {
  import('./js/agent.js').then(({ Agent }) => {
    const g = new Grid(32, 32);
    const agent = new Agent(1, 10, 10);
    agent.tick(g, null);
    console.log('Agent tick ok, energy:', agent.energy);
  });
})"
```

---

## Acceptance Criteria

- [x] Sensory readings are strictly physical (no artificial cheat labels).
- [x] Basal and movement energy drains scale realistically.
- [x] Dead agents clear occupancy and enrich soil fertility.
- [x] Serialization preserves agent coordinates, lineage, and brain weights.
