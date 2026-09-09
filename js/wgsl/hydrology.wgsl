struct Uniforms {
  width:                 u32,
  height:                u32,
  waterFlowRate:         f32,
  waterEvapRate:         f32,
  rainActive:            f32,
  rainIntensity:         f32,
  rainCenterX:           f32,
  rainCenterY:           f32,
  rainRadius:            f32,
  soilInfiltration:      f32,
  moistureDiffusion:     f32,
  moistureDrying:        f32,
  biomassGrowthRate:     f32,
  biomassMax:            f32,
  biomassSpreadChance:   f32,
  trampleDecay:          f32,
  scentEvaporation:      f32,
  scentDiffusion:        f32,
  soilCreepThreshold:    f32,
  soilCreepRate:         f32,
  erosionHydraulicRate:  f32,
  erosionBaseWeathering: f32,
  coastalBorderWidth:    u32,
  tickCount:             u32,
};

@group(0) @binding(0) var<storage, read_write> elevation: array<f32>;
@group(0) @binding(1) var<storage, read_write> base_elevation: array<f32>;
@group(0) @binding(2) var<storage, read_write> water: array<f32>;
@group(0) @binding(3) var<storage, read_write> moisture: array<f32>;
@group(0) @binding(4) var<storage, read_write> fertility: array<f32>;
@group(0) @binding(5) var<storage, read_write> biomass: array<f32>;
@group(0) @binding(6) var<storage, read_write> trample: array<f32>;
@group(0) @binding(7) var<storage, read_write> scent: array<f32>;
@group(0) @binding(8) var<storage, read>       coastal: array<f32>;
@group(0) @binding(9) var<storage, read_write> tmp_a: array<f32>;
@group(0) @binding(10) var<uniform>            u: Uniforms;

fn get_outflow_to(from_x: u32, from_y: u32, target_head: f32) -> f32 {
  let w_idx = from_y * u.width + from_x;
  let cur_water = water[w_idx];
  if (cur_water <= 0.005) {
    return 0.0;
  }
  let cur_head = elevation[w_idx] + cur_water;
  if (cur_head <= target_head) {
    return 0.0;
  }

  var total_diff: f32 = 0.0;

  // North neighbor of (from_x, from_y)
  if (from_y > 0u) {
    let n_idx = (from_y - 1u) * u.width + from_x;
    let h_n = elevation[n_idx] + water[n_idx];
    if (cur_head > h_n) {
      total_diff += (cur_head - h_n);
    }
  }
  // South neighbor
  if (from_y < u.height - 1u) {
    let s_idx = (from_y + 1u) * u.width + from_x;
    let h_s = elevation[s_idx] + water[s_idx];
    if (cur_head > h_s) {
      total_diff += (cur_head - h_s);
    }
  }
  // West neighbor
  if (from_x > 0u) {
    let w_n_idx = from_y * u.width + (from_x - 1u);
    let h_w = elevation[w_n_idx] + water[w_n_idx];
    if (cur_head > h_w) {
      total_diff += (cur_head - h_w);
    }
  }
  // East neighbor
  if (from_x < u.width - 1u) {
    let e_n_idx = from_y * u.width + (from_x + 1u);
    let h_e = elevation[e_n_idx] + water[e_n_idx];
    if (cur_head > h_e) {
      total_diff += (cur_head - h_e);
    }
  }

  if (total_diff <= 0.0) {
    return 0.0;
  }

  let max_flow = min(cur_water * 0.5, total_diff * u.waterFlowRate * 0.25);
  let ratio = max_flow / total_diff;
  return (cur_head - target_head) * ratio;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let x = id.x;
  let y = id.y;
  if (x >= u.width || y >= u.height) {
    return;
  }
  let idx = y * u.width + x;
  let cur_water = water[idx];
  let cur_elev = elevation[idx];
  let cur_head = cur_elev + cur_water;

  // 1. Calculate outflow to downhill neighbors
  var outflow: f32 = 0.0;
  if (cur_water > 0.005) {
    var total_diff: f32 = 0.0;
    if (y > 0u) {
      let n_idx = (y - 1u) * u.width + x;
      let h_n = elevation[n_idx] + water[n_idx];
      if (cur_head > h_n) { total_diff += (cur_head - h_n); }
    }
    if (y < u.height - 1u) {
      let s_idx = (y + 1u) * u.width + x;
      let h_s = elevation[s_idx] + water[s_idx];
      if (cur_head > h_s) { total_diff += (cur_head - h_s); }
    }
    if (x > 0u) {
      let w_idx = y * u.width + (x - 1u);
      let h_w = elevation[w_idx] + water[w_idx];
      if (cur_head > h_w) { total_diff += (cur_head - h_w); }
    }
    if (x < u.width - 1u) {
      let e_idx = y * u.width + (x + 1u);
      let h_e = elevation[e_idx] + water[e_idx];
      if (cur_head > h_e) { total_diff += (cur_head - h_e); }
    }

    if (total_diff > 0.0) {
      outflow = min(cur_water * 0.5, total_diff * u.waterFlowRate * 0.25);
    }
  }

  // 2. Gather inflow from uphill neighbors
  var inflow: f32 = 0.0;
  if (y > 0u) {
    inflow += get_outflow_to(x, y - 1u, cur_head);
  }
  if (y < u.height - 1u) {
    inflow += get_outflow_to(x, y + 1u, cur_head);
  }
  if (x > 0u) {
    inflow += get_outflow_to(x - 1u, y, cur_head);
  }
  if (x < u.width - 1u) {
    inflow += get_outflow_to(x + 1u, y, cur_head);
  }

  var next_w = cur_water - outflow + inflow;
  if (next_w < 0.001) {
    next_w = 0.0;
  } else if (next_w > 1.0) {
    next_w = 1.0;
  }

  tmp_a[idx] = next_w;
}

