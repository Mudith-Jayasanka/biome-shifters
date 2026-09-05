# TASK_03: Recurrent Neural Network with Hidden Carry

- **Status**: `DONE`
- **Goal**: Implement `js/nn.js` providing a Recurrent Neural Network (RNN) with `Float32Array` weights, persistent hidden state carryover, Gaussian mutation, and weight crossover.
- **Context**: Directly incorporates Golden Lesson #2 (Recurrent Memory) from EvoSimSpheres to prevent behavioral oscillation on grid tiles.

---

## Files to Create / Modify

- `[NEW]` `js/nn.js`

---

## Detailed Specification

### `NeuralNet` Class Contract:
```javascript
export class NeuralNet {
  constructor(inputSize = 29, hiddenSize = 16, outputSize = 9) {
    this.inputSize = inputSize;
    this.hiddenSize = hiddenSize;
    this.outputSize = outputSize;

    // Weights & Biases (Float32Array)
    this.weightsInput = new Float32Array(inputSize * hiddenSize);
    this.weightsRecurrent = new Float32Array(hiddenSize * hiddenSize);
    this.weightsOutput = new Float32Array(hiddenSize * outputSize);
    this.biasesHidden = new Float32Array(hiddenSize);
    this.biasesOutput = new Float32Array(outputSize);

    // Persistent Hidden Carry State
    this.hiddenState = new Float32Array(hiddenSize);
    this.outputBuffer = new Float32Array(outputSize);
  }

  // Pure zero-allocation feed-forward with recurrent state update
  feedForward(inputVector) {
    // Hidden_t = tanh(W_in * Input + W_rec * Hidden_{t-1} + Bias_h)
    // Output_t = W_out * Hidden_t + Bias_out
    // Returns this.outputBuffer
  }

  // Gaussian mutation with per-gene or global mutation rate
  mutate(rate = 0.05, strength = 0.2) { ... }

  // Sexual reproduction weight crossover
  static crossover(parentA, parentB) { ... }

  // Deep clone
  clone() { ... }

  // Serialization
  toJSON() { ... }
  static fromJSON(json) { ... }
}
```

---

## Test Plan

Execute via Node:
```bash
node -e "import('./js/nn.js').then(({ NeuralNet }) => {
  const nn = new NeuralNet();
  const input = new Float32Array(29);
  const out1 = nn.feedForward(input);
  const out2 = nn.feedForward(input);
  console.log('RNN FeedForward ok. Out length:', out1.length);
})"
```

---

## Acceptance Criteria

- [x] Network accepts 29 inputs, maintains 16 hidden recurrent neurons, and outputs 9 action logits.
- [x] Hidden state carries across sequential `feedForward()` calls without allocating new arrays.
- [x] `mutate()` perturbs weights with Gaussian noise.
- [x] `crossover()` produces valid offspring combining two parent brains.
- [x] `toJSON()` and `fromJSON()` roundtrip brain weights perfectly.
