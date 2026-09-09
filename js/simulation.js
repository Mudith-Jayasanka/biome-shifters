/**
 * Biome Shifters — Simulation Coordinator & World Loop
 * Coordinates grid updates, environmental cellular automata, agent life cycles,
 * reproduction, mortality, elite genetics, and serialization.
 * Headless module: Zero DOM or canvas dependencies (Web Worker ready).
 */

import { CONFIG } from './config.js';
import { Grid, classifyBiome } from './grid.js';
import { Environment } from './environment.js';
import { Agent } from './agent.js';
import { NeuralNet } from './nn.js';

export class Simulation {
  constructor(config = {}) {
    this.tickCount = 0;
    this.width = config.width || CONFIG.GRID_WIDTH;
    this.height = config.height || CONFIG.GRID_HEIGHT;

    this.grid = new Grid(this.width, this.height);
    this.environment = new Environment(this.grid);
    this.agents = [];
    this.nextAgentId = 1;

    this.islandId = config.islandId !== undefined ? config.islandId : 0;
    this.immigrantsReceived = 0;

    // Top historical genetic performers preserved for extinction recovery
    this.eliteArchive = [];
    this.maxEliteArchiveSize = 25;

    // Dynamic Population Ceiling & Safety Floor
    this.maxPopulation = config.maxPopulation || CONFIG.MAX_POPULATION || 800;
    this.minPopulationFloor = config.minPopulationFloor || CONFIG.MIN_POPULATION_FLOOR || 100;

    // Radiation & Extreme Mutation Laboratory Mode
    this.isRadiationMode = Boolean(config.isRadiationMode);
    this.radiationMultiplier = Number(config.radiationMultiplier) || 4.0;

    // Historical telemetry buffers (120 samples recorded every 10 ticks = 1200 ticks of history)
    this.historyCapacity = 120;
    this.historySampleRate = 10;
    this.history = {
      pop: new Float32Array(this.historyCapacity),
      biomass: new Float32Array(this.historyCapacity),
      maxGen: new Float32Array(this.historyCapacity),
      avgGen: new Float32Array(this.historyCapacity),
      count: 0,
      head: 0
    };

    // Live world metrics
    this.stats = {
      tick: 0,
      islandId: this.islandId,
      population: 0,
      maxPopulation: this.maxPopulation,
      minPopulationFloor: this.minPopulationFloor,
      totalBiomass: 0,
      waterCoveragePct: 0,
      avgEnergy: 0,
      generationMax: 1,
      generationMaxAllTime: 1,
      generationAvg: 1,
      generationCounts: [],
      elitesCount: 0,
      immigrantsReceived: 0,
      isRadiationMode: this.isRadiationMode,
      radiationMultiplier: this.radiationMultiplier
    };
  }

  /**
   * Set Radiation & Extreme Mutation Laboratory Mode
   */
  setRadiationMode(enabled, multiplier = 4.0) {
    this.isRadiationMode = Boolean(enabled);
    this.radiationMultiplier = Number(multiplier) || 4.0;
    this.stats.isRadiationMode = this.isRadiationMode;
    this.stats.radiationMultiplier = this.radiationMultiplier;
  }

  /**
   * Initialize or re-seed the simulation world
   */
  initWorld(seed = Date.now()) {
    this.tickCount = 0;
    this.agents = [];
    this.nextAgentId = 1;
    this.history.count = 0;
    this.history.head = 0;
    this.history.pop.fill(0);
    this.history.biomass.fill(0);
    this.history.maxGen.fill(0);
    this.history.avgGen.fill(0);
    this.stats.generationMaxAllTime = 1;
    this.grid.generateTerrain(seed);
    this.spawnInitialPopulation(CONFIG.INITIAL_POPULATION);
    this.updateStats();
    this.recordHistorySample();
  }

  /**
   * Record zero-allocation snapshot into circular history ring buffer
   */
  recordHistorySample() {
    const idx = this.history.head;
    this.history.pop[idx] = this.agents.length;
    this.history.biomass[idx] = this.stats.totalBiomass;
    this.history.maxGen[idx] = this.stats.generationMax;
    this.history.avgGen[idx] = this.stats.generationAvg;

    this.history.head = (this.history.head + 1) % this.historyCapacity;
    if (this.history.count < this.historyCapacity) {
      this.history.count++;
    }
  }

