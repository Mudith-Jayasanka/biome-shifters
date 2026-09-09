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

4. **Cross-Check Existing Implementations for Conflicts**:
   - When starting a task (especially older or pre-drafted tasks), cross-check the task specification against existing code, recent features, and earlier tasks.
   - **Non-Conflicting Improvements**: If the task is a non-conflicting improvement, extension, or natural refactoring, proceed directly with implementation without interrupting or warning the user.
   - **Direct Conflicts**: If the task introduces a direct contradiction, breaking incompatibility, or architectural collision (e.g. conflicting state schemas, broken invariants, incompatible save formats, or mutually exclusive mechanics), STOP and warn the user immediately with a clear explanation and proposed resolution before writing code.

5. **Proceed to Implementation**:
   - Implement the code as specified in the registered task document.
   - Upon completion and verification, update the task status in `tasks/TASK_XX_...md` to `DONE`.
   - Present the completed work and verification to the user.
   - **Git Add, Commit, and Push**: ONLY after the user has confirmed that a task is finished, stage, commit, and push using the safe helper script outside the sandbox (`BypassSandbox: true`):
     ```bash
     ./scripts/commit_task.sh "TASK_XX: <short summary>"
     ```
     **CRITICAL ANTI-CORRUPTION RULE**: NEVER execute `git add`, `git commit`, or `git push` inside the read-only sandbox container (`BypassSandbox: false`). The sandbox container mounts `.git` as read-only; any attempted write to `.git/index.lock` fails mid-flight and truncates `.git/index` to a 0-byte corrupted file. Always run `./scripts/commit_task.sh` with `BypassSandbox: true`.
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
7. **Strict Git Discipline & Sandbox Protection**: Always run `./scripts/commit_task.sh "TASK_XX: <description>"` ONLY AFTER the user has confirmed that a task is finished, and ALWAYS with `BypassSandbox: true`. Running git write commands inside the sandbox truncates `.git/index` to 0 bytes.

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

11. **Reconciliation Loop Failure Latches (Desired vs. Achieved State)**:
    - Never run periodic state reconciliation (e.g. heartbeat loops, cluster synchronization) without an explicit failure latch or upstream state update.
    - If a client or worker attempts to reach a `desired_state` and encounters a hardware or initialization failure, it must fall back cleanly and **latch** that failure (`failed = true`) or immediately update the coordinator (`desired_state = false`).
    - Without a failure latch, continuous reconciliation will detect an `achieved !== desired` discrepancy every tick/heartbeat and create an infinite retry oscillation storm.

12. **Worker Context-Invariant Asset Resolution (`import.meta.url`)**:
    - Never use document-relative paths (`./js/...` or `/js/...`) for loading assets (WGSL shaders, web workers, data fixtures) inside modular libraries.
    - Code executing inside a Web Worker runs under a different base URI (e.g. `/js/workers/`) than code running on the main thread (`/`).
    - Always resolve paths relative to the defining module using `new URL('./relative/path', import.meta.url).href`. This ensures flawless asset discovery regardless of whether code runs on the main thread, inside workers, or in headless test runners.

13. **Strict Coordinator vs. UI Boundary Separation**:
    - Headless managers (`Simulation`, `IslandManager`, `ClusterClient`) must remain strictly isolated from the DOM and document tree.
    - Never query, read, or mutate DOM elements (`document.getElementById(...)`) inside background coordinators or worker message handlers.
    - Propagate failures and state transitions upward using callbacks or event emitters (`this.onGpuFailure = (id) => ...`). UI rendering and DOM updates belong exclusively in the presentation layer (`main.js`).

14. **Fixed Overlays & Stacking Context Isolation (`position: fixed` Root Attachment)**:
    - Never place full-screen overlays, modals, backdrops, or HUD alert dialogs inside nested layout containers (e.g. `#app-root`, `#main-container`, or canvas wrappers) that use `overflow: hidden`, `backdrop-filter`, `transform`, `filter`, or `perspective`.
    - CSS specifications define that properties like `backdrop-filter` or `transform` on an ancestor element establish a new stacking context and containing block. This traps `position: fixed` descendants within the container's bounding box and stacking layer, causing modals to be clipped, trapped beneath canvas layers, or rendered completely invisible despite having `display: flex` and high `z-index`.
    - All modal backdrops and global dialogs MUST be placed as direct children of `<body>` (`document.body`).

15. **ES Module URL Identity & Cache-Busting Hygiene**:
    - Avoid appending ad-hoc cache-busting query strings (`?v=...`) directly to `<script type="module" src="...">` unless all internal relative imports are correspondingly versioned.
    - In ES module loaders, module graph identity is defined strictly by exact URL strings. Mismatched query strings between top-level module tags and internal relative `import` paths can create duplicate module instances, cause silent import resolution failures, or bypass cached singletons. Use proper HTTP response cache-control headers (`no-cache, no-store`) for live development rather than ad-hoc query strings on module scripts.

