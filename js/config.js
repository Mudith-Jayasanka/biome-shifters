/**
 * Biome Shifters — Global Simulation Configuration & Constants
 * Reference: docs/SPECIFICATION.md
 */

export const CONFIG = {
  // Grid Dimensions
  GRID_WIDTH: 128,
  GRID_HEIGHT: 128,
  CELL_SIZE_PX: 6,           // Render pixel size per cell at 1x zoom

  // Hydrology & Moisture CA
  WATER_FLOW_RATE: 0.25,     // Fraction of water transferred downhill per tick
  WATER_EVAP_RATE: 0.002,    // Fraction of standing water evaporated per tick
  RAIN_PROBABILITY: 0.08,    // Chance per tick of rain deposit in random patch
  RAIN_INTENSITY: 0.35,      // Volume of water deposited by rain
  SOIL_INFILTRATION: 0.08,   // Surface water converting into subsurface moisture
  MOISTURE_DIFFUSION: 0.05,  // Lateral soil moisture diffusion rate
  MOISTURE_DRYING: 0.001,    // Baseline drying rate of soil

  // Geological Weathering & Erosion CA
  TERRAFORM_MAX_ELEVATION: 0.72,  // Maximum elevation agents can artificially mound
  SOIL_CREEP_THRESHOLD: 0.08,     // Slope difference threshold for gravitational soil creep
  SOIL_CREEP_RATE: 0.02,          // Rate at which steep mounds relax into adjacent lower cells
  EROSION_HYDRAULIC_RATE: 0.001,  // Sediment carrying capacity of water runoff
  EROSION_BASE_WEATHERING: 0.00005,// Slow geological relaxation towards baseline bedrock

  // Vegetation (Biomass) CA
  BIOMASS_GROWTH_RATE: 0.02, // Base logistic growth rate r
  BIOMASS_MAX: 1.0,          // Carrying capacity K
  BIOMASS_SPREAD_CHANCE: 0.008,// Probability of seed colonizing adjacent fertile tile
  TRAMPLE_RESISTANCE: 0.7,   // How much biomass mitigates trampling compaction

  // Soil Trampling & Trails
  TRAMPLE_DEPOSIT: 0.25,     // Compaction added per agent step
  TRAMPLE_DECAY: 0.0015,     // Rate at which nature reclaims trampled trails

  // Pheromones / Scent
  SCENT_DEPOSIT: 1.0,
  SCENT_EVAPORATION: 0.02,
  SCENT_DIFFUSION: 0.04,

  // Agent Energetics
  INITIAL_ENERGY: 100,
  MAX_ENERGY: 250,
  REPRODUCTION_THRESHOLD: 115,
  REPRODUCTION_SPLIT: 0.5,   // Parent gives 50% energy to child
  BASAL_METABOLIC_DRAIN: 0.20,
  MOVE_ENERGY_BASE: 0.28,
  TERRAFORM_ENERGY_COST: 3.5,
  GRAZE_MAX_INTAKE: 20.0,    // Max energy extracted from 1.0 biomass
  MAX_AGE: 1800,             // Max lifespan in ticks

  // Neural Network Dimensions
  NN_INPUT_SIZE: 37,
  NN_HIDDEN_SIZE: 24,
  NN_OUTPUT_SIZE: 9,
  MUTATION_RATE_DEFAULT: 0.08,

  // Population Scaling & Floor Limits
  INITIAL_POPULATION: 200,
  MIN_POPULATION_FLOOR: 100,
  MAX_POPULATION: 800
};

export const ACTIONS = {
  IDLE: 0,
  MOVE_NORTH: 1,
  MOVE_SOUTH: 2,
  MOVE_EAST: 3,
  MOVE_WEST: 4,
  GRAZE: 5,
  DIG_TRENCH: 6,
  MOUND_EARTH: 7,
  EMIT_SCENT: 8
};