  /**
   * Find candidate spawn coordinates on safe, dry, unoccupied land.
   * Employs multi-tier progressive relaxation to guarantee spawning never deadlocks.
   */
  findSpawnLocation() {
    // Stage 1: Ideal conditions (dry inland lowland / plains, unoccupied)
    for (let attempt = 0; attempt < 50; attempt++) {
      const x = Math.floor(Math.random() * this.width);
      const y = Math.floor(Math.random() * this.height);

      if (
        !this.grid.isCoastal(x, y) &&
        this.grid.getWater(x, y) < 0.25 &&
        this.grid.getElevation(x, y) < 0.80 &&
        this.grid.getOccupant(x, y) === -1
      ) {
        return { x, y };
      }
    }

    // Stage 2: Relaxed conditions (any non-submerged inland cell, unoccupied)
    for (let attempt = 0; attempt < 50; attempt++) {
      const x = Math.floor(Math.random() * this.width);
      const y = Math.floor(Math.random() * this.height);

      if (
        !this.grid.isCoastal(x, y) &&
        this.grid.getWater(x, y) < 0.35 &&
        this.grid.getOccupant(x, y) === -1
      ) {
        return { x, y };
      }
    }

    // Stage 3: Deterministic fallback scan across grid for any dry inland unoccupied cell
    const total = this.grid.size;
    const startIdx = Math.floor(Math.random() * total);
    for (let offset = 0; offset < total; offset++) {
      const idx = (startIdx + offset) % total;
      const x = idx % this.width;
      const y = Math.floor(idx / this.width);

      if (
        !this.grid.isCoastal(x, y) &&
        this.grid.water[idx] < 0.40 &&
        this.grid.occupancy[idx] === -1
      ) {
        return { x, y };
      }
    }

    return null;
  }

  /**
   * Set maximum allowed population capacity
   */
  setMaxPopulation(val) {
    this.maxPopulation = Math.max(50, Math.min(2500, Math.floor(val)));
    if (this.minPopulationFloor > this.maxPopulation) {
      this.minPopulationFloor = this.maxPopulation;
    }
    this.stats.maxPopulation = this.maxPopulation;
    this.stats.minPopulationFloor = this.minPopulationFloor;
  }

  /**
   * Set minimum extinction safety floor
   */
  setMinPopulationFloor(val) {
    this.minPopulationFloor = Math.max(10, Math.min(this.maxPopulation, Math.floor(val)));
    this.stats.minPopulationFloor = this.minPopulationFloor;
  }

  /**
   * Inject a batch of new exploring agents
   * @param {number} count
   * @returns {number} Actual number spawned
   */
  spawnBatch(count = 50) {
    const clamped = Math.min(count, this.maxPopulation - this.agents.length);
    if (clamped <= 0) return 0;

    let spawned = 0;
    for (let i = 0; i < clamped; i++) {
      const loc = this.findSpawnLocation();
      if (!loc) break;

      let brain;
      if (this.eliteArchive.length > 0 && Math.random() < 0.65) {
        const elite = this.eliteArchive[Math.floor(Math.random() * this.eliteArchive.length)];
        brain = elite.brain.clone();
        const mutMult = this.isRadiationMode ? this.radiationMultiplier : 1.0;
        const mutStrength = this.isRadiationMode ? 0.45 : 0.25;
        brain.mutate(CONFIG.MUTATION_RATE_DEFAULT * 1.5 * mutMult, mutStrength);
      } else {
        brain = new NeuralNet();
      }

      const agent = new Agent(this.nextAgentId++, loc.x, loc.y, brain);
      agent.energy = CONFIG.INITIAL_ENERGY * 1.25;
      this.grid.setOccupant(loc.x, loc.y, agent.id);
      this.agents.push(agent);
      spawned++;
    }

    this.updateStats();
    return spawned;
  }

  /**
   * Spawn initial generation of neural agents
   */
  spawnInitialPopulation(count = CONFIG.INITIAL_POPULATION) {
    for (let i = 0; i < count; i++) {
      const loc = this.findSpawnLocation();
      if (!loc) break;

      const agent = new Agent(this.nextAgentId++, loc.x, loc.y);
      this.grid.setOccupant(loc.x, loc.y, agent.id);
      this.agents.push(agent);
    }
  }

  /**
   * Preserve high-performing brains for extinction recovery
   */
  recordPotentialElite(agent) {
    if (agent.age < 60 && agent.biomassEaten < 0.5 && (agent.rootsHarvested || 0) < 2.0 && (agent.seedsSown || 0) < 1) return;

    // True biological Darwinian fitness: lifespan + biomass consumed + offspring raised + subterranean roots harvested + agricultural seeds sown
    const fitness = agent.age + (agent.biomassEaten * 25) + (agent.offspringCount * 300) + ((agent.rootsHarvested || 0) * 8) + ((agent.seedsSown || 0) * 1.5);
    const brainCopy = agent.brain.clone();

    this.eliteArchive.push({
      fitness,
      brain: brainCopy,
      generation: agent.generation
    });
    this.eliteArchive.sort((a, b) => b.fitness - a.fitness);

    if (this.eliteArchive.length > this.maxEliteArchiveSize) {
      this.eliteArchive.length = this.maxEliteArchiveSize;
    }
  }

