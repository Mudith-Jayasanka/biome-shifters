// Biome Shifters — WebGPU Agent Lifecycle, Energy Economics & Genetic Mutation/Crossover
// Parallel aging, mortality culling, reproduction slot claiming, sexual crossover & mutation in VRAM.

struct LifecycleUniforms {
  width:                 u32, // Grid width
  height:                u32, // Grid height
  agentCount:            u32, // Active scan count
  maxPopulation:         u32, // 800
  coastalBorderWidth:    u32, // 3
  maxAge:                u32, // 1800
  tickCount:             u32, // Simulation tick
  seed:                  u32, // PRNG seed
  reproductionThreshold: f32, // 115.0
  reproductionSplit:     f32, // 0.5
  mutationRate:          f32, // 0.08
  mutationStrength:      f32, // 0.20
};

struct LifecycleGlobals {
  nextAgentId:      atomic<u32>,
  livingCount:      atomic<u32>,
  birthCount:       atomic<u32>,
  deathsStarvation: atomic<u32>,
  deathsAge:        atomic<u32>,
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

@group(0) @binding(0) var<storage, read>       elevation:    array<f32>;
@group(0) @binding(1) var<storage, read>       water:        array<f32>;
@group(0) @binding(2) var<storage, read_write> occupancy:    array<atomic<i32>>;
@group(0) @binding(3) var<storage, read_write> agentState:   array<AgentState>;
@group(0) @binding(4) var<storage, read_write> agentWeights: array<f32>;
@group(0) @binding(5) var<storage, read_write> agentHidden:  array<f32>;
@group(0) @binding(6) var<storage, read_write> slotOccupied: array<atomic<u32>>;
@group(0) @binding(7) var<storage, read_write> globals:      LifecycleGlobals;
@group(0) @binding(8) var<uniform>             u:            LifecycleUniforms;

fn in_bounds(x: i32, y: i32, w: i32, h: i32) -> bool {
  return x >= 0 && x < w && y >= 0 && y < h;
}

fn get_idx(x: i32, y: i32, w: i32) -> u32 {
  return u32(y * w + x);
}

fn is_coastal(x: i32, y: i32, margin: i32, w: i32, h: i32) -> bool {
  return x < margin || x >= (w - margin) || y < margin || y >= (h - margin);
}

fn hash(idx: u32, tick: u32, seed: u32) -> f32 {
  var state = idx * 747796405u + tick * 2891336453u + seed * 1013904223u + 12345u;
  var word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  word = (word >> 22u) ^ word;
  return f32(word) / 4294967296.0;
}

fn hash_u32(idx: u32, tick: u32, seed: u32) -> u32 {
  var state = idx * 747796405u + tick * 2891336453u + seed * 1013904223u + 12345u;
  var word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
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

  // 1. Age & Mortality Evaluation
  var age = state.age + 1u;
  let cur_idx = get_idx(i32(state.x), i32(state.y), i32(u.width));
  let fitness = f32(age) + (state.biomassEaten * 25.0) + (f32(state.seedsSown) * 1.5);

  if (state.energy <= 0.0 || age >= u.maxAge) {
    // Mortality: starvation or senescence
    agentState[agent_idx].alive = 0u;
    agentState[agent_idx].fitness = fitness;
    agentState[agent_idx].age = age;

    // Clear grid cell occupancy (guaranteed atomic release)
    atomicStore(&occupancy[cur_idx], -1);

    // Release slot
    atomicStore(&slotOccupied[agent_idx], 0u);

    // Priority mirrors CPU Agent.checkMortality(): starvation checked before senescence
    if (state.energy <= 0.0) {
      atomicAdd(&globals.deathsStarvation, 1u);
    } else {
      atomicAdd(&globals.deathsAge, 1u);
    }
    return;
  }

  // Agent survived
  atomicAdd(&globals.livingCount, 1u);

  // 2. Reproduction Check
  var energy = state.energy;
  if (energy >= u.reproductionThreshold) {
    let x = i32(state.x);
    let y = i32(state.y);
    let w = i32(u.width);
    let h = i32(u.height);

    // 4 cardinal neighbor offsets: N, S, E, W
    let dx_arr = array<i32, 4>(0, 0, 1, -1);
    let dy_arr = array<i32, 4>(-1, 1, 0, 0);

    let dir_start = hash_u32(agent_idx, u.tickCount, 777u) % 4u;
    var reproduced = false;

    for (var d = 0u; d < 4u; d++) {
      if (reproduced) { break; }
      let dir = (dir_start + d) % 4u;
      let cx = x + dx_arr[dir];
      let cy = y + dy_arr[dir];

      // Terrain check: in-bounds, not coastal, shallow water
      if (in_bounds(cx, cy, w, h) && !is_coastal(cx, cy, i32(u.coastalBorderWidth), w, h)) {
        let c_idx = get_idx(cx, cy, w);
        if (water[c_idx] < 0.6) {
          // Find an empty slot in slotOccupied
          let slot_start = hash_u32(agent_idx, u.tickCount + d * 13u, 888u) % u.maxPopulation;
          var claimed_slot = -1;

          for (var s_step = 0u; s_step < u.maxPopulation; s_step++) {
            let s = (slot_start + s_step) % u.maxPopulation;
            let claim = atomicCompareExchangeWeak(&slotOccupied[s], 0u, 1u);
            if (claim.exchanged) {
              claimed_slot = i32(s);
              break;
            }
          }

          if (claimed_slot >= 0) {
            let child_slot = u32(claimed_slot);

            // Try to claim the empty grid tile (with retry against spurious weak CAS failure)
            var tile_claim = atomicCompareExchangeWeak(&occupancy[c_idx], -1, i32(child_slot));
            if (!tile_claim.exchanged && tile_claim.old_value == -1) {
              tile_claim = atomicCompareExchangeWeak(&occupancy[c_idx], -1, i32(child_slot));
            }
            if (tile_claim.exchanged) {
              // Both slot and tile claimed! Spawn offspring!
              let childEnergy = energy * u.reproductionSplit;
              energy -= childEnergy;

              // Search radius 2 for a mature mate (age >= 30)
              var mate_idx = -1;
              for (var my = -2; my <= 2; my++) {
                for (var mx = -2; mx <= 2; mx++) {
                  if (mx == 0 && my == 0) { continue; }
                  let tx = x + mx;
                  let ty = y + my;
                  if (in_bounds(tx, ty, w, h)) {
                    let midx = get_idx(tx, ty, w);
                    let occ = atomicLoad(&occupancy[midx]);
                    if (occ >= 0 && occ != i32(agent_idx)) {
                      let mate_u = u32(occ);
                      if (mate_u < u.maxPopulation && agentState[mate_u].alive == 1u && agentState[mate_u].age >= 30u) {
                        mate_idx = occ;
                        break;
                      }
                    }
                  }
                }
                if (mate_idx >= 0) { break; }
              }

              // Weight crossover & mutation
              let pA_base = agent_idx * 1738u;
              let pB_base = select(pA_base, u32(mate_idx) * 1738u, mate_idx >= 0);
              let child_base = child_slot * 1738u;
              let is_sexual = (mate_idx >= 0);

              for (var wi = 0u; wi < 1738u; wi++) {
                let r_cross = hash(child_slot, wi, u.tickCount);
                var w_val = select(agentWeights[pB_base + wi], agentWeights[pA_base + wi], (!is_sexual) || (r_cross < 0.5));

                let r_mut = hash(child_slot, wi + 2000u, u.tickCount);
                if (r_mut < u.mutationRate) {
                  let noise = (hash(child_slot, wi + 4000u, u.tickCount) * 2.0 - 1.0) * u.mutationStrength;
                  w_val = clamp(w_val + noise, -3.0, 3.0);
                }
                agentWeights[child_base + wi] = w_val;
              }

              // Reset recurrent hidden carry state for child
              let h_base = child_slot * 24u;
              for (var hi = 0u; hi < 24u; hi++) {
                agentHidden[h_base + hi] = 0.0;
              }

              // Populate child AgentState
              let new_id = atomicAdd(&globals.nextAgentId, 1u);
              agentState[child_slot].x = u32(cx);
              agentState[child_slot].y = u32(cy);
              agentState[child_slot].energy = childEnergy;
              agentState[child_slot].age = 0u;
              agentState[child_slot].generation = state.generation + 1u;
              agentState[child_slot].id = new_id;
              agentState[child_slot].alive = 1u;
              agentState[child_slot].lastAction = 0u;
              agentState[child_slot].lastSuccess = 1.0;
              agentState[child_slot].lastMoveDir = -1;
              agentState[child_slot].fitness = 0.0;
              agentState[child_slot].speciesR = state.speciesR;
              agentState[child_slot].speciesG = state.speciesG;
              agentState[child_slot].speciesB = state.speciesB;
              agentState[child_slot].seedsSown = 0u;
              agentState[child_slot].biomassEaten = 0.0;

              atomicAdd(&globals.birthCount, 1u);
              reproduced = true;
            } else {
              // Tile claim failed, release slot
              atomicStore(&slotOccupied[child_slot], 0u);
            }
          }
        }
      }
    }
  }

  // Write back updated parent state
  agentState[agent_idx].age = age;
  agentState[agent_idx].energy = energy;
  agentState[agent_idx].fitness = fitness;
}
