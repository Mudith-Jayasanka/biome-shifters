# System Architecture — Biome Shifters

This document outlines the complete architectural design of **Biome Shifters**, detailing the data representations, execution pipelines, neural agent model, and visual renderer.

---

## 1. High-Level System Architecture

```
+---------------------------------------------------------------+
|                        Main Thread                            |
|                                                               |
|  +---------------------+           +-----------------------+  |
|  |   UI Controls       |           |   Canvas Renderer     |  |
|  | - Layer selector    |           | - Biome / Water /     |  |
|  | - Inspector panel   |           |   Biomass / Scent map |  |
|  | - Speed / Turbo     |           | - Agent sprites       |  |
|  | - Save / Load UI    |           | - Pan / Zoom camera   |  |
|  +----------+----------+           +-----------^-----------+  |
|             |                                  |              |
|             | Input Events           Snapshot  | 60 FPS       |
|             v                                  |              |
|  +---------------------------------------------+-----------+  |
|  |                 Simulation Engine                       |  |
|  |  (Runs on Main Thread OR offloaded to Web Worker)       |  |
|  |                                                         |  |
|  |  +-------------------+     +-------------------------+  |  |
|  |  |    Grid World     |     |   Environmental CA      |  |  |
|  |  | - Elevation       | <-> | - Water downhill flow   |  |  |
|  |  | - Moisture/Water  |     | - Moisture diffusion    |  |  |
|  |  | - Biomass/Flora   |     | - Biomass plant growth  |  |  |
|  |  | - Trample/Compaction|   | - Trail erosion decay   |  |  |
|  |  | - Scent trails    |     | - Scent evaporation     |  |  |
|  |  +---------+---------+     +-------------------------+  |  |
|  |            |                                            |  |
|  |            v                                            |  |
|  |  +-------------------+     +-------------------------+  |  |
|  |  |   Agent Manager   | --> |   Recurrent Brain (RNN) |  |  |
|  |  | - Sensory reading |     | - 5x5 sensory inputs    |  |  |
|  |  | - Action execution| <---|- Hidden carry memory   |  |  |
|  |  | - Metabolic drain |     | - Motor logits          |  |  |
|  |  | - Reproduction    |     +-------------------------+  |  |
|  |  +-------------------+                                  |  |
|  +---------------------------------------------------------+  |
+---------------------------------------------------------------+
```

---

## 2. Layered World Grid Representation

The simulation world is a 2D discrete grid of dimensions $W \times H$ (default $128 \times 128$, expandable to $256 \times 256$).
To guarantee maximum cache locality and zero GC overhead, the grid is stored as flat 1D `TypedArray` buffers:

```javascript
// Flat 1D index formula:
const index = y * width + x;
```

### Grid Layers:

| Layer Name | TypedArray Type | Value Range | Description |
| :--- | :--- | :--- | :--- |
| `elevation` | `Float32Array` | `[0.0, 1.0]` | Static or deformable topography (mountains, valleys, plains). |
| `water` | `Float32Array` | `[0.0, 1.0]` | Surface water depth (rivers, ponds, lakes, flooding). |
| `moisture` | `Float32Array` | `[0.0, 1.0]` | Soil saturation level, fed by adjacent water and rainfall. |
| `fertility` | `Float32Array` | `[0.0, 1.0]` | Soil quality, degraded by extreme drought or chronic overgrazing. |
| `biomass` | `Float32Array` | `[0.0, 1.0]` | Edible vegetation density (grass, shrubs, canopy). |
| `trample` | `Float32Array` | `[0.0, 1.0]` | Soil compaction from agent traffic; inhibits plant growth, creates roads. |
| `scent` | `Float32Array` | `[0.0, 1.0]` | Evaporating pheromone / chemical scent deposited by passing agents. |
| `occupancy` | `Int32Array` | `[-1, N]` | Agent ID currently standing on this tile (-1 if empty). |

---

## 3. Environmental Cellular Automata (CA) Engine

On every world tick, the environment updates through localized differential equations:

1. **Hydrological Flow (Surface Water)**:
   - Water flows to the lowest adjacent neighbor ($3 \times 3$ Moore neighborhood) proportional to the total height difference:
     $$\Delta h = (\text{elevation}_i + \text{water}_i) - (\text{elevation}_j + \text{water}_j)$$
   - Deep depressions collect water into standing lakes or reservoirs.

2. **Subsurface Moisture Infiltration**:
   - Surface water slowly absorbs into soil moisture:
     $$\text{moisture} \leftarrow \text{moisture} + k_{infiltrate} \cdot \text{water}$$
   - Moisture diffuses laterally into neighboring soil cells and slowly evaporates based on temperature/sunlight.

