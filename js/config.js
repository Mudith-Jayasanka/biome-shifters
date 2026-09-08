/**
 * Biome Shifters — Global Simulation Configuration & Constants
 * Reference: docs/SPECIFICATION.md
 */

export const CONFIG = {
  // Grid Dimensions
  GRID_WIDTH: 128,
  GRID_HEIGHT: 128,
  CELL_SIZE_PX: 6,           // Render pixel size per cell at 1x zoom

  // Coastal Perimeter & Boundary Containment
  COASTAL_BORDER_WIDTH: 3,        // Margin width in tiles of hostile coastal perimeter
  COASTAL_EXPOSURE_DRAIN: 0.35,   // Additional metabolic drain per tick for lingering in coastal zone

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
  SCENT_COST: 0.08,          // Energy cost to emit territorial/navigation scent

  // Agent Energetics
  INITIAL_ENERGY: 100,
  MAX_ENERGY: 250,
  REPRODUCTION_THRESHOLD: 115,
  REPRODUCTION_SPLIT: 0.5,   // Parent gives 50% energy to child
  BASAL_METABOLIC_DRAIN: 0.20,
  MOISTURE_METABOLIC_RELIEF: 0.40, // Up to 40% metabolic drain relief in moist soils/trenches
  MOVE_ENERGY_BASE: 0.28,
  TERRAFORM_ENERGY_COST: 2.5,      // Reduced upfront excavation cost
  ROOT_HARVEST_MAX: 4.5,           // Max energy recovered from subterranean roots/tubers on rich virgin soil (Net +2.0 ROI)
  GRAZE_MAX_INTAKE: 20.0,    // Max energy extracted from 1.0 biomass
  MAX_AGE: 1800,             // Max lifespan in ticks

  // Neural Network Dimensions
  NN_INPUT_SIZE: 37,
  NN_HIDDEN_SIZE: 24,
  NN_OUTPUT_SIZE: 10,
  MUTATION_RATE_DEFAULT: 0.08,

  // Action Space & Agriculture
  SEED_SOW_COST: 2.5,                // Caloric investment to deposit viable seeds
  SEED_GERM_MIN_MOISTURE: 0.30,      // Minimum soil moisture required for germination
  SEED_GERM_MAX_TRAMPLE: 0.45,       // High soil compaction crushes delicate seeds
  SEED_GERM_BIOMASS: 0.20,           // Initial sapling biomass created on successful germination

  // Population Scaling & Floor Limits
  INITIAL_POPULATION: 200,
  MIN_POPULATION_FLOOR: 100,
  MAX_POPULATION: 800,

  // Performance & Turbo Mode Throttling
  TURBO_UI_FPS: 4,           // Canvas & UI refresh rate in Turbo mode to dedicate CPU to simulation
  TURBO_BATCH_SIZE: 50,      // Simulation ticks executed per microtask pump in Turbo mode

  // Satellite Camera Preview Snapshots (Native 1:1 Grid & Lossless PNG)
  SNAPSHOT_WIDTH: 128,          // Native 1:1 simulation grid width
  SNAPSHOT_HEIGHT: 128,         // Native 1:1 simulation grid height
  SNAPSHOT_FORMAT: 'image/png'  // Lossless PNG encoding for razor-sharp pixel rendering
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
  EMIT_SCENT: 8,
  SOW_SEEDS: 9
};

