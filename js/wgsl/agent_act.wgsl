// Biome Shifters — WebGPU Agent Action Execution & Spatial Atomic Collisions
// Applies chosen actions directly to VRAM terrain layers with atomic spatial collision resolution.

struct ActUniforms {
  width:                    u32, // Grid width
  height:                   u32, // Grid height
  agentCount:               u32, // Active agents
  coastalBorderWidth:       u32, // Hostile perimeter width (3)
  coastalExposureDrain:     f32, // 0.35
  basalMetabolicDrain:      f32, // 0.20
  moistureMetabolicRelief:  f32, // 0.40
  aquaticSafeDepth:         f32, // 0.15
  aquaticExposureDrain:     f32, // 0.35
  stationaryTrampleDeposit: f32, // 0.04
  moveEnergyBase:           f32, // 0.28
  trampleDeposit:           f32, // 0.25
  grazeMaxIntake:           f32, // 20.0
  fertilityGrazeDepletion:  f32, // 0.005
  terraformEnergyCost:      f32, // 2.5
  terraformMaxElevation:    f32, // 0.72
  rootHarvestMax:           f32, // 4.5
  scentCost:                f32, // 0.08
  scentDeposit:             f32, // 1.0
  seedSowCost:              f32, // 2.5
  seedGermMinMoisture:      f32, // 0.30
  seedGermMaxTrample:       f32, // 0.45
  seedGermBiomass:          f32, // 0.04
  maxEnergy:                f32, // 250.0
};

struct AgentState {
  x:            u32,
  y:            u32,
  energy:       f32,
  age:          u32,
  generation:   u32,
  id:           u32,
  alive:        u32,
  lastAction:   u32,
  lastSuccess:  f32,
  lastMoveDir:  i32,
  fitness:      f32,
  speciesR:     f32,
  speciesG:     f32,
  speciesB:     f32,
  seedsSown:    u32,
  biomassEaten: f32,
};

struct AgentOutput {
  chosenAction: u32,
  pad0:         u32,
  pad1:         u32,
  pad2:         u32,
  logits:       array<f32, 10>,
  pad3:         f32,
  pad4:         f32,
};

@group(0) @binding(0)  var<storage, read_write> elevation:    array<f32>;
@group(0) @binding(1)  var<storage, read>       water:        array<f32>;
@group(0) @binding(2)  var<storage, read>       moisture:     array<f32>;
@group(0) @binding(3)  var<storage, read_write> biomass:      array<f32>;
@group(0) @binding(4)  var<storage, read_write> trample:      array<f32>;
@group(0) @binding(5)  var<storage, read_write> fertility:    array<f32>;
@group(0) @binding(6)  var<storage, read_write> scent:        array<f32>;
@group(0) @binding(7)  var<storage, read_write> occupancy:    array<atomic<i32>>;
@group(0) @binding(8)  var<storage, read_write> agentState:   array<AgentState>;
@group(0) @binding(9)  var<storage, read>       agentOutputs: array<AgentOutput>;
@group(0) @binding(10) var<uniform>             u:            ActUniforms;
// actionStats layout: [0]=idle [1]=move [2]=moveCollisions [3]=graze [4]=grazeFailures
//                      [5]=digTrench [6]=moundEarth [7]=emitScent [8]=sowSeeds [9]=sowFailures
@group(0) @binding(11) var<storage, read_write> actionStats:  array<atomic<u32>>;

fn in_bounds(x: i32, y: i32, w: i32, h: i32) -> bool {
  return x >= 0 && x < w && y >= 0 && y < h;
}

fn get_idx(x: i32, y: i32, w: i32) -> u32 {
  return u32(y * w + x);
}

fn is_coastal(x: i32, y: i32, margin: i32, w: i32, h: i32) -> bool {
  return x < margin || x >= (w - margin) || y < margin || y >= (h - margin);
}

