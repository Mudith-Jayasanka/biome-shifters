# Task 45: Caloric Seed Sowing & Agricultural Feedback Loop

## Status
`TODO`

---

## Goal
Equip agents with an active seed sowing capability (`ACTIONS.SOW_SEEDS`, expanding action outputs from 9 to 10) requiring caloric investment (2.5 energy) that successfully germinates flora only on moist, fertile, untrampled soil, completing the emergent agricultural loop without artificial cheats.

---

## Context
Currently, vegetation regrowth is purely passive: if agents overgraze a valley down to $0$ biomass, seed spread relies on slow, random cellular diffusion.
By giving agents the ability to biologically invest calories into planting seeds (`ACTIONS.SOW_SEEDS`), agents can actively cultivate the land.
To uphold **Golden Lesson #1 (Anti-Cheat & Physical Fairness)** and **Golden Lesson #3 (Strict Metabolic Proportionality)**:
1. Sowing costs energy (conservation of mass and energy).
2. Seeds deposited on dry or trampled soil die and waste the agent's calories (`lastActionResult = 0.0`).
3. Seeds deposited on moist, fertile banks ($moisture \ge 0.30$, $trample < 0.45$) take root as a fresh sapling ($biomass = 0.20$), which then grows into lush food via natural logistic CA.

This creates the full evolutionary synergy: **Dig Trench $\to$ Collect Roots $\to$ Collect Water/Moisture in Trench $\to$ Sow Seeds on Moist Trench Banks $\to$ Graze Lush Harvest**.

---

## Files to Create / Modify
- `[NEW]` `tasks/TASK_45_caloric_seed_sowing_and_agricultural_action.md` — Task specification document.
- `[MODIFY]` `tasks/README.md` — Register Task 45.
- `[MODIFY]` `js/config.js` — Update `NN_OUTPUT_SIZE` (10), add `ACTIONS.SOW_SEEDS: 9`, `SEED_SOW_COST: 2.5`, `SEED_GERM_MIN_MOISTURE: 0.30`, `SEED_GERM_BIOMASS: 0.20`.
- `[MODIFY]` `js/nn.js` — Update default output size to 10; implement backward-compatible weight expansion in `NeuralNet.fromJSON` so 9-output saves load seamlessly.
- `[MODIFY]` `js/agent.js` — Implement `ACTIONS.SOW_SEEDS` in `act()`, tracking `seedsSown`.
- `[MODIFY]` `js/simulation.js` — Include `seedsSown` in agent serialization and fitness calculation (`+ a.seedsSown * 10`).
- `[MODIFY]` `js/renderer.js` / Inspector — Support 10 action labels in the neural inspector display.

---

## Detailed Specification

### 1. `js/config.js`
```javascript
  // Action Space & Agriculture
  NN_OUTPUT_SIZE: 10,                // Expanded to include SOW_SEEDS
  SEED_SOW_COST: 2.5,                // Caloric investment to deposit viable seeds
  SEED_GERM_MIN_MOISTURE: 0.30,      // Minimum soil moisture required for germination
  SEED_GERM_MAX_TRAMPLE: 0.45,       // High soil compaction crushes delicate seeds
  SEED_GERM_BIOMASS: 0.20,           // Initial sapling biomass created on successful germination

export const ACTIONS = {
  IDLE: 0,
  MOVE_NORTH: 1,
  MOVE_SOUTH: 2,
  MOVE_EAST: 3,
  MOVE_WEST: 4,
  GRAZE: 5,
  DIG_TRENCH: 6,
  MOUND_EARTH: 7,
  EMIT_SCENT: 8,
  SOW_SEEDS: 9
};
```

### 2. `js/nn.js` (Backward Compatibility)
In `NeuralNet.fromJSON(json)`:
```javascript
  static fromJSON(json) {
    const targetOut = CONFIG.NN_OUTPUT_SIZE || 10;
    const net = new NeuralNet(json.inputSize, json.hiddenSize, targetOut);
    
    net.weightsInput.set(json.weightsInput);
    net.weightsRecurrent.set(json.weightsRecurrent);
    net.biasesHidden.set(json.biasesHidden);

    // If loading legacy save with 9 outputs, copy existing outputs and randomize 10th
    if (json.outputSize === 9 && targetOut === 10) {
      const hSize = json.hiddenSize;
      for (let h = 0; h < hSize; h++) {
        for (let o = 0; o < 9; o++) {
          net.weightsOutput[h * 10 + o] = json.weightsOutput[h * 9 + o];
        }
        // Action 9 (SOW_SEEDS) starts with gentle exploratory weight
        net.weightsOutput[h * 10 + 9] = (Math.random() * 2 - 1) * 0.1;
      }
      for (let o = 0; o < 9; o++) {
        net.biasesOutput[o] = json.biasesOutput[o];
      }
      net.biasesOutput[9] = -0.5; // Slight initial inhibitory bias
    } else {
      net.weightsOutput.set(json.weightsOutput);
      net.biasesOutput.set(json.biasesOutput);
    }

    return net;
  }
```

### 3. `js/agent.js`
In `Agent.prototype.act()` under `ACTIONS.SOW_SEEDS`:
```javascript
  case ACTIONS.SOW_SEEDS: {
    this.energy -= CONFIG.SEED_SOW_COST;
    const moist = grid.getMoisture(this.x, this.y);
    const fert = grid.getFertility(this.x, this.y);
    const trample = grid.getTrample(this.x, this.y);
    const curBio = grid.getBiomass(this.x, this.y);

    // Strict physical conditions: seeds require moisture, uncompacted soil, and barren space
    if (
      moist >= CONFIG.SEED_GERM_MIN_MOISTURE &&
      fert > 0.20 &&
      trample <= CONFIG.SEED_GERM_MAX_TRAMPLE &&
      curBio < 0.15 &&
      !grid.isCoastal(this.x, this.y)
    ) {
      grid.setBiomass(this.x, this.y, CONFIG.SEED_GERM_BIOMASS);
      this.seedsSown = (this.seedsSown || 0) + 1;
      success = 1.0;
    } else {
      success = 0.0; // Seeds withered or trampled
    }
    break;
  }
```

---

## Test Plan
1. **Backward-Compatibility Loading Test**:
   - Run a Node.js script loading `saves/multi_island_tick_5566691_test.json`.
   - Verify all 8 islands and 870 agents successfully load and upgrade from 9 to 10 outputs without error.
2. **Seed Germination Test**:
   - Place an agent on dry soil ($m = 0.10$). Execute `SOW_SEEDS`: verify `success === 0.0`, energy reduced by 2.5, biomass unchanged.
   - Place an agent on moist soil ($m = 0.40, t = 0.10$). Execute `SOW_SEEDS`: verify `success === 1.0`, biomass becomes $0.20$.
3. **CA Regrowth Synergy**:
   - Run 50 ticks of `environment.tick()` on the newly sown tile: verify logistic plant growth flourishes from $0.20 \to 1.0$.

---

## Acceptance Criteria
- [ ] `NN_OUTPUT_SIZE: 10` and `ACTIONS.SOW_SEEDS: 9` defined in `js/config.js`.
- [ ] `NeuralNet.fromJSON()` cleanly upgrades legacy 9-output saves to 10 outputs.
- [ ] Seed sowing strictly requires moisture ($m \ge 0.30$) and untrampled soil ($t \le 0.45$).
- [ ] Coastal perimeter rejects seed sowing.
- [ ] Agent action decoder and inspector UI render all 10 actions cleanly.
