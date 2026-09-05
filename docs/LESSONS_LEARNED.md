# Lessons Learned from EvoSimSpheres: A Field Guide for Biome Shifters

This document records the foundational lessons, architectural insights, and design pitfalls discovered during the development of **EvoSimSpheres**. These insights directly inform the design and implementation of **Biome Shifters**.

---

## 1. The Anti-Cheat Principle: Emergence Requires Strict Fairness

### What Happened in EvoSimSpheres:
In early tasks of EvoSimSpheres, carnivores were struggling to catch herbivores. To "help" them, several artificial aids were introduced:
- A hardcoded `2.0x` sprint multiplier triggered when looking at prey.
- Free `+40` energy rewards granted simply for biting during a hunt.
- Direct sensory labels indicating whether a sensed entity was food, rock, or mate.

### The Problem:
These shortcuts caused evolutionary collapse:
- Carnivores evolved to spam the bite action blindly because it yielded free energy.
- Herbivores could never evolve counter-strategies because predators possessed arbitrary physical advantages.
- The simulation ceased to be a true evolutionary study and became a fragile, hand-tuned animation.
- Tasks 23 through 27 had to be dedicated solely to stripping out every cheat and restoring strict physical fairness. Once cheats were removed, genuine hunting and evasion strategies emerged naturally.

### Rule for Biome Shifters:
- **No artificial multipliers or free rewards.** Every joule of energy gained by an agent must be extracted from the environment (grazing biomass) or another agent.
- **No synthetic sensory labels.** Agents do not receive an `is_food` or `is_friend` flag. They receive raw physical signals: biomass density, scent channel intensities, local slope, and moisture. The neural net must learn what those sensations mean.

---

## 2. Recurrent Memory (RNN Carry) is Essential for Spatial Worlds

### What Happened in EvoSimSpheres:
In Task 03, neural networks were pure feedforward architectures ($Inputs \to Hidden \to Output$).
Creatures exhibited severe behavioral locking:
- An agent encountering a rock or empty patch would turn away, immediately forget the obstacle was there, turn back toward its target, see the obstacle again, and oscillate indefinitely.
- Creatures could not perform sequential multi-step tasks (e.g., stalk prey, follow a scent trail through a turn, or patrol an area).

### The Solution:
Task 36 introduced persistent recurrent hidden state carryover:
- Hidden neuron activations from tick $t-1$ were fed back into hidden neurons at tick $t$ via recurrent weights.
- Immediately, agents evolved persistent momentum, memory of obstacles beyond their immediate sightline, and deliberate search patterns.

### Rule for Biome Shifters:
- Biome Shifters must use a **Recurrent Neural Network with persistent hidden state carry from Day 1** (`TASK_03`). Because agents operate on a discrete grid with terrain features and paths, memory of recent moves is critical to avoid 2-tile ping-pong oscillations.

---

## 3. High-Performance Decoupled Loops & Web Worker Offloading

### What Happened in EvoSimSpheres:
- Initially, simulation physics ran on the main thread inside `requestAnimationFrame(loop)`.
- At 60 FPS, the simulation was limited to 60 ticks per second, making evolutionary experiments agonizingly slow.
- Attempting to run 50 physics steps inside a single frame froze the browser UI, causing choppy rendering and unresponsive buttons.
- Tasks 40 and 41 introduced visual throttling and an uncapped `MessageChannel` microtask pump.
- Tasks 42 through 45 migrated the simulation into dedicated Web Workers (`sim.worker.js`), decoupling physics from rendering completely and enabling multi-island parallelism.

### Rule for Biome Shifters:
- Design all simulation core classes (`Grid`, `Environment`, `Agent`, `Simulation`) to be **100% headless** from the start—zero references to DOM, canvas, or window.
- Decouple the simulation tick pump from canvas rendering: allow the simulation to run at 1000+ TPS in Turbo Mode while the renderer visualizes at 60 FPS.
- Ensure the state snapshot passed to the renderer uses structured cloning or transferable TypedArrays so worker migration is seamless.

---

## 4. TypedArray Memory Layout & Zero-Allocation Loops

### What Happened in EvoSimSpheres:
- Creating small vector instances (`new Vec2()`) and temporary object literals inside `tick()` generated massive garbage collection spikes. Every few seconds, the browser stuttered as V8 paused to collect dead objects.
- In a continuous simulation, spatial hash grids helped, but object allocations still degraded performance.

### Rule for Biome Shifters:
- On a 2D grid ($W \times H$), use **flat 1D TypedArrays**:
  - `Float32Array` for continuous fields (Elevation, Moisture, Biomass, Scent, Trample).
  - `Int32Array` for discrete fields (Agent occupancy).
- Cell lookup is an integer multiplication: `index = y * width + x`.
- Avoid allocating objects in the environmental update step. Reallocate nothing per tick; swap ping-pong buffers or update in-place where applicable.

---

## 5. Organic Diffusion vs. Uniform Random Spawning

### What Happened in EvoSimSpheres:
- Early food spawning randomly sprinkled green dots across the canvas.
- Creatures wandered randomly because food had no geographic structure.
- Task 14 introduced clover plant clusters that spread locally via seeds into adjacent space. This created distinct lush feeding grounds and barren zones, prompting herd formation, migration, and territorial defense.

### Rule for Biome Shifters:
- Plant biomass must grow dynamically via cellular automata rules:
  - High soil moisture + sunlight = rapid biomass growth.
  - Biomass spreads to adjacent fertile cells (vegetation propagation).
  - Overgrazed tiles lose fertility and take longer to recover.
- This produces natural biome boundaries (dense forests, savannas, arid deserts) that evolve organically.

---

## 6. Comprehensive Serialization (Save/Load) from the Beginning

### What Happened in EvoSimSpheres:
- Save and load functionality was added in Task 21, requiring retroactive updates to `NeuralNet`, `Creature`, `Food`, `Rock`, and `Simulation` to support `toJSON()` and `fromJSON()`.
- Subtle serialization bugs surfaced because internal state fields had been added across 20 earlier tasks without serialization testing.

### Rule for Biome Shifters:
- Every core entity must implement `toJSON()` and `fromJSON()` from the day it is created.
- The lightweight backend server (`server.py`) is already established to persist saves directly to the `saves/` folder.

---

## 7. Persistent Inspector Selection Across World Ticks

### What Happened in EvoSimSpheres:
- Selecting an agent for inspection by its index in `simulation.creatures` caused frequent bugs: when another creature died, the array shifted, and the inspector suddenly jumped to a completely different creature.
- Task 50 had to refactor creature tracking to use immutable unique IDs (`creature.id`).

### Rule for Biome Shifters:
- Every agent is assigned an immutable `id` (e.g. integer counter `nextAgentId++`).
- The UI inspector stores `selectedAgentId` and looks up the agent by ID each frame. If the agent dies, the inspector clearly indicates "Subject Expired" rather than jumping to a stranger.
