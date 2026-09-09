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

fn calc_creep_out(cur_e: f32, cur_w: f32, n_e: f32) -> f32 {
  var out: f32 = 0.0;
  let diff = cur_e - n_e;
  if (diff > u.soilCreepThreshold) {
    out += (diff - u.soilCreepThreshold) * u.soilCreepRate * 0.25;
  }
  if (cur_w > 0.05 && diff > 0.02) {
    out += min(diff * 0.1, cur_w * u.erosionHydraulicRate * 0.25);
  }
  return out;
}

fn calc_creep_in(cur_e: f32, n_e: f32, n_w: f32) -> f32 {
  var inflow: f32 = 0.0;
  let diff = n_e - cur_e;
  if (diff > u.soilCreepThreshold) {
    inflow += (diff - u.soilCreepThreshold) * u.soilCreepRate * 0.25;
  }
  if (n_w > 0.05 && diff > 0.02) {
    inflow += min(diff * 0.1, n_w * u.erosionHydraulicRate * 0.25);
  }
  return inflow;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let x = id.x;
  let y = id.y;
  if (x >= u.width || y >= u.height) {
    return;
  }
  let idx = y * u.width + x;
  let cur_e = elevation[idx];
  let cur_w = water[idx];

  var total_out: f32 = 0.0;
  var total_in: f32 = 0.0;

  // North
  if (y > 0u) {
    let n_idx = (y - 1u) * u.width + x;
    let n_e = elevation[n_idx];
    let n_w = water[n_idx];
    total_out += calc_creep_out(cur_e, cur_w, n_e);
    total_in += calc_creep_in(cur_e, n_e, n_w);
  }
  // South
  if (y < u.height - 1u) {
    let s_idx = (y + 1u) * u.width + x;
    let s_e = elevation[s_idx];
    let s_w = water[s_idx];
    total_out += calc_creep_out(cur_e, cur_w, s_e);
    total_in += calc_creep_in(cur_e, s_e, s_w);
  }
  // West
  if (x > 0u) {
    let w_idx = y * u.width + (x - 1u);
    let w_e = elevation[w_idx];
    let w_w = water[w_idx];
    total_out += calc_creep_out(cur_e, cur_w, w_e);
    total_in += calc_creep_in(cur_e, w_e, w_w);
  }
  // East
  if (x < u.width - 1u) {
    let e_idx = y * u.width + (x + 1u);
    let e_e = elevation[e_idx];
    let e_w = water[e_idx];
    total_out += calc_creep_out(cur_e, cur_w, e_e);
    total_in += calc_creep_in(cur_e, e_e, e_w);
  }

  var val = cur_e - total_out + total_in;

  // Slow geological weathering pull towards bedrock baseline
  let base_val = base_elevation[idx];
  let delta = base_val - val;
  var pull = u.erosionBaseWeathering;
  if (abs(delta) > 0.15) {
    pull *= 4.0;
  }
  val += delta * pull;

  tmp_a[idx] = clamp(val, 0.0, 1.0);
}

