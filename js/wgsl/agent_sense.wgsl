// Biome Shifters — WebGPU Agent Sensory Perception & Extended Food Raycasting
// Gathers 37-element physical perception vector directly from VRAM grid buffers

struct SenseUniforms {
  width:       u32,
  height:      u32,
  agentCount:  u32,
  maxEnergy:   f32,
  maxAge:      f32,
  pad0:        u32,
  pad1:        u32,
  pad2:        u32,
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

@group(0) @binding(0) var<storage, read>       elevation:   array<f32>;
@group(0) @binding(1) var<storage, read>       water:       array<f32>;
@group(0) @binding(2) var<storage, read>       moisture:    array<f32>;
@group(0) @binding(3) var<storage, read>       biomass:     array<f32>;
@group(0) @binding(4) var<storage, read>       trample:     array<f32>;
@group(0) @binding(5) var<storage, read>       scent:       array<f32>;
@group(0) @binding(6) var<storage, read>       occupancy:   array<i32>;
@group(0) @binding(7) var<storage, read>       agentState:  array<AgentState>;
@group(0) @binding(8) var<storage, read_write> agentInputs: array<f32>;
@group(0) @binding(9) var<uniform>             u:           SenseUniforms;

fn in_bounds(x: i32, y: i32, w: i32, h: i32) -> bool {
  return x >= 0 && x < w && y >= 0 && y < h;
}

fn get_idx(x: i32, y: i32, w: i32) -> u32 {
  return u32(y * w + x);
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

  let x = i32(state.x);
  let y = i32(state.y);
  let w = i32(u.width);
  let h = i32(u.height);
  let in_base = agent_idx * 37u;

  let cur_idx = get_idx(x, y, w);
  let cur_elev = elevation[cur_idx];

  // 4 Cardinal Neighbors: 0=N, 1=S, 2=E, 3=W
  let nx = array<i32, 4>(x, x, x + 1, x - 1);
  let ny = array<i32, 4>(y - 1, y + 1, y, y);

  // [0..3]: Local Slope (Elevation diff: neighbor - current) * 2.0
  // Out-of-bounds registers as an impassable sheer cliff barrier (+1.0)
  for (var d = 0u; d < 4u; d++) {
    if (!in_bounds(nx[d], ny[d], w, h)) {
      agentInputs[in_base + d] = 1.0;
    } else {
      let n_elev = elevation[get_idx(nx[d], ny[d], w)];
      agentInputs[in_base + d] = (n_elev - cur_elev) * 2.0;
    }
  }

  // [4..7]: Local Moisture (Out-of-bounds is 0.0)
  for (var d = 0u; d < 4u; d++) {
    if (!in_bounds(nx[d], ny[d], w, h)) {
      agentInputs[in_base + 4u + d] = 0.0;
    } else {
      agentInputs[in_base + 4u + d] = moisture[get_idx(nx[d], ny[d], w)];
    }
  }

  // [8..11]: Immediate Biomass (dist = 1)
  for (var d = 0u; d < 4u; d++) {
    if (!in_bounds(nx[d], ny[d], w, h)) {
      agentInputs[in_base + 8u + d] = 0.0;
    } else {
      agentInputs[in_base + 8u + d] = biomass[get_idx(nx[d], ny[d], w)];
    }
  }

  // [12..15]: Extended Food Raycasts (N, S, E, W, dist = 2..4)
  // Weights: step 1 (dist 2) = 0.45, step 2 (dist 3) = 0.35, step 3 (dist 4) = 0.20
  let ray_dx = array<i32, 4>(0, 0, 1, -1);
  let ray_dy = array<i32, 4>(-1, 1, 0, 0);
  let ray_weights = array<f32, 3>(0.45, 0.35, 0.20);

  for (var d = 0u; d < 4u; d++) {
    var ray_food: f32 = 0.0;
    for (var step = 1; step <= 3; step++) {
      let rx = x + ray_dx[d] * (step + 1);
      let ry = y + ray_dy[d] * (step + 1);
      if (!in_bounds(rx, ry, w, h)) {
        break;
      }
      ray_food += biomass[get_idx(rx, ry, w)] * ray_weights[step - 1];
    }
    agentInputs[in_base + 12u + d] = min(1.0, ray_food);
  }

  // [16..19]: Local Trample Compaction (Out-of-bounds is 1.0 impassable)
  for (var d = 0u; d < 4u; d++) {
    if (!in_bounds(nx[d], ny[d], w, h)) {
      agentInputs[in_base + 16u + d] = 1.0;
    } else {
      agentInputs[in_base + 16u + d] = trample[get_idx(nx[d], ny[d], w)];
    }
  }

  // [20..23]: Local Scent
  for (var d = 0u; d < 4u; d++) {
    if (!in_bounds(nx[d], ny[d], w, h)) {
      agentInputs[in_base + 20u + d] = 0.0;
    } else {
      agentInputs[in_base + 20u + d] = scent[get_idx(nx[d], ny[d], w)];
    }
  }

  // [24..27]: Neighbor Occupancy & Obstacles (1.0 if occupied OR boundary wall, 0.0 if free)
  for (var d = 0u; d < 4u; d++) {
    if (!in_bounds(nx[d], ny[d], w, h)) {
      agentInputs[in_base + 24u + d] = 1.0;
    } else {
      let occ = occupancy[get_idx(nx[d], ny[d], w)];
      if (occ >= 0 && u32(occ) != agent_idx) {
        agentInputs[in_base + 24u + d] = 1.0;
      } else {
        agentInputs[in_base + 24u + d] = 0.0;
      }
    }
  }

  // [28]: Current Tile Biomass
  agentInputs[in_base + 28u] = biomass[cur_idx];

  // [29]: Current Tile Water Depth
  agentInputs[in_base + 29u] = water[cur_idx];

  // [30]: Agent Energy Ratio [0, 1]
  agentInputs[in_base + 30u] = min(1.0, state.energy / max(1.0, u.maxEnergy));

  // [31]: Agent Age Ratio [0, 1]
  agentInputs[in_base + 31u] = min(1.0, f32(state.age) / max(1.0, u.maxAge));

  // [32]: Feedback of last action success
  agentInputs[in_base + 32u] = state.lastSuccess;

  // [33..36]: Self-Motion / Momentum Heading Vector (one-hot: 0=N, 1=S, 2=E, 3=W)
  agentInputs[in_base + 33u] = select(0.0, 1.0, state.lastMoveDir == 0);
  agentInputs[in_base + 34u] = select(0.0, 1.0, state.lastMoveDir == 1);
  agentInputs[in_base + 35u] = select(0.0, 1.0, state.lastMoveDir == 2);
  agentInputs[in_base + 36u] = select(0.0, 1.0, state.lastMoveDir == 3);
}