  /**
   * Export top Darwinian elite brains from this island for cross-island migration
   */
  exportElites(count = 3) {
    const candidates = [];

    // 1. Collect from elite archive
    for (let i = 0; i < this.eliteArchive.length; i++) {
      const e = this.eliteArchive[i];
      candidates.push({
        fitness: e.fitness,
        generation: e.generation || 1,
        brain: e.brain.toJSON(),
        originIsland: this.islandId,
        originTick: this.tickCount
      });
    }

    // 2. Collect from living agents
    for (let i = 0; i < this.agents.length; i++) {
      const a = this.agents[i];
      if (a.isDead) continue;
      const fitness = a.age + (a.biomassEaten * 25) + (a.offspringCount * 300) + ((a.rootsHarvested || 0) * 8) + ((a.seedsSown || 0) * 1.5);
      candidates.push({
        fitness,
        generation: a.generation || 1,
        brain: a.brain.toJSON(),
        originIsland: this.islandId,
        originTick: this.tickCount
      });
    }

    // Sort descending by fitness
    candidates.sort((a, b) => b.fitness - a.fitness);

    // Take top N unique genomes
    return candidates.slice(0, count);
  }

  /**
   * Import foreign elite brains from peer islands and spawn pioneer immigrant agents
   */
  importElites(elites, spawnCount = 2) {
    if (!Array.isArray(elites) || elites.length === 0) return 0;

    let importedCount = 0;
    for (let i = 0; i < elites.length; i++) {
      const e = elites[i];
      if (!e || !e.brain) continue;
      try {
        const brain = NeuralNet.fromJSON(e.brain);
        this.eliteArchive.push({
          fitness: e.fitness || 100,
          brain: brain.clone(),
          generation: e.generation || 1,
          originIsland: e.originIsland
        });
        importedCount++;
      } catch (err) {
        console.warn('[Simulation] Failed to import foreign elite brain:', err);
      }
    }

    // Maintain bounded elite archive
    this.eliteArchive.sort((a, b) => b.fitness - a.fitness);
    if (this.eliteArchive.length > this.maxEliteArchiveSize) {
      this.eliteArchive.length = this.maxEliteArchiveSize;
    }

    this.immigrantsReceived += importedCount;
    this.stats.immigrantsReceived = this.immigrantsReceived;

    // Immediately spawn pioneer immigrant agents into safe terrain
    const actualSpawn = Math.min(spawnCount, elites.length);
    for (let i = 0; i < actualSpawn; i++) {
      if (this.agents.length >= this.maxPopulation) break;
      const loc = this.findSpawnLocation();
      if (!loc) break;

      const foreignElite = elites[i % elites.length];
      const foreignBrain = NeuralNet.fromJSON(foreignElite.brain);
      // Gentle mutation to adapt to local biome (amplified in radiation lab)
      const mutMult = this.isRadiationMode ? this.radiationMultiplier : 1.0;
      const mutRate = Math.min(0.35, 0.05 * mutMult);
      const mutStrength = this.isRadiationMode ? 0.35 : 0.15;
      foreignBrain.mutate(mutRate, mutStrength);

      const immigrant = new Agent(this.nextAgentId++, loc.x, loc.y, foreignBrain);
      immigrant.energy = CONFIG.INITIAL_ENERGY * 1.5; // Foothold energy subsidy
      immigrant.generation = foreignElite.generation || 1;
      immigrant.originIsland = foreignElite.originIsland;
      immigrant.isImmigrant = true;

      this.grid.setOccupant(loc.x, loc.y, immigrant.id);
      this.agents.push(immigrant);
    }

    this.updateStats();
    return importedCount;
  }

  /**
   * Extinction recovery: Reseed population from top historical elite lineages
   */
  reseedFromElites(targetCount = this.minPopulationFloor) {
    const deficit = targetCount - this.agents.length;
    if (deficit <= 0) return;

    for (let i = 0; i < deficit; i++) {
      const loc = this.findSpawnLocation();
      if (!loc) break;

      let brain;
      let gen = 1;
      if (this.eliteArchive.length > 0) {
        const elite = this.eliteArchive[Math.floor(Math.random() * this.eliteArchive.length)];
        brain = elite.brain.clone();
        const mutMult = this.isRadiationMode ? this.radiationMultiplier : 1.0;
        const mutStrength = this.isRadiationMode ? 0.45 : 0.25;
        brain.mutate(CONFIG.MUTATION_RATE_DEFAULT * 1.5 * mutMult, mutStrength);
        gen = elite.generation || 1;
      } else {
        brain = new NeuralNet();
      }

      const agent = new Agent(this.nextAgentId++, loc.x, loc.y, brain);
      agent.energy = CONFIG.INITIAL_ENERGY * 1.25; // Small initial subsidy
      agent.generation = gen;
      this.grid.setOccupant(loc.x, loc.y, agent.id);
      this.agents.push(agent);
    }
  }

