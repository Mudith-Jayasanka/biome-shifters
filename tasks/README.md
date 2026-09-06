# Biome Shifters — Task Roadmap & Dependency Chain

This document defines the sequential implementation plan for **Biome Shifters**.
Each task is designed to be **self-contained and functionally complete on its own**, producing testable code that can be verified before moving to the next task.

---

## 🗺️ Master Dependency Chain

```
Phase 1: Foundations & Grid CA
TASK_01 (UI Scaffolding)
   ↓
TASK_02 (Flat TypedArray Grid World)
   ↓
TASK_03 (Recurrent Neural Network with Hidden Carry)
   ↓
TASK_04 (Hydrology & Flora Cellular Automata)

Phase 2: Agent Mechanics & Simulation Core
TASK_05 (Neural Agent Perception & Actions)
   ↓
TASK_06 (Simulation Coordinator & Lifecycle)

Phase 3: Visuals, Controls & Inspector
TASK_07 (Multi-Layer Canvas Renderer & Biome Palette)
   ↓
TASK_08 (Main Loop, Turbo Execution & UI Inspector)
   ↓
TASK_09 (UI & CSS Fixes: HUD Overflow, Inspector Unhide & Neural Net Cropping)
   ↓
TASK_10 (Population Scaling, Higher Capacity & Interactive Controls)
   ↓
TASK_11 (Inspector Vertical Cropping & Flex Shrink Layout Fix)
   ↓
TASK_12 (Inspector World Telemetry & Generation Statistics Graphs)
   ↓
TASK_13 (Save/Load System & REST Integration)

Phase 4: Advanced Emergence & Terraforming
TASK_14 (Erosion, Trampled Trails & Highway Formation)
   ↓
TASK_15 (Terraforming Actions: Canals, Dams & Irrigation)
   ↓
TASK_16 (Pheromone Scent Gradients & Stigmergic Trails)

Phase 5: Evolutionary Genetics & Speciation
TASK_17 (Sexual Crossover & Evolvable Mutation Rates)
   ↓
TASK_18 (Elite Reseeding & Extinction Safety Floor)
   ↓
TASK_19 (Real-Time Population & Eco-System Telemetry Graphs)

Phase 6: Multi-Threading & Scale
TASK_20 (Web Worker Offloading: Headless sim.worker.js)
   ↓
TASK_21 (Multi-Island Parallelism & Biome Continental Drift)
```

---

## 📋 Task Catalog & Status

