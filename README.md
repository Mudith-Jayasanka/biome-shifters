# Biome Shifters 🌍🧠

**Biome Shifters** is an artificial life and ecological simulation where neural network-controlled creatures inhabit a dynamic, cellular landscape. Through their collective behavior—grazing, trampling paths, diverting water flows, and spreading seeds—the agents reshape their environment, while the shifting biomes in turn drive biological evolution.

---

## 🌟 Core Concepts

1. **Layered Dynamic Grid**:
   - The world is not a static backdrop. Each cell contains multiple continuous physical layers: **Elevation**, **Water Flow**, **Soil Moisture**, **Biomass (Vegetation)**, **Soil Compaction (Trampled Trails)**, and **Chemical Scent (Pheromones)**.
   - Environmental Cellular Automata (CA) simulate hydrology (water flowing downhill), moisture diffusion, and logistic plant growth.

2. **Recurrent Neural Network Brains**:
   - Each agent is driven by an evolvable Recurrent Neural Network (RNN) with persistent hidden state memory.
   - Agents perceive an egocentric $5 \times 5$ sensory patch of their surroundings (topography, moisture, vegetation, scent, and neighbors) plus their internal vitals.

3. **Ecosystem & Environmental Engineering**:
   - **Foraging & Overgrazing**: Herbivores consume biomass. Overgrazing strips topsoil and causes localized desertification, forcing migrations.
   - **Trampling & Beaten Paths**: Heavy traffic compacts soil into barren dirt trails, creating emergent highway networks.
   - **Terraforming Actions**: Agents can dig trenches to redirect water or bank earth, turning arid wastelands into irrigated garden sanctuaries.

4. **Emergent Phenomena**:
   - Emergence of migratory corridors following river basins.
   - Boom-and-bust ecological cycles between vegetation bloom and population explosion.
   - Territorial scent zoning and clan boundaries.
   - Symbiotic or predatory behavioral divergence.

---

## 🚀 Quick Start

Start the lightweight Python server (no external dependencies required):

```bash
python3 server.py 8080
```

Open your browser and navigate to:
```
http://localhost:8080
```

---

## 🏛️ Project Architecture

```
Biome Shifters/
├── AGENTS.md                 # Agent guidelines, mandatory task protocol & EvoSimSpheres lessons
├── README.md                 # Project introduction and user guide
├── server.py                 # Dependency-free Python 3 HTTP server + REST save API
├── index.html                # Main application UI and canvas container
├── style.css                 # Dark-mode styling, heads-up display, and inspector layout
├── saves/                    # Simulation snapshot files (.json)
├── docs/                     # Technical specifications and design documents
│   ├── ARCHITECTURE.md       # High-level architecture & pipeline design
│   ├── SPECIFICATION.md      # Mathematical models, tensor shapes & constants
│   └── LESSONS_LEARNED.md    # Principles and anti-cheat lessons from EvoSimSpheres
├── tasks/                    # Task registration protocol & phased roadmap
│   ├── README.md             # Master task dependency chain and status table
│   ├── TASK_01_project_scaffolding.md
│   ├── TASK_02_grid_world_layers.md
│   ├── TASK_03_recurrent_neural_network.md
│   ├── TASK_04_environmental_ca.md
│   ├── TASK_05_agent_entity.md
│   ├── TASK_06_simulation_core.md
│   ├── TASK_07_canvas_renderer.md
│   └── TASK_08_main_loop_and_ui.md
└── js/                       # Core ES6 modules (Worker-ready, DOM-independent core)
    ├── grid.js               # Multi-layered TypedArray world grid
    ├── environment.js        # Cellular automata hydrology and flora dynamics
    ├── nn.js                 # Recurrent Neural Network (Float32Array + carry state)
    ├── agent.js              # Agent biology, perception, actions, and metabolic drain
    ├── simulation.js         # World tick coordinator, lifecycle, and serialization
    ├── renderer.js           # Multi-channel canvas visualizer and heatmaps
    ├── storage.js            # REST API client for server save/load
    └── main.js               # App entrypoint, game loop, turbo pump, and UI binding
```

---

## 🛠️ Development Protocol

All AI agents working on this project must strictly adhere to the mandatory protocols defined in [AGENTS.md](file:///home/mudith/Documents/_Projects/other/Simulations%20and%20Neural%20Netoworks/Biome%20Shifters/AGENTS.md).