  /**
   * Execute one simulation tick
   */
  tick() {
    this.tickCount++;

    // 1. Environmental Cellular Automata update
    this.environment.tick();

    // 2. Agents sense, think, act, reproduce, and die
    const newChildren = [];
    const livingAgents = [];

    for (let i = 0; i < this.agents.length; i++) {
      const agent = this.agents[i];
      if (agent.isDead) continue;

      // Agent tick
      agent.tick(this.grid);

      if (agent.isDead) {
        this.recordPotentialElite(agent);
        continue;
      }

      // Check reproduction (passing this for sexual mate lookup)
      if (this.agents.length + newChildren.length < this.maxPopulation) {
        const child = agent.checkReproduction(this.grid, this.nextAgentId, this);
        if (child) {
          this.nextAgentId++;
          newChildren.push(child);
        }
      }

      livingAgents.push(agent);
    }

    // Add children to population
    if (newChildren.length > 0) {
      for (let i = 0; i < newChildren.length; i++) {
        livingAgents.push(newChildren[i]);
      }
    }

    this.agents = livingAgents;

    // 3. Extinction safety floor
    if (this.agents.length < this.minPopulationFloor) {
      this.reseedFromElites(this.minPopulationFloor);
    }

    // 4. Update telemetry statistics
    this.updateStats();

    // 5. Record historical telemetry sample every 10 ticks
    if (this.tickCount % this.historySampleRate === 0) {
      this.recordHistorySample();
    }
  }

  /**
   * Update world-level aggregate telemetry statistics
   */
  updateStats() {
    let totalBio = 0;
    let waterCells = 0;
    const size = this.grid.size;
    const biomass = this.grid.biomass;
    const water = this.grid.water;

    for (let i = 0; i < size; i++) {
      totalBio += biomass[i];
      if (water[i] > 0.15) waterCells++;
    }

    let energySum = 0;
    let genSum = 0;
    let maxGen = 1;
    const genCountsMap = new Map();

    for (let i = 0; i < this.agents.length; i++) {
      const a = this.agents[i];
      energySum += a.energy;
      genSum += a.generation;
      if (a.generation > maxGen) maxGen = a.generation;
      genCountsMap.set(a.generation, (genCountsMap.get(a.generation) || 0) + 1);
    }

    const generationCounts = [];
    for (const [gen, count] of genCountsMap.entries()) {
      generationCounts.push({ gen, count });
    }
    generationCounts.sort((a, b) => a.gen - b.gen);

    if (maxGen > this.stats.generationMaxAllTime) {
      this.stats.generationMaxAllTime = maxGen;
    }

    this.stats.tick = this.tickCount;
    this.stats.population = this.agents.length;
    this.stats.maxPopulation = this.maxPopulation;
    this.stats.minPopulationFloor = this.minPopulationFloor;
    this.stats.totalBiomass = Math.round(totalBio);
    this.stats.waterCoveragePct = Math.round((waterCells / size) * 100);
    this.stats.avgEnergy = this.agents.length > 0 ? Math.round(energySum / this.agents.length) : 0;
    this.stats.generationMax = maxGen;
    this.stats.generationAvg = this.agents.length > 0 ? parseFloat((genSum / this.agents.length).toFixed(1)) : 1;
    this.stats.generationCounts = generationCounts;
    this.stats.elitesCount = this.eliteArchive.length;
    this.stats.islandId = this.islandId;
    this.stats.immigrantsReceived = this.immigrantsReceived;
    this.stats.isRadiationMode = this.isRadiationMode;
    this.stats.radiationMultiplier = this.radiationMultiplier;
  }

  /**
   * Fast lookup for pinned agent inspector
   */
  getAgentById(id) {
    if (id === null || id === undefined || id < 0) return null;
    for (let i = 0; i < this.agents.length; i++) {
      if (this.agents[i].id === id) {
        return this.agents[i];
      }
    }
    return null;
  }