3. **Vegetation Growth (Logistic Differential Equation)**:
   - Plant biomass grows according to a logistic curve governed by moisture, fertility, and existing biomass seed:
     $$\frac{d(\text{biomass})}{dt} = r \cdot \text{biomass} \cdot \left(1 - \frac{\text{biomass}}{K}\right) \cdot \text{moisture} \cdot \text{fertility} \cdot (1 - \text{trample})$$
   - Adjacent barren tiles have a small probability of receiving seeds from neighboring high-biomass tiles.

4. **Soil Compaction & Trail Decay**:
   - Compaction decays over time as nature reclaims the soil:
     $$\text{trample} \leftarrow \text{trample} \cdot (1 - \delta_{decay})$$
   - High agent traffic maintains dirt paths; abandoned paths slowly re-vegetate.

5. **Pheromone Diffusion & Evaporation**:
   - Scent channels diffuse slightly and evaporate exponentially:
     $$\text{scent} \leftarrow \text{scent} \cdot (1 - \delta_{evap})$$

---

## 4. Neural Agent Architecture

### 4.1 Sensorimotor Perception Field

Agents possess an **egocentric $5 \times 5$ sensory field** centered on their current position (oriented relative to their facing direction or cardinal grid):

- **Grid Senses (25 values per channel, downsampled or kernel-sampled)**:
  - Local Topography Gradient (uphill vs downhill)
  - Local Moisture / Water proximity
  - Local Biomass density
  - Trampled trail presence
  - Scent / Pheromone intensity
  - Agent occupancy presence
- **Proprioceptive Vitals (Internal Sensors)**:
  - Current Energy reserve ratio ($E / E_{max}$)
  - Current Age ratio ($\text{age} / \text{maxAge}$)
  - Last executed action feedback (success/failure)
  - Recurrent hidden state activations from previous tick ($H_{t-1}$)

### 4.2 Brain: Recurrent Neural Network (RNN)

- **Weights**: `Float32Array` matrices.
- **Layers**:
  - Input Layer $\to$ Hidden Layer ($16$ to $24$ neurons, $\tanh$ activation).
  - Recurrent Connection ($H_{t-1} \to H_t$ carry over).
  - Hidden Layer $\to$ Output Logits ($8$ to $10$ actions).

### 4.3 Action Space

The agent evaluates output logits via argmax or softmax sampling:
1. `MOVE_NORTH`
2. `MOVE_SOUTH`
3. `MOVE_EAST`
4. `MOVE_WEST`
5. `GRAZE`: Consume biomass on current tile to replenish energy.
6. `TERRAFORM_DIG`: Excavate soil (lowers elevation, creates trench to direct water).
7. `TERRAFORM_MOUND`: Deposit soil (raises elevation, builds dam/barrier).
8. `SEED`: Spend energy to plant biomass seeds on current fertile tile.
9. `SCENT_EMIT`: Deposit pheromone marker on current tile.
10. `REPRODUCE`: If energy $\ge E_{repro}$ and adjacent tile is empty, produce mutated offspring.

---

## 5. Evolutionary & Ecological Dynamics

1. **Metabolic Balance**:
   - Basal drain: $-0.2$ energy per tick.
   - Movement: $-0.5 \times (1 + \Delta \text{elevation})$ energy (moving uphill costs more).
   - Terraforming: $-2.5$ energy (high cost prevents frivolous earth-moving).
   - Starvation: If $E \le 0$, agent dies and decomposes, returning a burst of fertility to the tile.

2. **Reproduction & Inheritance**:
   - Asexual or Sexual Crossover:
     - Offspring inherits neural weights with Gaussian perturbation:
       $$w_{child} = w_{parent} + \mathcal{N}(0, \sigma_{mut})$$
     - Parent gives $50\%$ of its current energy to the offspring.
   - Evolvable traits: Mutation rate $\sigma_{mut}$, preferred grazing speed, body size.

3. **Extinction Recovery**:
   - If population falls below safety floor ($N_{min} = 15$), top historical elite brains are reseeded into the most fertile quadrants of the world.

---

## 6. Rendering & Visualization Architecture

The Canvas Renderer (`js/renderer.js`) supports full camera pan/zoom and instant layer switching:
- **Biome View**: Whittaker-style ecological rendering (Water, Beach/Sand, Savannah, Grassland, Dense Rainforest, Arid Scrub, Rocky Mountain).
- **Elevation Heatmap**: Topographic contour lines and grayscale heightmap.
- **Hydrology & Moisture**: Deep blue water currents and turquoise moisture saturation.
- **Biomass Heatmap**: Vibrant green vegetation canopy.
- **Roads & Highway Map**: Warm terracotta/dirt trails etched by agent foot traffic.
- **Pheromone / Scent Trails**: Neon ultraviolet/cyan chemical trails.
- **Agent Inspector**: Real-time neural activation graph, energy gauge, lineage tree, and sensory patch visualization.
