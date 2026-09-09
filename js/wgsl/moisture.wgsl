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

fn get_absorbed_moisture(cell_idx: u32) -> f32 {
  let w = water[cell_idx];
  let m = moisture[cell_idx];
  if (w > 0.05) {
    let absorption = min(w, u.soilInfiltration * w * (1.0 - m));
    return min(1.0, m + absorption);
  }
  return m;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let x = id.x;
  let y = id.y;
  if (x >= u.width || y >= u.height) {
    return;
  }
  let idx = y * u.width + x;
  let cur_w = water[idx];
  let cur_m = moisture[idx];

  // 1. Direct surface absorption
  var absorbed_m = cur_m;
  if (cur_w > 0.05) {
    let absorption = min(cur_w, u.soilInfiltration * cur_w * (1.0 - cur_m));
    absorbed_m = min(1.0, cur_m + absorption);
    water[idx] = cur_w - absorption * 0.5;
  }

  // 2. Lateral 4-point diffusion with environmental drying
  var neighbor_sum: f32 = 0.0;
  var count: f32 = 0.0;

  if (y > 0u) {
    neighbor_sum += get_absorbed_moisture((y - 1u) * u.width + x);
    count += 1.0;
  }
  if (y < u.height - 1u) {
    neighbor_sum += get_absorbed_moisture((y + 1u) * u.width + x);
    count += 1.0;
  }
  if (x > 0u) {
    neighbor_sum += get_absorbed_moisture(y * u.width + (x - 1u));
    count += 1.0;
  }
  if (x < u.width - 1u) {
    neighbor_sum += get_absorbed_moisture(y * u.width + (x + 1u));
    count += 1.0;
  }

  let avg_neighbors = select(absorbed_m, neighbor_sum / count, count > 0.0);
  var new_m = absorbed_m + u.moistureDiffusion * (avg_neighbors - absorbed_m) - u.moistureDrying;

  // Keep water tiles saturated
  if (water[idx] > 0.1) {
    new_m = max(new_m, 0.85);
  }

  tmp_a[idx] = clamp(new_m, 0.02, 1.0);
}