@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let agent_idx = id.x;
  if (agent_idx >= u.agentCount) {
    return;
  }
  let state = agentState[agent_idx];
  if (state.alive == 0u) {
    return;
  }

  var x = i32(state.x);
  var y = i32(state.y);
  let w = i32(u.width);
  let h = i32(u.height);
  let cur_idx = get_idx(x, y, w);

  var energy = state.energy;
  var lastMoveDir = state.lastMoveDir;
  var seedsSown = state.seedsSown;
  var biomassEaten = state.biomassEaten;
  var success = 1.0;
  let action = agentOutputs[agent_idx].chosenAction;

  // 1. Basal metabolic drain with microclimate thermal relief
  let cur_moist = moisture[cur_idx];
  let relief = min(u.moistureMetabolicRelief, cur_moist * u.moistureMetabolicRelief);
  let effective_drain = u.basalMetabolicDrain * (1.0 - relief);
  energy -= effective_drain;

  // 2. Coastal exposure drain
  if (is_coastal(x, y, i32(u.coastalBorderWidth), w, h)) {
    energy -= u.coastalExposureDrain;
  }

  // 3. Aquatic submersion fatigue
  let cur_water = water[cur_idx];
  if (cur_water > u.aquaticSafeDepth) {
    let submersion = cur_water - u.aquaticSafeDepth;
    energy -= submersion * u.aquaticExposureDrain;
  }

  // 4. Stationary soil trampling for non-movement actions
  if (action != 1u && action != 2u && action != 3u && action != 4u) {
    trample[cur_idx] = min(1.0, trample[cur_idx] + u.stationaryTrampleDeposit);
  }

  // 5. Action Execution
  switch (action) {
    case 0u: {
      // ACTIONS.IDLE: rest
      success = 1.0;
    }
    case 1u, 2u, 3u, 4u: {
      // ACTIONS.MOVE_NORTH (1), SOUTH (2), EAST (3), WEST (4)
      var dx = 0;
      var dy = 0;
      var moveDir = 0;
      if (action == 1u) { dy = -1; moveDir = 0; }
      else if (action == 2u) { dy = 1; moveDir = 1; }
      else if (action == 3u) { dx = 1; moveDir = 2; }
      else if (action == 4u) { dx = -1; moveDir = 3; }

      let targetX = x + dx;
      let targetY = y + dy;

      if (!in_bounds(targetX, targetY, w, h)) {
        // Boundary wall bump penalty
        energy -= u.moveEnergyBase * 0.5;
        lastMoveDir = -1;
        success = 0.0;
      } else {
        let target_idx = get_idx(targetX, targetY, w);

        // Atomic occupancy test: try to claim target tile (with retry against spurious CAS failure)
        var exch = atomicCompareExchangeWeak(&occupancy[target_idx], -1, i32(agent_idx));
        if (!exch.exchanged && exch.old_value == -1) {
          exch = atomicCompareExchangeWeak(&occupancy[target_idx], -1, i32(agent_idx));
        }
        if (!exch.exchanged && exch.old_value != i32(agent_idx)) {
          // Target tile is already occupied
          energy -= u.moveEnergyBase * 0.5;
          lastMoveDir = -1;
          success = 0.0;
        } else {
          // Terrain movement physics
          let curElev = elevation[cur_idx];
          let targetElev = elevation[target_idx];
          let deltaElev = targetElev - curElev;

          let targetTrample = trample[target_idx];
          let highwayBonus = 1.0 - (0.3 * targetTrample);

          let targetWater = water[target_idx];
          var waterPenalty = 0.0;
          if (targetWater > 0.4) {
            waterPenalty = targetWater * 1.2;
          }

          let targetScent = scent[target_idx];
          var scentBonus = 1.0;
          if (targetScent > 0.2) {
            scentBonus = 0.92;
          }

          var moveCost = (u.moveEnergyBase * highwayBonus + waterPenalty) * scentBonus;
          if (deltaElev > 0.0) {
            moveCost += deltaElev * 1.5;
          } else {
            moveCost *= 0.85;
          }

          // Momentum inertia & 180-degree turn reversal resistance
          if (lastMoveDir == moveDir) {
            moveCost *= 0.85;
          } else if (
            (lastMoveDir == 0 && moveDir == 1) ||
            (lastMoveDir == 1 && moveDir == 0) ||
            (lastMoveDir == 2 && moveDir == 3) ||
            (lastMoveDir == 3 && moveDir == 2)
          ) {
            moveCost *= 1.30;
          }

          energy -= moveCost;

          // Leave trample trail on departed cell
          trample[cur_idx] = min(1.0, trample[cur_idx] + u.trampleDeposit);

          // Clear departed cell occupancy (guaranteed atomic release)
          atomicStore(&occupancy[cur_idx], -1);

          x = targetX;
          y = targetY;
          lastMoveDir = moveDir;
          success = 1.0;
        }
      }
    }
    case 5u: {
      // ACTIONS.GRAZE
      lastMoveDir = -1;
      let cur_bio = biomass[cur_idx];
      if (cur_bio > 0.02) {
        let bite_size = min(cur_bio, 0.35);
        let energy_gained = bite_size * u.grazeMaxIntake;
        biomass[cur_idx] = cur_bio - bite_size;
        energy = min(u.maxEnergy, energy + energy_gained);
        biomassEaten += bite_size;

        let cur_fert = fertility[cur_idx];
        if (cur_fert > 0.05) {
          fertility[cur_idx] = max(0.05, cur_fert - u.fertilityGrazeDepletion);
        }
        success = 1.0;
      } else {
        energy -= 0.1;
        success = 0.0;
      }
    }
    case 6u: {
      // ACTIONS.DIG_TRENCH
      energy -= u.terraformEnergyCost;
      let elev = elevation[cur_idx];
      if (elev > 0.05) {
        elevation[cur_idx] = elev - 0.05;

        // Subterranean root excavation on virgin fertile loam
        let cur_fert = fertility[cur_idx];
        if (cur_fert > 0.25) {
          let cur_tramp = trample[cur_idx];
          let depth_penalty = max(0.1, (elev - 0.05) / 0.8);
          let root_yield = cur_fert * u.rootHarvestMax * max(0.1, 1.0 - cur_tramp) * depth_penalty;
          energy = min(u.maxEnergy, energy + root_yield);
          biomassEaten += (root_yield / u.grazeMaxIntake);
        }
        success = 1.0;
      } else {
        success = 0.0;
      }
    }
    case 7u: {
      // ACTIONS.MOUND_EARTH
      let elev = elevation[cur_idx];
      if (elev < u.terraformMaxElevation) {
        energy -= u.terraformEnergyCost;
        elevation[cur_idx] = elev + 0.04;
        success = 1.0;
      } else {
        energy -= 0.1;
        success = 0.0;
      }
    }
    case 8u: {
      // ACTIONS.EMIT_SCENT
      energy -= u.scentCost;
      scent[cur_idx] = min(1.0, scent[cur_idx] + u.scentDeposit);
      success = 1.0;
    }
    case 9u: {
      // ACTIONS.SOW_SEEDS
      energy -= u.seedSowCost;
      let moist = moisture[cur_idx];
      let fert = fertility[cur_idx];
      let trample_val = trample[cur_idx];
      let cur_bio = biomass[cur_idx];

      if (
        moist >= u.seedGermMinMoisture &&
        fert > 0.20 &&
        trample_val <= u.seedGermMaxTrample &&
        cur_bio < 0.15 &&
        !is_coastal(x, y, i32(u.coastalBorderWidth), w, h)
      ) {
        biomass[cur_idx] = u.seedGermBiomass;
        seedsSown += 1u;
        success = 1.0;
      } else {
        success = 0.0;
      }
    }
    default: {
      success = 0.0;
    }
  }

  // Accumulate per-window action telemetry (mirrors CPU dynamicsAccumulator.actions)
  if (action == 0u) {
    atomicAdd(&actionStats[0], 1u);
  } else if (action >= 1u && action <= 4u) {
    atomicAdd(&actionStats[1], 1u);
    if (success == 0.0) { atomicAdd(&actionStats[2], 1u); }
  } else if (action == 5u) {
    atomicAdd(&actionStats[3], 1u);
    if (success == 0.0) { atomicAdd(&actionStats[4], 1u); }
  } else if (action == 6u) {
    atomicAdd(&actionStats[5], 1u);
  } else if (action == 7u) {
    atomicAdd(&actionStats[6], 1u);
  } else if (action == 8u) {
    atomicAdd(&actionStats[7], 1u);
  } else if (action == 9u) {
    atomicAdd(&actionStats[8], 1u);
    if (success == 0.0) { atomicAdd(&actionStats[9], 1u); }
  }

  // Update Agent State
  agentState[agent_idx].x = u32(x);
  agentState[agent_idx].y = u32(y);
  agentState[agent_idx].energy = energy;
  agentState[agent_idx].lastAction = action;
  agentState[agent_idx].lastSuccess = success;
  agentState[agent_idx].lastMoveDir = lastMoveDir;
  agentState[agent_idx].seedsSown = seedsSown;
  agentState[agent_idx].biomassEaten = biomassEaten;
}
