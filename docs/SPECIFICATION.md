# Technical Specification & Mathematical Models — Biome Shifters

This document specifies the exact data types, mathematical formulas, tensor dimensions, and protocol contracts for **Biome Shifters**.

---

## 1. World Dimensions & Constants

```javascript
export const CONFIG = {
  // Grid Dimensions
  GRID_WIDTH: 128,
  GRID_HEIGHT: 128,
  CELL_SIZE_PX: 6,           // Render pixel size per cell at 1x zoom

  // Hydrology & Moisture CA
  WATER_FLOW_RATE: 0.25,     // Fraction of water transferred downhill per tick
  WATER_EVAP_RATE: 0.002,    // Fraction of standing water evaporated per tick
  RAIN_PROBABILITY: 0.04,    // Chance per tick of rain deposit in random patch
  RAIN_INTENSITY: 0.35,      // Volume of water deposited by rain
  SOIL_INFILTRATION: 0.08,   // Surface water converting into subsurface moisture
  MOISTURE_DIFFUSION: 0.05,  // Lateral soil moisture diffusion rate
  MOISTURE_DRYING: 0.003,    // Baseline drying rate of soil

  // Vegetation (Biomass) CA
  BIOMASS_GROWTH_RATE: 0.02, // Base logistic growth rate r
  BIOMASS_MAX: 1.0,          // Carrying capacity K
  BIOMASS_SPREAD_CHANCE: 0.008,// Probability of seed colonizing adjacent fertile tile
  TRAMPLE_RESISTANCE: 0.7,   // How much biomass mitigates trampling compaction

  // Soil Trampling & Trails
  TRAMPLE_DEPOSIT: 0.25,     // Compaction added per agent step
  TRAMPLE_DECAY: 0.0015,     // Rate at which nature reclaims trampled trails

  // Pheromones / Scent
  SCENT_DEPOSIT: 1.0,
  SCENT_EVAPORATION: 0.02,
  SCENT_DIFFUSION: 0.04,

  // Agent Energetics
  INITIAL_ENERGY: 100,
  MAX_ENERGY: 250,
  REPRODUCTION_THRESHOLD: 160,
  REPRODUCTION_SPLIT: 0.5,   // Parent gives 50% energy to child
  BASAL_METABOLIC_DRAIN: 0.15,
  MOVE_ENERGY_BASE: 0.4,
  TERRAFORM_ENERGY_COST: 3.5,
  GRAZE_MAX_INTAKE: 15.0,    // Max energy extracted from 1.0 biomass
  MAX_AGE: 1800,             // Max lifespan in ticks

  // Population Floors
  INITIAL_POPULATION: 80,
  MIN_POPULATION_FLOOR: 20
};
```

---

## 2. Whittaker Biome Classification Matrix

Every grid cell $(x, y)$ is classified dynamically into a visual biome based on its `elevation`, `water`, `moisture`, and `biomass`:

```javascript
export function classifyBiome(elevation, water, moisture, biomass) {
  if (water > 0.15) {
    return water > 0.6 ? 'DEEP_WATER' : 'SHALLOW_WATER';
  }
  if (elevation > 0.82) {
    return 'MOUNTAIN_PEAK';
  }
  if (elevation > 0.65) {
    return moisture > 0.4 ? 'PINE_FOREST' : 'ROCKY_HIGHLAND';
  }
  if (moisture < 0.2) {
    return 'ARID_DESERT';
  }
  if (moisture < 0.45) {
    return biomass > 0.4 ? 'SAVANNA' : 'SHRUBLAND';
  }
  if (moisture < 0.75) {
    return biomass > 0.5 ? 'TEMPERATE_FOREST' : 'GRASSLAND';
  }
  return biomass > 0.6 ? 'TROPICAL_RAINFOREST' : 'WETLAND_SWAMP';
}
```

---

## 3. Neural Network Tensor Dimensions

### 3.1 Input Vector ($N_{in} = 29$)

The input vector passed to `NeuralNet.feedForward()` consists of 29 normalized `Float32` values:

| Index Range | Channel | Description |
| :--- | :--- | :--- |
| `[0..3]` | Local Slope | Elevation differences to North, South, East, West neighbors. |
| `[4..7]` | Local Moisture | Moisture levels at North, South, East, West neighbors. |
| `[8..11]` | Local Biomass | Plant biomass at North, South, East, West neighbors. |
| `[12..15]` | Local Trample | Trail compaction at North, South, East, West neighbors. |
| `[16..19]` | Local Scent | Pheromone density at North, South, East, West neighbors. |
| `[20..23]` | Neighbor Occupancy | `1.0` if neighbor tile contains an agent, else `0.0`. |
| `24` | Current Tile Biomass | Normalized biomass at current location ($[0.0, 1.0]$). |
| `25` | Current Tile Water | Surface water depth at current location ($[0.0, 1.0]$). |
| `26` | Agent Energy Ratio | $E / E_{max}$ ($[0.0, 1.0]$). |
| `27` | Agent Age Ratio | $\text{age} / \text{maxAge}$ ($[0.0, 1.0]$). |
| `28` | Last Action Result | `1.0` if last action succeeded (e.g. food eaten), `0.0` if blocked. |

### 3.2 Hidden Recurrent Layer ($N_{hidden} = 16$)
- Hidden state vector $H_t \in [-1.0, 1.0]^{16}$ with $\tanh$ activation.
- Recurrent matrix $W_{rec} \in \mathbb{R}^{16 \times 16}$ feeds $H_{t-1}$ into $H_t$:
  $$H_t = \tanh(W_{in} \cdot X_t + W_{rec} \cdot H_{t-1} + B_{hidden})$$

### 3.3 Output Vector ($N_{out} = 9$)
- Logits corresponding to the 9 discrete actions:
  - `0`: `IDLE` (rest, minimal metabolic drain)
  - `1`: `MOVE_NORTH`
  - `2`: `MOVE_SOUTH`
  - `3`: `MOVE_EAST`
  - `4`: `MOVE_WEST`
  - `5`: `GRAZE` (eat biomass)
  - `6`: `DIG_TRENCH` (lower elevation by $\Delta e = 0.05$)
  - `7`: `MOUND_EARTH` (raise elevation by $\Delta e = 0.05$)
  - `8`: `EMIT_SCENT` (deposit pheromone mark)

---

## 4. State Serialization Schemas (JSON)

### 4.1 NeuralNet State:
```json
{
  "inputSize": 29,
  "hiddenSize": 16,
  "outputSize": 9,
  "weightsInput": [ ... ],
  "weightsRecurrent": [ ... ],
  "weightsOutput": [ ... ],
  "biasesHidden": [ ... ],
  "biasesOutput": [ ... ]
}
```

### 4.2 Agent State:
```json
{
  "id": 142,
  "x": 45,
  "y": 62,
  "energy": 128.4,
  "age": 310,
  "generation": 4,
  "species": "lineage_alpha",
  "color": "#4caf50",
  "brain": { ... }
}
```

### 4.3 Simulation State Snapshot:
```json
{
  "version": 1,
  "name": "save_20260905_biome_clash",
  "timestamp": "2026-09-05T22:30:00.000Z",
  "tick": 4520,
  "grid": {
    "width": 128,
    "height": 128,
    "elevation": [ ... ],
    "water": [ ... ],
    "moisture": [ ... ],
    "biomass": [ ... ],
    "trample": [ ... ],
    "fertility": [ ... ]
  },
  "agents": [ ... ],
  "stats": {
    "totalBiomass": 4120.5,
    "avgEnergy": 114.2,
    "population": 85
  }
}
```
