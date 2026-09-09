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

fn hash(idx: u32, tick: u32) -> f32 {
  var state = idx * 747796405u + tick * 2891336453u + 1013904223u;
  var word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  word = (word >> 22u) ^ word;
  return f32(word) / 4294967296.0;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let x = id.x;
  let y = id.y;
  if (x >= u.width || y >= u.height) {
    return;
  }
  let idx = y * u.width + x;

  // Inhospitable coastal perimeter: barren, zero flora
  if (coastal[idx] > 0.5) {
    tmp_a[idx] = 0.0;
    return;
  }

  // Deep standing water inhibits terrestrial vegetation
  if (water[idx] > 0.35) {
    tmp_a[idx] = 0.0;
    return;
  }

  let current_b = biomass[idx];
  let m = moisture[idx];
  let f = fertility[idx];
  let t = trample[idx];

  if (current_b > 0.02) {
    // Logistic flora growth
    let growth = u.biomassGrowthRate * current_b * (1.0 - current_b / u.biomassMax) * m * f * (1.0 - t);
    var new_b = current_b + growth;

    // Severe drought decay
    if (m < 0.15) {
      new_b *= 0.99;
    }

    tmp_a[idx] = clamp(new_b, 0.0, u.biomassMax);
  } else {
    // Barren tile: seed dispersal from neighbors or dormancy germination
    var has_flora_neighbor = false;
    if (y > 0u && biomass[(y - 1u) * u.width + x] > 0.3) {
      has_flora_neighbor = true;
    } else if (y < u.height - 1u && biomass[(y + 1u) * u.width + x] > 0.3) {
      has_flora_neighbor = true;
    } else if (x > 0u && biomass[y * u.width + (x - 1u)] > 0.3) {
      has_flora_neighbor = true;
    } else if (x < u.width - 1u && biomass[y * u.width + (x + 1u)] > 0.3) {
      has_flora_neighbor = true;
    }

    let rand_val = hash(idx, u.tickCount);
    var seed_germ = false;
    if (has_flora_neighbor) {
      seed_germ = (m > 0.25) && (rand_val < u.biomassSpreadChance * m * f * (1.0 - t));
    } else {
      seed_germ = (m > 0.35) && (f > 0.35) && (rand_val < 0.001 * (1.0 - t));
    }

    if (seed_germ) {
      tmp_a[idx] = 0.05;
    } else {
      tmp_a[idx] = 0.0;
    }
  }
}

