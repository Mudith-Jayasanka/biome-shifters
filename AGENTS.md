# Agent Guidelines & Development Protocols — Biome Shifters

This document defines standard operating procedures, architectural rules, and mandatory development protocols for AI agents working on **Biome Shifters**.

---

## 🚨 MANDATORY PROTOCOL: Task Registration

Before writing or editing code for **ANY** implementation request (whether a new feature, code refactor, behavioral change, or bugfix):

1. **Break Down into Self-Contained Tasks**:
   - Every request must be decomposed into one or more numbered task files, each small enough for a smaller AI agent to implement and test independently.
   - Each task must be **functionally complete on its own**: it must produce working code that can be loaded in the browser without depending on a future task being done first.
   - If a feature has multiple phases (e.g. CA Hydrology → Vegetation Growth → Agent Grazing), create a separate task file for each phase.

2. **Create a Task File per Sub-Task**:
   - Save a new markdown file under `tasks/TASK_XX_<task_name>.md` (where `XX` is the next sequential task number).
   - Each task document must detail:
     - **Status**: `TODO` / `IN PROGRESS` / `DONE`
     - **Goal**: Clear, single-sentence description of what is being built or fixed.
     - **Context**: Brief description of how this task fits into the larger feature.
     - **Files to Create/Modify**: Exact file paths, labelled `[NEW]` or `[MODIFY]`.
     - **Detailed Specification**: Exact code contracts — function signatures, data layouts, input/output schemas, and before/after snippets.
     - **Test Plan**: A concrete step the implementor can perform in the browser (or via `node -e`) to verify the task is complete without needing future tasks.
     - **Acceptance Criteria**: Verifiable requirements, each as a checkable item.

3. **Register in `tasks/README.md`**:
   - Update the task list table and dependency chain diagram in `tasks/README.md`.

4. **Proceed to Implementation**:
   - Implement the code as specified in the registered task document.
   - Upon completion and verification, update the task status in `tasks/TASK_XX_...md` to `DONE`.
   - Present the completed work and verification to the user.
   - **Git Add, Commit, and Push**: ONLY after the user has confirmed that a task is finished, stage, commit, and push:
     ```bash
     git add -A
     git commit -m "TASK_XX: <short summary>"
     git push
     ```
     **Do NOT git add, commit, or push proactively before the user confirms completion.**

---

## 🏗️ Architecture Overview

- **Language & Environment**: ES6 Vanilla JavaScript & HTML5 Canvas. Served over standard HTTP (`python3 server.py` on port 8080).
- **Zero Frameworks / Pure Vanilla**: No external npm packages or build steps.
- **Core Modules** (designed to run either on the main thread or inside Web Workers):
  - `js/grid.js`: Multi-layered 2D world grid using flat `TypedArray` buffers (Elevation, Moisture, Fertility, Biomass, Trails, Pheromones, Biome IDs).
  - `js/environment.js`: Environmental Cellular Automata engine (Water flow, moisture diffusion, vegetation regrowth, soil erosion/trampling decay).
  - `js/nn.js`: Recurrent Neural Network (RNN) brain with `Float32Array` weights, persistent hidden state carry, `tanh` activation, mutation, and crossover.
  - `js/agent.js`: `Agent` class with egocentric sensory perception, decision decoding, movement, grazing, terraforming, and energy economics.
  - `js/simulation.js`: `Simulation` class — coordinates grid ticks, environmental CA updates, agent life cycles, reproduction, death, elite tracking, and save/load serialization.
  - `js/renderer.js`: High-performance HTML5 Canvas renderer with multi-layer visualization modes (Biome view, Topography, Water/Hydrology, Biomass, Trampled Trails, Agent Scent, Neural Inspector graph).
  - `js/storage.js`: `StorageManager` — REST API integration with `server.py` for persistent JSON save/load files in `saves/`.
  - `js/main.js`: `requestAnimationFrame` render loop, `MessageChannel` turbo pump, speed controls, TPS counter, camera pan/zoom, and agent/tile inspector.

---

## 🎨 Coding Conventions & Rules

