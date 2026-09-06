# Task 16: Neural Network Enhancement & Intelligent Foraging

## Status
`DONE`

---

## Goal
Upgrade the neural network architecture (expanded 37-input sensory vector, 24-neuron recurrent hidden state, self-motion heading inputs, long-range food raycasting, sexual crossover, and biological fitness selection) to produce active, intelligent foraging behavior and eliminate passive stagnation.

---

## Context
Inspection of long-running simulations (e.g. generation 3,382 at tick 2,022,044) revealed:
1. **Sensory Tunnel Vision**: Agents only perceived their 4 immediate orthogonal neighbors (distance 1). Any food 2 or more tiles away was invisible.
2. **"Couch Potato" Inactivity**: Movement was 3.6x more expensive than idling, while the reproduction threshold (135) exceeded average energy (64), so natural reproduction ceased and agents evolved to sit idle 35-40% of the time.
3. **Weight Saturation**: Point mutations without weight decay caused synaptic weights to saturate at the +/- 8.0 clamp boundaries.
4. **Spastic 1-Tile Oscillations**: Lack of self-motion memory (corollary discharge) caused agents to jitter back and forth between two tiles.
5. **Generational Metric Inflation**: `fitness = age + generation * 100` allowed low-viability mutants with high generation tags to permanently lock all elite archive slots.

---

## Files to Create / Modify
- `[NEW]` `tasks/TASK_16_neural_network_enhancement_and_intelligent_foraging.md` — Task document.
- `[MODIFY]` `tasks/README.md` — Register Task 16.
- `[MODIFY]` `js/config.js` — Update neural dimensions (37 inputs, 24 hidden) and rebalance metabolic constants.
- `[MODIFY]` `js/nn.js` — Weight decay, fresh reset mutation rate to avoid clamp saturation.
- `[MODIFY]` `js/agent.js` — 37-input sensory gathering (including 4-direction food raycasts and momentum vector), momentum energy adjustments, sexual crossover with nearby mates, and tracking biomass eaten and offspring count.
- `[MODIFY]` `js/simulation.js` — True Darwinian biological fitness formula in `recordPotentialElite`.

---

## Detailed Specification

### 1. `js/config.js`
```javascript
  // Agent Energetics
  INITIAL_ENERGY: 100,
  MAX_ENERGY: 250,
  REPRODUCTION_THRESHOLD: 115,  // Active foragers can naturally reproduce
  REPRODUCTION_SPLIT: 0.5,
  BASAL_METABOLIC_DRAIN: 0.20,  // Higher living cost punishes permanent idlers
  MOVE_ENERGY_BASE: 0.28,       // Cheaper locomotion rewards active exploration
  TERRAFORM_ENERGY_COST: 3.5,
  GRAZE_MAX_INTAKE: 20.0,
  MAX_AGE: 1800,

  // Neural Network Dimensions
  NN_INPUT_SIZE: 37,            // 29 base + 4 food raycasts + 4 momentum/heading
  NN_HIDDEN_SIZE: 24,           // Expanded recurrent capacity
  NN_OUTPUT_SIZE: 9,
  MUTATION_RATE_DEFAULT: 0.08,
```

### 2. `js/nn.js`
In `NeuralNet.mutate()`:
- Applied gentle weight decay (`arr[i] *= 0.995`) to prevent unbounded drift toward clamps.
- Added 5% Xavier re-initialization rate to break dead zones.

### 3. `js/agent.js`
- Attributes: `this.biomassEaten = 0;`, `this.offspringCount = 0;`, `this.lastMoveDir = -1;` (0=N, 1=S, 2=E, 3=W).
- Input Vector (37 elements):
  - `[0..3]`: Local Slope (N, S, E, W, dist=1)
  - `[4..7]`: Local Moisture (N, S, E, W, dist=1)
  - `[8..11]`: Immediate Biomass (N, S, E, W, dist=1)
  - `[12..15]`: Long-Range Food Raycasts (N, S, E, W, dist=2..4)
  - `[16..19]`: Local Trample (N, S, E, W)
  - `[20..23]`: Local Scent (N, S, E, W)
  - `[24..27]`: Neighbor Obstacles (N, S, E, W)
  - `[28]`: Current Biomass
  - `[29]`: Current Water
  - `[30]`: Energy Ratio
  - `[31]`: Age Ratio
  - `[32]`: Last Action Succeeded (1.0 or 0.0)
  - `[33..36]`: Momentum / Heading Vector (one-hot for last move direction)
- Softmax action sampling with $\tau = 0.5$ preventing zero-entropy loops.
- Momentum in `act()`:
  - Continuing in same direction: `moveCost *= 0.85`
  - Reversing 180°: `moveCost *= 1.30`
- Sexual Recombination:
  - In `checkReproduction()`, find adjacent mate within Manhattan distance 2; if found, use `NeuralNet.crossover(this.brain, mate.brain)`.

### 4. `js/simulation.js`
In `recordPotentialElite()`:
```javascript
const fitness = agent.age + (agent.biomassEaten * 25) + (agent.offspringCount * 300);
```

---

## Test Plan & Results
1. **Sensory Horizon Test**:
   - Food at distance 2 and 3 correctly detected by raycasts ($0.45$ and $0.28$).
2. **Momentum Test**:
   - Straight-line movement cost ($0.402$) significantly lower than 180° turnaround cost ($0.486$).
3. **Simulation 3,000-Tick Test**:
   - Population maintained stable active foraging.
   - Idle action ratio dropped from $35\%+$ down to **$7.1\%$**.
   - Grazing actions increased to $45\%+$ of all behaviors.
   - Top elite achieved fitness $3,523.5$ driven by high biomass consumption and reproduction.

---

## Acceptance Criteria
- [x] Neural input dimension is 37 and hidden size is 24.
- [x] Food raycasting provides sensory detection up to 4 tiles away.
- [x] Self-motion heading input prevents 1-tile amnesia and spastic jitter.
- [x] Sexual crossover is utilized during local reproduction.
- [x] Fitness score rewards food harvested and offspring produced rather than generation tag.
- [x] Active agents achieve natural reproduction without starvation stagnation.
