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
    this.sensorBuffer = new Float32Array(CONFIG.NN_INPUT_SIZE || 29);
    this.lastActionResult = 1.0;
    this.lastAction = ACTIONS.IDLE;

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
    for (let d = 0; d < 4; d++) {
      s[d] = (grid.getElevation(nx[d], ny[d]) - curElev) * 2.0; // Scaled to [-1, 1]
    }

    // [4..7]: Local Moisture
    for (let d = 0; d < 4; d++) {
      s[4 + d] = grid.getMoisture(nx[d], ny[d]);
    }

    // [8..11]: Local Biomass
    for (let d = 0; d < 4; d++) {
      s[8 + d] = grid.getBiomass(nx[d], ny[d]);
    }

    // [12..15]: Local Trample Compaction
    for (let d = 0; d < 4; d++) {
      s[12 + d] = grid.getTrample(nx[d], ny[d]);
    }

    // [16..19]: Local Scent
    for (let d = 0; d < 4; d++) {
      s[16 + d] = grid.getScent(nx[d], ny[d]);
    }

    // [20..23]: Neighbor Occupancy (1.0 if occupied, 0.0 if free)
    for (let d = 0; d < 4; d++) {
      const occ = grid.getOccupant(nx[d], ny[d]);
      s[20 + d] = (occ >= 0 && occ !== this.id) ? 1.0 : 0.0;
    }

    // [24]: Current Tile Biomass
    s[24] = grid.getBiomass(x, y);

    // [25]: Current Tile Water Depth
    s[25] = grid.getWater(x, y);

    // [26]: Agent Energy Ratio [0, 1]
    s[26] = Math.min(1.0, this.energy / CONFIG.MAX_ENERGY);

    // [27]: Agent Age Ratio [0, 1]
    s[27] = Math.min(1.0, this.age / CONFIG.MAX_AGE);

    // [28]: Feedback of last action success
    s[28] = this.lastActionResult;
  }

  /**
   * Decode neural logits into chosen action (Argmax)
   */
  selectAction(logits) {
    let maxVal = -Infinity;
    let bestAction = ACTIONS.IDLE;
    for (let i = 0; i < logits.length; i++) {
      if (logits[i] > maxVal) {
        maxVal = logits[i];
        bestAction = i;
      }
    }
    return bestAction;
  }

  /**
   * Execute physical action and deduct realistic metabolic energy
   */
  act(action, grid) {
    this.lastAction = action;
    let success = 1.0;

    // Baseline basal metabolic drain (always applies)
    this.energy -= CONFIG.BASAL_METABOLIC_DRAIN;

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
        let dx = 0, dy = 0;
        if (action === ACTIONS.MOVE_NORTH) dy = -1;
        else if (action === ACTIONS.MOVE_SOUTH) dy = 1;
        else if (action === ACTIONS.MOVE_EAST) dx = 1;
        else if (action === ACTIONS.MOVE_WEST) dx = -1;

        const targetX = this.x + dx;
        const targetY = this.y + dy;

        // Boundary check
        if (!grid.inBounds(targetX, targetY)) {
          this.energy -= CONFIG.MOVE_ENERGY_BASE * 0.5; // Bump into wall penalty
          success = 0.0;
          break;
        }

        // Occupancy collision check
        const targetOccupant = grid.getOccupant(targetX, targetY);
        if (targetOccupant >= 0 && targetOccupant !== this.id) {
          this.energy -= CONFIG.MOVE_ENERGY_BASE * 0.5; // Collision penalty
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

        let moveCost = CONFIG.MOVE_ENERGY_BASE * highwayBonus + waterPenalty;
        if (deltaElev > 0) {
          moveCost += deltaElev * 1.5; // Uphill climb cost
        } else {
          moveCost *= 0.85; // Downhill relief
        }

        this.energy -= moveCost;

        // Leave trampled trail on departed cell
        grid.addTrample(this.x, this.y, CONFIG.TRAMPLE_DEPOSIT);

        // Move agent
        grid.clearOccupant(this.x, this.y);
        this.x = targetX;
        this.y = targetY;
        grid.setOccupant(this.x, this.y, this.id);

        success = 1.0;
        break;
      }

      case ACTIONS.GRAZE: {
        const curBiomass = grid.getBiomass(this.x, this.y);
        if (curBiomass > 0.02) {
          const biteSize = Math.min(curBiomass, 0.35);
          const energyGained = biteSize * CONFIG.GRAZE_MAX_INTAKE;
          
          grid.setBiomass(this.x, this.y, curBiomass - biteSize);
          this.energy = Math.min(CONFIG.MAX_ENERGY, this.energy + energyGained);
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
          success = 1.0;
        } else {
          success = 0.0;
        }
        break;
      }

      case ACTIONS.MOUND_EARTH: {
        this.energy -= CONFIG.TERRAFORM_ENERGY_COST;
        const elev = grid.getElevation(this.x, this.y);
        if (elev < 0.95) {
          grid.setElevation(this.x, this.y, elev + 0.05);
          success = 1.0;
        } else {
          success = 0.0;
        }
        break;
      }

      case ACTIONS.EMIT_SCENT: {
        this.energy -= 0.15;
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
   * Check if ready to reproduce and create mutated offspring
   * @param {Grid} grid
   * @param {number} nextAgentId
   * @returns {Agent|null} New child agent or null if reproduction was not possible
   */
  checkReproduction(grid, nextAgentId) {
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

      if (grid.inBounds(cx, cy) && grid.getOccupant(cx, cy) === -1 && grid.getWater(cx, cy) < 0.6) {
        // Split energy 50/50
        const childEnergy = this.energy * CONFIG.REPRODUCTION_SPLIT;
        this.energy -= childEnergy;

        // Clone and mutate neural network
        const childBrain = this.brain.clone();
        childBrain.mutate(CONFIG.MUTATION_RATE_DEFAULT, 0.2);

        const child = new Agent(nextAgentId, cx, cy, childBrain);
        child.energy = childEnergy;
        child.generation = this.generation + 1;
        child.species = this.species;

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
    if (json.color) agent.color = json.color;
    return agent;
  }
}