| Task | Title | Target Files | Status | Description |
| :--- | :--- | :--- | :--- | :--- |
| **01** | `TASK_01_project_scaffolding.md` | `index.html`, `style.css` | `DONE` | Dark-mode HUD layout, canvas container, sidebar controls, and inspector panel. |
| **02** | `TASK_02_grid_world_layers.md` | `js/grid.js` | `DONE` | Multi-layered 1D TypedArray grid (Elevation, Moisture, Biomass, Scent, Trample). |
| **03** | `TASK_03_recurrent_neural_network.md` | `js/nn.js` | `DONE` | Recurrent Neural Network brain with Float32Array weights, persistent carry state, and mutation. |
| **04** | `TASK_04_environmental_ca.md` | `js/environment.js` | `DONE` | Cellular Automata engine for water flow, moisture infiltration, and logistic plant growth. |
| **05** | `TASK_05_agent_entity.md` | `js/agent.js` | `DONE` | Agent entity with egocentric sensory perception, decision decoding, and metabolic drain. |
| **06** | `TASK_06_simulation_core.md` | `js/simulation.js` | `DONE` | Master world coordinator, step loop, agent reproduction, deaths, and serialization. |
| **07** | `TASK_07_canvas_renderer.md` | `js/renderer.js` | `DONE` | Canvas renderer with multi-layer visualization (Biomes, Elevation, Water, Biomass, Trails). |
| **08** | `TASK_08_main_loop_and_ui.md` | `js/main.js` | `DONE` | Game loop, turbo pump, speed controls, camera pan/zoom, and live agent inspector. |
| **09** | `TASK_09_ui_css_fixes.md` | `style.css`, `index.html`, `js/main.js` | `DONE` | HUD overflow prevention, inspector unhide toggle button, neural net graph fixes. |
| **10** | `TASK_10_population_scaling_and_capacity.md` | `js/config.js`, `js/simulation.js`, `index.html`, `style.css`, `js/main.js` | `DONE` | Scaled population capacity (800+), elevated floor (100), and HUD controls for parallel exploration. |
| **11** | `TASK_11_inspector_vertical_cropping_fix.md` | `style.css`, `index.html`, `js/main.js` | `DONE` | Prevent flex compression on inspector cards, fix range slider clipping, and ensure full uncropped scrolling. |
| **12** | `TASK_12_inspector_telemetry_and_generation_graphs.md` | `js/simulation.js`, `index.html`, `style.css`, `js/renderer.js`, `js/main.js` | `DONE` | Relocate HUD stats into inspector with live Population/Biomass and Generation distribution graphs. |
| **13** | `TASK_13_ecosystem_balance_and_generation_progression.md` | `js/config.js`, `js/environment.js`, `js/simulation.js`, `js/main.js` | `TODO` | Ecological balance (hydrology, flora dormancy), reproduction rebalance, and elite lineage preservation. |
| **13** | `TASK_13_ecosystem_balance_and_generation_progression.md` | `js/config.js`, `js/environment.js`, `js/simulation.js`, `js/main.js` | `DONE` | Ecological balance (hydrology, flora dormancy), reproduction rebalance, and elite lineage preservation. |
| **14** | `TASK_14_save_load_system.md` | `js/storage.js`, `js/main.js` | `TODO` | REST save/load client integrating with `server.py` and local disk storage in `saves/`. |
| **14** | `TASK_14_trampled_trails_and_highways.md` | `js/environment.js`, `js/agent.js` | `TODO` | Foot traffic soil compaction, dirt trails, and movement speed buffs on highways. |
| **15** | `TASK_15_terraforming_mechanics.md` | `js/agent.js`, `js/grid.js` | `TODO` | Active canal digging, dam building, and irrigation environmental modification. |
| **16** | `TASK_16_pheromone_stigmergy.md` | `js/grid.js`, `js/environment.js` | `TODO` | Scent deposition, diffusion, evaporation, and trail-following emergence. |
| **17** | `TASK_17_sexual_reproduction_crossover.md` | `js/nn.js`, `js/agent.js` | `TODO` | Genetic weight crossover, sexual mate selection, and evolvable mutation rates. |
| **18** | `TASK_18_extinction_safety_floor.md` | `js/simulation.js` | `TODO` | Top elite brain preservation and safety floor reseeding to avoid total collapses. |
| **19** | `TASK_19_ecosystem_telemetry_graphs.md` | `js/renderer.js`, `index.html` | `TODO` | Real-time graphs for population, biomass density, water level, and average neural speed. |
| **15** | `TASK_15_trampled_trails_and_highways.md` | `js/environment.js`, `js/agent.js` | `TODO` | Foot traffic soil compaction, dirt trails, and movement speed buffs on highways. |
| **16** | `TASK_16_terraforming_mechanics.md` | `js/agent.js`, `js/grid.js` | `TODO` | Active canal digging, dam building, and irrigation environmental modification. |
| **17** | `TASK_17_pheromone_stigmergy.md` | `js/grid.js`, `js/environment.js` | `TODO` | Scent deposition, diffusion, evaporation, and trail-following emergence. |
| **18** | `TASK_18_sexual_reproduction_crossover.md` | `js/nn.js`, `js/agent.js` | `TODO` | Genetic weight crossover, sexual mate selection, and evolvable mutation rates. |
| **19** | `TASK_19_extinction_safety_floor.md` | `js/simulation.js` | `TODO` | Top elite brain preservation and safety floor reseeding to avoid total collapses. |
| **20** | `TASK_20_ecosystem_telemetry_graphs.md` | `js/renderer.js`, `index.html` | `TODO` | Real-time graphs for population, biomass density, water level, and average neural speed. |
| **20** | `TASK_20_web_worker_core.md` | `js/workers/sim.worker.js` | `TODO` | Full headless simulation execution on a dedicated background Web Worker thread. |
| **21** | `TASK_21_multi_island_migration.md` | `js/workers/coordinator.js` | `TODO` | Multiple isolated continental biomes running in parallel with periodic elite migration. |
