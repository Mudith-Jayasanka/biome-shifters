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

    // Top historical genetic performers preserved for extinction recovery
    this.eliteArchive = [];
    this.maxEliteArchiveSize = 15;

    // Live world metrics
    this.stats = {
      tick: 0,
      population: 0,
      totalBiomass: 0,
      waterCoveragePct: 0,
      avgEnergy: 0,
      generationMax: 1
    };
  }

  /**
   * Initialize or re-seed the simulation world
   */
  initWorld(seed = Date.now()) {
    this.tickCount = 0;
    this.agents = [];
    this.nextAgentId = 1;
    this.grid.generateTerrain(seed);
    this.spawnInitialPopulation(CONFIG.INITIAL_POPULATION);
    this.updateStats();
  }

  /**
   * Find candidate spawn coordinates on safe, dry, unoccupied land
   */
  findSpawnLocation(maxAttempts = 100) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const x = Math.floor(Math.random() * this.width);
      const y = Math.floor(Math.random() * this.height);

      if (
        this.grid.getWater(x, y) < 0.25 &&
        this.grid.getElevation(x, y) < 0.85 &&
        this.grid.getOccupant(x, y) === -1
      ) {
        return { x, y };
      }
    }
    return null;
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
    if (agent.age < 120 && agent.generation < 2) return;

    // Score based on lifespan and generation
    const fitness = agent.age + agent.generation * 100;
    const brainCopy = agent.brain.clone();

    this.eliteArchive.push({ fitness, brain: brainCopy });
    this.eliteArchive.sort((a, b) => b.fitness - a.fitness);

    if (this.eliteArchive.length > this.maxEliteArchiveSize) {
      this.eliteArchive.length = this.maxEliteArchiveSize;
    }
  }

  /**
   * Extinction recovery: Reseed population from top historical elite lineages
   */
  reseedFromElites(targetCount = CONFIG.MIN_POPULATION_FLOOR) {
    const deficit = targetCount - this.agents.length;
    if (deficit <= 0) return;

    for (let i = 0; i < deficit; i++) {
      const loc = this.findSpawnLocation();
      if (!loc) break;

      let brain;
      if (this.eliteArchive.length > 0) {
        const elite = this.eliteArchive[Math.floor(Math.random() * this.eliteArchive.length)];
        brain = elite.brain.clone();
        brain.mutate(CONFIG.MUTATION_RATE_DEFAULT * 1.5, 0.25);
      } else {
        brain = new NeuralNet();
      }

      const agent = new Agent(this.nextAgentId++, loc.x, loc.y, brain);
      agent.energy = CONFIG.INITIAL_ENERGY * 1.2; // Small initial subsidy
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

      // Check reproduction
      if (this.agents.length + newChildren.length < 300) {
        const child = agent.checkReproduction(this.grid, this.nextAgentId);
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
    if (this.agents.length < CONFIG.MIN_POPULATION_FLOOR) {
      this.reseedFromElites();
    }

    // 4. Update telemetry statistics
    this.updateStats();
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
    let maxGen = 1;
    for (let i = 0; i < this.agents.length; i++) {
      const a = this.agents[i];
      energySum += a.energy;
      if (a.generation > maxGen) maxGen = a.generation;
    }

    this.stats.tick = this.tickCount;
    this.stats.population = this.agents.length;
    this.stats.totalBiomass = Math.round(totalBio);
    this.stats.waterCoveragePct = Math.round((waterCells / size) * 100);
    this.stats.avgEnergy = this.agents.length > 0 ? Math.round(energySum / this.agents.length) : 0;
    this.stats.generationMax = maxGen;
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
      nextAgentId: this.nextAgentId,
      grid: this.grid.toJSON(),
      agents: this.agents.map(a => a.toJSON()),
      eliteArchive: this.eliteArchive.map(e => ({
        fitness: e.fitness,
        brain: e.brain.toJSON()
      })),
      stats: { ...this.stats }
    };
  }

  static fromJSON(data) {
    const sim = new Simulation({
      width: data.grid.width,
      height: data.grid.height
    });

    sim.tickCount = data.tick || 0;
    sim.nextAgentId = data.nextAgentId || (data.agents.length + 1);
    sim.grid = Grid.fromJSON(data.grid);
    sim.environment = new Environment(sim.grid);

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
        brain: NeuralNet.fromJSON(e.brain)
      }));
    }

    sim.updateStats();
    return sim;
  }
}