  /**
   * Detail readout for clicked tile
   */
  getTileInfo(x, y) {
    if (!this.grid.inBounds(x, y)) return null;

    const elev = this.grid.getElevation(x, y);
    const water = this.grid.getWater(x, y);
    const moist = this.grid.getMoisture(x, y);
    const bio = this.grid.getBiomass(x, y);
    const trample = this.grid.getTrample(x, y);
    const scent = this.grid.getScent(x, y);
    const occ = this.grid.getOccupant(x, y);
    const biome = classifyBiome(elev, water, moist, bio);

    return {
      x, y,
      biome,
      elevation: elev,
      water,
      moisture: moist,
      biomass: bio,
      trample,
      scent,
      occupantId: occ
    };
  }

  // --- Serialization ---

  toJSON(name = `save_${Date.now()}`) {
    return {
      version: 1,
      name,
      timestamp: new Date().toISOString(),
      tick: this.tickCount,
      islandId: this.islandId,
      immigrantsReceived: this.immigrantsReceived,
      nextAgentId: this.nextAgentId,
      maxPopulation: this.maxPopulation,
      minPopulationFloor: this.minPopulationFloor,
      isRadiationMode: this.isRadiationMode,
      radiationMultiplier: this.radiationMultiplier,
      grid: this.grid.toJSON(),
      agents: this.agents.map(a => a.toJSON()),
      eliteArchive: this.eliteArchive.map(e => ({
        fitness: e.fitness,
        generation: e.generation || 1,
        brain: e.brain.toJSON()
      })),
      history: {
        pop: Array.from(this.history.pop.subarray(0, this.history.count)),
        biomass: Array.from(this.history.biomass.subarray(0, this.history.count)),
        maxGen: Array.from(this.history.maxGen.subarray(0, this.history.count)),
        avgGen: Array.from(this.history.avgGen.subarray(0, this.history.count)),
        count: this.history.count,
        head: this.history.head
      },
      stats: { ...this.stats }
    };
  }

  static fromJSON(data) {
    const sim = new Simulation({
      width: data.grid.width,
      height: data.grid.height,
      isRadiationMode: data.isRadiationMode,
      radiationMultiplier: data.radiationMultiplier
    });

    sim.tickCount = data.tick || 0;
    sim.islandId = data.islandId !== undefined ? data.islandId : 0;
    sim.immigrantsReceived = data.immigrantsReceived || 0;
    sim.nextAgentId = data.nextAgentId || (data.agents.length + 1);
    sim.maxPopulation = data.maxPopulation || CONFIG.MAX_POPULATION;
    sim.minPopulationFloor = data.minPopulationFloor || CONFIG.MIN_POPULATION_FLOOR;
    sim.setRadiationMode(data.isRadiationMode, data.radiationMultiplier);
    sim.grid = Grid.fromJSON(data.grid);
    sim.environment = new Environment(sim.grid);

    if (data.history && Array.isArray(data.history.pop)) {
      const len = Math.min(sim.historyCapacity, data.history.pop.length);
      sim.history.count = data.history.count || len;
      sim.history.head = data.history.head || 0;
      for (let i = 0; i < len; i++) {
        sim.history.pop[i] = data.history.pop[i] || 0;
        sim.history.biomass[i] = data.history.biomass ? data.history.biomass[i] || 0 : 0;
        sim.history.maxGen[i] = data.history.maxGen ? data.history.maxGen[i] || 0 : 0;
        sim.history.avgGen[i] = data.history.avgGen ? data.history.avgGen[i] || 0 : 0;
      }
    }

    // Reconstruct agents and ensure occupancy layer matches
    sim.grid.occupancy.fill(-1);
    sim.agents = [];

    if (Array.isArray(data.agents)) {
      for (let i = 0; i < data.agents.length; i++) {
        const agentData = data.agents[i];
        const agent = Agent.fromJSON(agentData);
        if (sim.grid.inBounds(agent.x, agent.y)) {
          sim.grid.setOccupant(agent.x, agent.y, agent.id);
          sim.agents.push(agent);
        }
      }
    }

    if (Array.isArray(data.eliteArchive)) {
      sim.eliteArchive = data.eliteArchive.map(e => ({
        fitness: e.fitness,
        generation: e.generation || 1,
        brain: NeuralNet.fromJSON(e.brain)
      }));
    }

    if (data.stats && data.stats.generationMaxAllTime) {
      sim.stats.generationMaxAllTime = data.stats.generationMaxAllTime;
    }

    // Extinction recovery: if loaded save has collapsed to 0 or below floor, immediately reseed
    if (sim.agents.length < sim.minPopulationFloor) {
      sim.reseedFromElites(sim.minPopulationFloor);
    }

    sim.updateStats();
    return sim;
  }
}

