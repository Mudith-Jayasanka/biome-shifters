// Biome Shifters — WebGPU Recurrent Neural Network (RNN) Brain Inference
// Parallel forward pass and temperature-controlled Softmax action sampling

struct BrainUniforms {
  agentCount:   u32, // Number of agents in current batch
  inputSize:    u32, // 37
  hiddenSize:   u32, // 24
  outputSize:   u32, // 10
  temperature:  f32, // Softmax sampling temperature
  tickCount:    u32, // Simulation tick for PRNG
  seed:         u32, // Unique PRNG seed
  pad:          u32,
};

struct AgentState {
  x:            u32,
  y:            u32,
  energy:       f32,
  age:          u32,
  generation:   u32,
  id:           u32,
  alive:        u32, // 1 = alive, 0 = inactive/empty slot
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

@group(0) @binding(0) var<storage, read>       agentState:   array<AgentState>;
@group(0) @binding(1) var<storage, read>       agentInputs:  array<f32>;
@group(0) @binding(2) var<storage, read_write> agentHidden:  array<f32>;
@group(0) @binding(3) var<storage, read>       agentWeights: array<f32>;
@group(0) @binding(4) var<storage, read_write> agentOutputs: array<AgentOutput>;
@group(0) @binding(5) var<uniform>             u:            BrainUniforms;

fn hash(idx: u32, tick: u32, seed: u32) -> f32 {
  var state = idx * 747796405u + tick * 2891336453u + seed * 1013904223u + 12345u;
  var word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  word = (word >> 22u) ^ word;
  return f32(word) / 4294967296.0;
}

@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let agent_idx = id.x;
  if (agent_idx >= u.agentCount) {
    return;
  }
  if (agentState[agent_idx].alive == 0u) {
    return;
  }

  // Weight layout offsets (1738 floats per agent):
  // weightsInput:     37 * 24 = 888 floats (offset 0)
  // weightsRecurrent: 24 * 24 = 576 floats (offset 888)
  // weightsOutput:    24 * 10 = 240 floats (offset 1464)
  // biasesHidden:               24 floats (offset 1704)
  // biasesOutput:               10 floats (offset 1728)
  let base_w = agent_idx * 1738u;
  let w_in_offset = base_w;
  let w_rec_offset = base_w + 888u;
  let w_out_offset = base_w + 1464u;
  let b_h_offset = base_w + 1704u;
  let b_o_offset = base_w + 1728u;

  let in_base = agent_idx * 37u;
  let h_base = agent_idx * 24u;

  // 1. Recurrent Hidden Layer Forward Pass:
  // H_t = tanh(W_in * X_t + W_rec * H_{t-1} + B_hidden)
  var temp_hidden: array<f32, 24>;

  for (var h = 0u; h < 24u; h++) {
    var sum = agentWeights[b_h_offset + h];

    // Input layer contribution
    for (var i = 0u; i < 37u; i++) {
      sum += agentInputs[in_base + i] * agentWeights[w_in_offset + i * 24u + h];
    }

    // Recurrent carry connection contribution
    for (var r = 0u; r < 24u; r++) {
      sum += agentHidden[h_base + r] * agentWeights[w_rec_offset + r * 24u + h];
    }

    temp_hidden[h] = tanh(sum);
  }

  // Commit updated recurrent hidden state
  for (var h = 0u; h < 24u; h++) {
    agentHidden[h_base + h] = temp_hidden[h];
  }

  // 2. Output Layer:
  // Logits Y = W_out * H_t + B_output
  var logits: array<f32, 10>;
  var max_logit: f32 = -1e10;

  for (var o = 0u; o < 10u; o++) {
    var sum = agentWeights[b_o_offset + o];
    for (var h = 0u; h < 24u; h++) {
      sum += temp_hidden[h] * agentWeights[w_out_offset + h * 10u + o];
    }
    logits[o] = sum;
    agentOutputs[agent_idx].logits[o] = sum;
    if (sum > max_logit) {
      max_logit = sum;
    }
  }

  // 3. Softmax Action Selection with Temperature Sampling
  var exp_sum: f32 = 0.0;
  var exp_logits: array<f32, 10>;
  let temp = max(0.05, u.temperature);

  for (var o = 0u; o < 10u; o++) {
    let e = exp((logits[o] - max_logit) / temp);
    exp_logits[o] = e;
    exp_sum += e;
  }

  // Sample discrete action via inverse transform sampling
  let rand_val = hash(agent_idx, u.tickCount, u.seed) * exp_sum;
  var accum: f32 = 0.0;
  var chosen_action: u32 = 0u;

  for (var o = 0u; o < 10u; o++) {
    accum += exp_logits[o];
    if (rand_val <= accum) {
      chosen_action = o;
      break;
    }
  }

  agentOutputs[agent_idx].chosenAction = chosen_action;
}

