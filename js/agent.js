/**
 * Biome Shifters — Neural Agent Entity
 * Operates on physical sensations (anti-cheat discipline) and recurrent neural decision making.
 * Strictly respects metabolic proportionality and energy conservation.
 * Headless module: Zero DOM or canvas dependencies (Web Worker ready).
 */

import { CONFIG, ACTIONS } from './config.js';
import { NeuralNet } from './nn.js';

export class Agent {
  constructor(id, x, y, brain = null) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.energy = CONFIG.INITIAL_ENERGY;
    this.age = 0;
    this.generation = 1;
    this.species = 1;
    this.isDead = false;

    this.brain = brain || new NeuralNet();
    this.sensorBuffer = new Float32Array(CONFIG.NN_INPUT_SIZE || 37);
    this.lastActionResult = 1.0;
    this.lastAction = ACTIONS.IDLE;
    this.lastMoveDir = -1; // 0=N, 1=S, 2=E, 3=W, -1=none

    // Biological success telemetry
    this.biomassEaten = 0;
    this.offspringCount = 0;
    this.trenchesDug = 0;
    this.rootsHarvested = 0;

    // Lineage and visual identification
    this.color = this.generateColor();
  }

  /**
   * Generate an RGB color derived deterministically from brain input weights
   */
  generateColor() {
    let rSum = 0, gSum = 0, bSum = 0;
    const w = this.brain.weightsInput;
    const len = w.length;
    const third = Math.floor(len / 3);

    for (let i = 0; i < third; i++) rSum += Math.abs(w[i]);
    for (let i = third; i < third * 2; i++) gSum += Math.abs(w[i]);
    for (let i = third * 2; i < len; i++) bSum += Math.abs(w[i]);

    const r = Math.min(240, Math.max(50, Math.floor((rSum / third) * 200 + 40)));
    const g = Math.min(240, Math.max(50, Math.floor((gSum / third) * 200 + 40)));
    const b = Math.min(240, Math.max(50, Math.floor((bSum / third) * 200 + 40)));

    return `rgb(${r},${g},${b})`;
  }

  /**
   * Physical sensory gathering (strictly raw physical properties, no artificial cheat tags)
   */
  sense(grid) {
    const s = this.sensorBuffer;
    const x = this.x;
    const y = this.y;
    const w = grid.width;
    const h = grid.height;

    const curElev = grid.getElevation(x, y);

    // Coordinate offsets for N, S, E, W
    const nx = [x, x, x + 1, x - 1];
    const ny = [y - 1, y + 1, y, y];

    // [0..3]: Local Slope (Elevation differences: neighbor - current)
    // Out-of-bounds neighbors register as an impassable sheer cliff barrier (+1.0)
    for (let d = 0; d < 4; d++) {
      if (!grid.inBounds(nx[d], ny[d])) {
        s[d] = 1.0;
      } else {
        s[d] = (grid.getElevation(nx[d], ny[d]) - curElev) * 2.0; // Scaled to [-1, 1]
      }
    }

    // [4..7]: Local Moisture (Out-of-bounds has 0.0 moisture)
    for (let d = 0; d < 4; d++) {
      s[4 + d] = grid.inBounds(nx[d], ny[d]) ? grid.getMoisture(nx[d], ny[d]) : 0.0;
    }

    // [8..11]: Immediate Biomass (dist = 1)
    for (let d = 0; d < 4; d++) {
      s[8 + d] = grid.inBounds(nx[d], ny[d]) ? grid.getBiomass(nx[d], ny[d]) : 0.0;
    }

    // [12..15]: Extended Food Raycasts (N, S, E, W, dist = 2..4)
    // Allows agents to smell/see vegetation patches from afar and navigate toward food
    const rayDx = [0, 0, 1, -1];
    const rayDy = [-1, 1, 0, 0];
    const rayWeights = [0.45, 0.35, 0.20];
    for (let d = 0; d < 4; d++) {
      let rayFood = 0;
      for (let step = 1; step <= 3; step++) {
        const rx = x + rayDx[d] * (step + 1);
        const ry = y + rayDy[d] * (step + 1);
        if (!grid.inBounds(rx, ry)) break;
        rayFood += grid.getBiomass(rx, ry) * rayWeights[step - 1];
      }
      s[12 + d] = Math.min(1.0, rayFood);
    }

    // [16..19]: Local Trample Compaction (Out-of-bounds is impassable, 1.0)
    for (let d = 0; d < 4; d++) {
      s[16 + d] = grid.inBounds(nx[d], ny[d]) ? grid.getTrample(nx[d], ny[d]) : 1.0;
    }

    // [20..23]: Local Scent
    for (let d = 0; d < 4; d++) {
      s[20 + d] = grid.inBounds(nx[d], ny[d]) ? grid.getScent(nx[d], ny[d]) : 0.0;
    }

    // [24..27]: Neighbor Occupancy & Obstacles (1.0 if occupied OR boundary wall, 0.0 if free)
    for (let d = 0; d < 4; d++) {
      if (!grid.inBounds(nx[d], ny[d])) {
        s[24 + d] = 1.0; // Wall is an impassable physical obstacle
      } else {
        const occ = grid.getOccupant(nx[d], ny[d]);
        s[24 + d] = (occ >= 0 && occ !== this.id) ? 1.0 : 0.0;
      }
    }

    // [28]: Current Tile Biomass
    s[28] = grid.getBiomass(x, y);

    // [29]: Current Tile Water Depth
    s[29] = grid.getWater(x, y);

    // [30]: Agent Energy Ratio [0, 1]
    s[30] = Math.min(1.0, this.energy / CONFIG.MAX_ENERGY);

    // [31]: Agent Age Ratio [0, 1]
    s[31] = Math.min(1.0, this.age / CONFIG.MAX_AGE);

    // [32]: Feedback of last action success
    s[32] = this.lastActionResult;

    // [33..36]: Self-Motion / Momentum Heading Vector (one-hot for last move direction)
    s[33] = (this.lastMoveDir === 0) ? 1.0 : 0.0; // Moved North
    s[34] = (this.lastMoveDir === 1) ? 1.0 : 0.0; // Moved South
    s[35] = (this.lastMoveDir === 2) ? 1.0 : 0.0; // Moved East
    s[36] = (this.lastMoveDir === 3) ? 1.0 : 0.0; // Moved West
  }

  /**
   * Decode neural logits into chosen action with temperature-controlled Softmax sampling
   */
  selectAction(logits, temperature = 0.5) {
    let maxLogit = -Infinity;
    for (let i = 0; i < logits.length; i++) {
      if (logits[i] > maxLogit) maxLogit = logits[i];
    }

    let sumExp = 0;
    const invTemp = 1.0 / Math.max(0.1, temperature);
    for (let i = 0; i < logits.length; i++) {
      sumExp += Math.exp((logits[i] - maxLogit) * invTemp);
    }

    const r = Math.random() * sumExp;
    let accum = 0;
    for (let i = 0; i < logits.length; i++) {
      accum += Math.exp((logits[i] - maxLogit) * invTemp);
      if (r <= accum) return i;
    }

    return ACTIONS.IDLE;
  }

  /**
   * Execute physical action and deduct realistic metabolic energy
   */
  act(action, grid) {
    this.lastAction = action;
    let success = 1.0;

    // Microclimate thermal relief: moist soils reduce basal metabolic drain and thermal stress
    const currentMoisture = grid.getMoisture(this.x, this.y);
    const relief = Math.min(CONFIG.MOISTURE_METABOLIC_RELIEF, currentMoisture * CONFIG.MOISTURE_METABOLIC_RELIEF);
    const effectiveDrain = CONFIG.BASAL_METABOLIC_DRAIN * (1.0 - relief);
    this.energy -= effectiveDrain;

    // Environmental exposure: hostile coastal perimeter inflicts harsh metabolic drain
    if (grid.isCoastal(this.x, this.y)) {
      this.energy -= CONFIG.COASTAL_EXPOSURE_DRAIN;
    }

    switch (action) {
      case ACTIONS.IDLE: {
        // Rest: minimal energy expenditure
        success = 1.0;
        break;
      }

      case ACTIONS.MOVE_NORTH:
      case ACTIONS.MOVE_SOUTH:
      case ACTIONS.MOVE_EAST:
      case ACTIONS.MOVE_WEST: {
        let dx = 0, dy = 0, moveDir = 0;
        if (action === ACTIONS.MOVE_NORTH) { dy = -1; moveDir = 0; }
        else if (action === ACTIONS.MOVE_SOUTH) { dy = 1; moveDir = 1; }
        else if (action === ACTIONS.MOVE_EAST) { dx = 1; moveDir = 2; }
        else if (action === ACTIONS.MOVE_WEST) { dx = -1; moveDir = 3; }

        const targetX = this.x + dx;
        const targetY = this.y + dy;

        // Boundary check
        if (!grid.inBounds(targetX, targetY)) {
          this.energy -= CONFIG.MOVE_ENERGY_BASE * 0.5; // Bump into wall penalty
          this.lastMoveDir = -1;
          success = 0.0;
          break;
        }

        // Occupancy collision check
        const targetOccupant = grid.getOccupant(targetX, targetY);
        if (targetOccupant >= 0 && targetOccupant !== this.id) {
          this.energy -= CONFIG.MOVE_ENERGY_BASE * 0.5; // Collision penalty
          this.lastMoveDir = -1;
          success = 0.0;
          break;
        }

        // Slope & terrain movement physics
        const curElev = grid.getElevation(this.x, this.y);
        const targetElev = grid.getElevation(targetX, targetY);
        const deltaElev = targetElev - curElev;

        // Highway bonus: compacted trails reduce movement cost
        const targetTrample = grid.getTrample(targetX, targetY);
        const highwayBonus = 1.0 - (0.3 * targetTrample);

        // Water resistance: wading in water costs more
        const waterDepth = grid.getWater(targetX, targetY);
        const waterPenalty = waterDepth > 0.4 ? waterDepth * 1.2 : 0;

        // Familiar territory / scent highway bonus: moving along scented corridors stabilizes navigation
        const targetScent = grid.getScent(targetX, targetY);
        const scentBonus = targetScent > 0.2 ? 0.92 : 1.0;

        let moveCost = (CONFIG.MOVE_ENERGY_BASE * highwayBonus + waterPenalty) * scentBonus;
        if (deltaElev > 0) {
          moveCost += deltaElev * 1.5; // Uphill climb cost
        } else {
          moveCost *= 0.85; // Downhill relief
        }

        // Momentum inertia bonus & 180-degree turn resistance (prevents spastic 1-tile oscillation)
        if (this.lastMoveDir === moveDir) {
          moveCost *= 0.85; // Inertia bonus for continuing along same vector
        } else if (
          (this.lastMoveDir === 0 && moveDir === 1) ||
          (this.lastMoveDir === 1 && moveDir === 0) ||
          (this.lastMoveDir === 2 && moveDir === 3) ||
          (this.lastMoveDir === 3 && moveDir === 2)
        ) {
          moveCost *= 1.30; // Resistance cost to immediately reverse direction
        }

        this.energy -= moveCost;

        // Leave trampled trail on departed cell
        grid.addTrample(this.x, this.y, CONFIG.TRAMPLE_DEPOSIT);

        // Move agent
        grid.clearOccupant(this.x, this.y);
        this.x = targetX;
        this.y = targetY;
        grid.setOccupant(this.x, this.y, this.id);

        this.lastMoveDir = moveDir;
        success = 1.0;
        break;
      }

      case ACTIONS.GRAZE: {
        this.lastMoveDir = -1;
        const curBiomass = grid.getBiomass(this.x, this.y);
        if (curBiomass > 0.02) {
          const biteSize = Math.min(curBiomass, 0.35);
          const energyGained = biteSize * CONFIG.GRAZE_MAX_INTAKE;
          
          grid.setBiomass(this.x, this.y, curBiomass - biteSize);
          this.energy = Math.min(CONFIG.MAX_ENERGY, this.energy + energyGained);
          this.biomassEaten += biteSize;
          success = 1.0;
        } else {
          // Attempted to graze on barren land
          this.energy -= 0.1;
          success = 0.0;
        }
        break;
      }

      case ACTIONS.DIG_TRENCH: {
        this.energy -= CONFIG.TERRAFORM_ENERGY_COST;
        const elev = grid.getElevation(this.x, this.y);
        if (elev > 0.05) {
          grid.setElevation(this.x, this.y, elev - 0.05);
          this.trenchesDug++;

          // Subterranean root excavation: virgin fertile loam unearths edible roots/tubers
          const fertility = grid.getFertility(this.x, this.y);
          if (fertility > 0.25) {
            const trample = grid.getTrample(this.x, this.y);
            // Diminishing returns: deeper trenches or heavily trampled soil have already been excavated
            const depthPenalty = Math.max(0.1, (elev - 0.05) / 0.8);
            const rootYield = fertility * CONFIG.ROOT_HARVEST_MAX * Math.max(0.1, 1.0 - trample) * depthPenalty;
            this.energy = Math.min(CONFIG.MAX_ENERGY, this.energy + rootYield);
            this.rootsHarvested += rootYield;
            this.biomassEaten += (rootYield / CONFIG.GRAZE_MAX_INTAKE);
          }

          success = 1.0;
        } else {
          success = 0.0;
        }
        break;
      }

      case ACTIONS.MOUND_EARTH: {
        const elev = grid.getElevation(this.x, this.y);
        // Agents cannot mound earth beyond hill height into alpine peaks
        if (elev < CONFIG.TERRAFORM_MAX_ELEVATION) {
          this.energy -= CONFIG.TERRAFORM_ENERGY_COST;
          grid.setElevation(this.x, this.y, elev + 0.04);
          success = 1.0;
        } else {
          // Blocked: cannot mound higher
          this.energy -= 0.1;
          success = 0.0;
        }
        break;
      }

      case ACTIONS.EMIT_SCENT: {
        this.energy -= CONFIG.SCENT_COST;
        grid.addScent(this.x, this.y, CONFIG.SCENT_DEPOSIT);
        success = 1.0;
        break;
      }

      default:
        success = 0.0;
        break;
    }

    this.lastActionResult = success;
  }

  /**
   * Main per-tick agent lifecycle update
   */
  tick(grid) {
    if (this.isDead) return;

    this.age++;

    // 1. Gather sensory perceptions
    this.sense(grid);

    // 2. Compute decision via recurrent neural brain
    const logits = this.brain.feedForward(this.sensorBuffer);
    const action = this.selectAction(logits);

    // 3. Act in the physical world
    this.act(action, grid);

    // 4. Mortality check: starvation or senescence
    if (this.energy <= 0 || this.age >= CONFIG.MAX_AGE) {
      this.die(grid);
    }
  }

  /**
   * Check if ready to reproduce and create offspring (sexual crossover if mate nearby, else asexual clone)
   * @param {Grid} grid
   * @param {number} nextAgentId
   * @param {Simulation|null} simulation Optional simulation ref to locate nearby mates
   * @returns {Agent|null} New child agent or null if reproduction was not possible
   */
  checkReproduction(grid, nextAgentId, simulation = null) {
    if (this.isDead || this.energy < CONFIG.REPRODUCTION_THRESHOLD) {
      return null;
    }

    // Find an empty adjacent tile
    const directions = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 }
    ];

    // Shuffle directions to avoid spatial bias
    for (let i = directions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = directions[i];
      directions[i] = directions[j];
      directions[j] = temp;
    }

    for (const dir of directions) {
      const cx = this.x + dir.dx;
      const cy = this.y + dir.dy;

      if (grid.inBounds(cx, cy) && !grid.isCoastal(cx, cy) && grid.getOccupant(cx, cy) === -1 && grid.getWater(cx, cy) < 0.6) {
        // Split energy 50/50
        const childEnergy = this.energy * CONFIG.REPRODUCTION_SPLIT;
        this.energy -= childEnergy;

        // Search for a nearby mature mate within radius 2 for sexual crossover
        let mateBrain = null;
        if (simulation && simulation.getAgentById) {
          for (let my = -2; my <= 2; my++) {
            for (let mx = -2; mx <= 2; mx++) {
              if (mx === 0 && my === 0) continue;
              const tx = this.x + mx;
              const ty = this.y + my;
              if (grid.inBounds(tx, ty)) {
                const occId = grid.getOccupant(tx, ty);
                if (occId > 0 && occId !== this.id) {
                  const mate = simulation.getAgentById(occId);
                  if (mate && !mate.isDead && mate.age >= 30) {
                    mateBrain = mate.brain;
                    break;
                  }
                }
              }
            }
            if (mateBrain) break;
          }
        }

        // Sexual crossover if mate found, otherwise asexual clone
        let childBrain;
        if (mateBrain) {
          childBrain = NeuralNet.crossover(this.brain, mateBrain);
        } else {
          childBrain = this.brain.clone();
        }

        const isRad = Boolean(simulation && simulation.isRadiationMode);
        const radMult = isRad ? (simulation.radiationMultiplier || 4.0) : 1.0;
        const mutRate = CONFIG.MUTATION_RATE_DEFAULT * radMult;
        const mutStrength = isRad ? 0.45 : 0.2;
        childBrain.mutate(mutRate, mutStrength);

        const child = new Agent(nextAgentId, cx, cy, childBrain);
        child.energy = childEnergy;
        child.generation = this.generation + 1;
        child.species = this.species;

        this.offspringCount++;

        // Place on grid
        grid.setOccupant(cx, cy, child.id);
        return child;
      }
    }

    return null;
  }

  /**
   * Handle death and organic decomposition
   */
  die(grid) {
    this.isDead = true;
    grid.clearOccupant(this.x, this.y);

    // Return organic fertility to soil
    const currentFertility = grid.getFertility(this.x, this.y);
    grid.setFertility(this.x, this.y, currentFertility + 0.25);
  }

  // --- Serialization ---

  toJSON() {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      energy: this.energy,
      age: this.age,
      generation: this.generation,
      species: this.species,
      color: this.color,
      biomassEaten: this.biomassEaten,
      offspringCount: this.offspringCount,
      trenchesDug: this.trenchesDug,
      rootsHarvested: this.rootsHarvested,
      brain: this.brain.toJSON()
    };
  }

  static fromJSON(json) {
    const brain = NeuralNet.fromJSON(json.brain);
    const agent = new Agent(json.id, json.x, json.y, brain);
    agent.energy = json.energy;
    agent.age = json.age;
    agent.generation = json.generation;
    agent.species = json.species;
    if (json.biomassEaten !== undefined) agent.biomassEaten = json.biomassEaten;
    if (json.offspringCount !== undefined) agent.offspringCount = json.offspringCount;
    if (json.trenchesDug !== undefined) agent.trenchesDug = json.trenchesDug;
    if (json.rootsHarvested !== undefined) agent.rootsHarvested = json.rootsHarvested;
    if (json.color) agent.color = json.color;
    return agent;
  }
}