1. **No External Libraries**: Pure vanilla JS and standard HTML5 Canvas/Web APIs only.
2. **ES6 Module Imports**: Use strict relative imports (`./grid.js`, `./agent.js`). Ensure core simulation modules contain **no DOM or Canvas references** so they can run headlessly or inside Web Workers.
3. **Flat TypedArray Memory Layout**: All grid layers must be stored in 1D `Float32Array`, `Uint8Array`, or `Int32Array` indexed by `index = y * width + x`. This guarantees memory locality and zero cache thrashing.
4. **Zero-Allocation in Simulation Loops**: Avoid memory allocations in high-frequency loops (e.g. inside `tick()` or `draw()`). Do not instantiate objects (`new ...`), allocate array literals, or trigger garbage collection inside per-cell or per-agent tick steps. Reuse preallocated buffers.
5. **Message Schema Discipline**: All data transferred between threads or serialized to disk must use documented schemas (plain JSON objects or transferable TypedArrays, no raw class instances).
6. **Task Isolation**: Each task file defines a clear input state and output state. Never assume a future task has been implemented.
7. **Strict Git Discipline**: Always run `git add`, `git commit -m "TASK_XX: <description>"`, and `git push` ONLY AFTER the user has confirmed that a task is finished.

---

## 🧬 Golden Lessons Learned (From EvoSimSpheres)

These core principles were derived from extensive simulation tuning, evolutionary balancing, and refactors in EvoSimSpheres. Every agent working on Biome Shifters MUST uphold these rules:

1. **Anti-Cheat & Physical Fairness (No Artificial Cheats)**:
   - *Never* give species hardcoded multipliers (e.g. free sprint multipliers, free bite bonuses, hardcoded food detection overrides).
   - *Never* cheat sensory inputs by directly tagging entities with artificial labels (e.g. "is_enemy"). Provide raw physical sensations (scent, color, biomass, gradient) and let the neural network learn discrimination.
   - Emergence collapses the moment artificial cheats or arbitrary rules are injected.

2. **Recurrent Hidden State Memory (RNN Carry)**:
   - Feedforward networks suffer from severe spatial amnesia: agents oscillate back and forth between two tiles because they cannot remember which direction they came from.
   - Every brain MUST maintain persistent recurrent hidden states carried across consecutive ticks.

3. **Strict Metabolic Proportionality**:
   - Every action has an energy cost:
     - Basal metabolic drain every tick prevents passive camping.
     - Movement cost scales with velocity ($cost \propto v$ or $v^2$).
     - Terraforming (digging channels, banking soil, planting seeds) demands significant upfront energy.
   - An organism cannot produce infinite offspring; reproduction must require a substantial energy split (e.g., parent gives 50% energy to child).

4. **Decoupled Physics & Render Loops**:
   - Never tie simulation ticks to the browser's 60 FPS `requestAnimationFrame`.
   - Provide a dual-loop architecture:
     - Normal visualization via `requestAnimationFrame`.
     - Turbo/Super-Fast execution via `MessageChannel` microtask pump that can run thousands of simulation ticks per second with visual throttling.

5. **Organic Patch Dynamics & Local Diffusion**:
   - Never uniformly spawn food/vegetation randomly across the map.
   - Growth must follow realistic cellular diffusion: vegetation grows adjacent to existing fertile tiles and near water sources.
   - Overgrazing depletes roots, causing desertification and forcing natural migration.

6. **Serialization & Save/Load from Day 1**:
   - Implement `toJSON()` and `fromJSON()` on all core classes (`Grid`, `Agent`, `NeuralNet`, `Simulation`) from the very beginning.
   - Do not defer serialization to late in the project; retrofitting it is error-prone.

7. **Persistent Inspection by Unique ID**:
   - When inspecting an agent or tile, track the entity by a unique, persistent ID (`agent.id`) rather than its array index.
   - As agents die and arrays shift, inspection must remain pinned to the selected entity without flickering or inspecting the wrong entity.

8. **Clean Headless Engine (Worker-Ready)**:
   - Keep `grid.js`, `environment.js`, `agent.js`, `nn.js`, and `simulation.js` completely free of `window`, `document`, `canvas`, or audio dependencies.
   - This ensures the entire simulation engine can run in a Web Worker or in Node.js for headless evolutionary training without refactoring.

9. **Extinction Safety Floor & Elite Preservation**:
   - When an entire population collapses, preserve the top historical genetic performers (elite lineage seeds) alongside random mutations to kickstart recovery without total state resets.

10. **Multi-Island / Speciation Migration**:
    - Prepare the architecture for isolated world chunks or multiple simulation islands where migration occurs periodically. Isolated gene pools foster unique evolutionary strategies that outcompete stagnant monocultures.
