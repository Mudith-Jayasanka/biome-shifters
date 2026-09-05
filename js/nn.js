/**
 * Biome Shifters — Recurrent Neural Network (RNN)
 * Pure zero-allocation feedforward with persistent hidden recurrent carry state.
 * Incorporates Golden Lesson #2 (RNN Carry) from EvoSimSpheres.
 * Headless module: Zero DOM or canvas dependencies (Web Worker ready).
 */

import { CONFIG } from './config.js';

/**
 * Standard normal random number generator via Box-Muller transform
 */
function randomGaussian() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export class NeuralNet {
  constructor(
    inputSize = CONFIG.NN_INPUT_SIZE || 29,
    hiddenSize = CONFIG.NN_HIDDEN_SIZE || 16,
    outputSize = CONFIG.NN_OUTPUT_SIZE || 9
  ) {
    this.inputSize = inputSize;
    this.hiddenSize = hiddenSize;
    this.outputSize = outputSize;

    // Weight and bias buffers (Float32Array)
    this.weightsInput = new Float32Array(inputSize * hiddenSize);
    this.weightsRecurrent = new Float32Array(hiddenSize * hiddenSize);
    this.weightsOutput = new Float32Array(hiddenSize * outputSize);
    this.biasesHidden = new Float32Array(hiddenSize);
    this.biasesOutput = new Float32Array(outputSize);

    // Persistent hidden carry state and pre-allocated zero-allocation buffers
    this.hiddenState = new Float32Array(hiddenSize);
    this.tempHidden = new Float32Array(hiddenSize);
    this.outputBuffer = new Float32Array(outputSize);

    this.initializeWeights();
  }

  /**
   * Xavier / Glorot uniform weight initialization
   */
  initializeWeights() {
    const scaleIn = Math.sqrt(2.0 / (this.inputSize + this.hiddenSize));
    for (let i = 0; i < this.weightsInput.length; i++) {
      this.weightsInput[i] = (Math.random() * 2 - 1) * scaleIn;
    }

    const scaleRec = Math.sqrt(2.0 / (this.hiddenSize + this.hiddenSize));
    for (let i = 0; i < this.weightsRecurrent.length; i++) {
      this.weightsRecurrent[i] = (Math.random() * 2 - 1) * scaleRec;
    }

    const scaleOut = Math.sqrt(2.0 / (this.hiddenSize + this.outputSize));
    for (let i = 0; i < this.weightsOutput.length; i++) {
      this.weightsOutput[i] = (Math.random() * 2 - 1) * scaleOut;
    }

    for (let i = 0; i < this.biasesHidden.length; i++) {
      this.biasesHidden[i] = (Math.random() * 2 - 1) * 0.1;
    }
    for (let i = 0; i < this.biasesOutput.length; i++) {
      this.biasesOutput[i] = (Math.random() * 2 - 1) * 0.1;
    }
  }

  /**
   * Reset recurrent hidden state to zero
   */
  resetState() {
    this.hiddenState.fill(0);
    this.tempHidden.fill(0);
    this.outputBuffer.fill(0);
  }

  /**
   * Zero-allocation recurrent feed-forward calculation.
   * H_t = tanh(W_in * X_t + W_rec * H_{t-1} + B_hidden)
   * Y_t = W_out * H_t + B_out
   * @param {Float32Array|number[]} inputVector 29-element sensory input
   * @returns {Float32Array} 9-element action logit vector
   */
  feedForward(inputVector) {
    const inSize = this.inputSize;
    const hSize = this.hiddenSize;
    const outSize = this.outputSize;

    // 1. Calculate new hidden activations using input + previous hidden carry
    for (let h = 0; h < hSize; h++) {
      let sum = this.biasesHidden[h];

      // Input layer contribution
      for (let i = 0; i < inSize; i++) {
        sum += inputVector[i] * this.weightsInput[i * hSize + h];
      }

      // Recurrent connection contribution (from H_{t-1})
      for (let r = 0; r < hSize; r++) {
        sum += this.hiddenState[r] * this.weightsRecurrent[r * hSize + h];
      }

      // Tanh activation function: bounded in [-1.0, 1.0]
      this.tempHidden[h] = Math.tanh(sum);
    }

    // 2. Commit new hidden state
    for (let h = 0; h < hSize; h++) {
      this.hiddenState[h] = this.tempHidden[h];
    }

    // 3. Compute output logits
    for (let o = 0; o < outSize; o++) {
      let sum = this.biasesOutput[o];
      for (let h = 0; h < hSize; h++) {
        sum += this.hiddenState[h] * this.weightsOutput[h * outSize + o];
      }
      this.outputBuffer[o] = sum;
    }

    return this.outputBuffer;
  }

  /**
   * Mutate neural network parameters with Gaussian perturbation
   * @param {number} rate Probability of mutating each weight
   * @param {number} strength Standard deviation of perturbation
   */
  mutate(rate = 0.08, strength = 0.2) {
    const perturb = (arr) => {
      for (let i = 0; i < arr.length; i++) {
        if (Math.random() < rate) {
          arr[i] += randomGaussian() * strength;
          // Clamp weights to prevent explosive numerical instability
          if (arr[i] > 8.0) arr[i] = 8.0;
          else if (arr[i] < -8.0) arr[i] = -8.0;
        }
      }
    };

    perturb(this.weightsInput);
    perturb(this.weightsRecurrent);
    perturb(this.weightsOutput);
    perturb(this.biasesHidden);
    perturb(this.biasesOutput);
  }

  /**
   * Genetic crossover between two parent brains
   * Uniform crossover picking genes with 50/50 probability from parentA or parentB
   */
  static crossover(parentA, parentB) {
    const child = new NeuralNet(parentA.inputSize, parentA.hiddenSize, parentA.outputSize);

    const cross = (childArr, arrA, arrB) => {
      for (let i = 0; i < childArr.length; i++) {
        childArr[i] = Math.random() < 0.5 ? arrA[i] : arrB[i];
      }
    };

    cross(child.weightsInput, parentA.weightsInput, parentB.weightsInput);
    cross(child.weightsRecurrent, parentA.weightsRecurrent, parentB.weightsRecurrent);
    cross(child.weightsOutput, parentA.weightsOutput, parentB.weightsOutput);
    cross(child.biasesHidden, parentA.biasesHidden, parentB.biasesHidden);
    cross(child.biasesOutput, parentA.biasesOutput, parentB.biasesOutput);

    return child;
  }

  /**
   * Create an exact deep copy of this neural network
   */
  clone() {
    const copy = new NeuralNet(this.inputSize, this.hiddenSize, this.outputSize);
    copy.weightsInput.set(this.weightsInput);
    copy.weightsRecurrent.set(this.weightsRecurrent);
    copy.weightsOutput.set(this.weightsOutput);
    copy.biasesHidden.set(this.biasesHidden);
    copy.biasesOutput.set(this.biasesOutput);
    return copy;
  }

  /**
   * Serialize network weights to JSON
   */
  toJSON() {
    return {
      inputSize: this.inputSize,
      hiddenSize: this.hiddenSize,
      outputSize: this.outputSize,
      weightsInput: Array.from(this.weightsInput),
      weightsRecurrent: Array.from(this.weightsRecurrent),
      weightsOutput: Array.from(this.weightsOutput),
      biasesHidden: Array.from(this.biasesHidden),
      biasesOutput: Array.from(this.biasesOutput)
    };
  }

  /**
   * Restore network from JSON object
   */
  static fromJSON(json) {
    const net = new NeuralNet(json.inputSize, json.hiddenSize, json.outputSize);
    net.weightsInput.set(json.weightsInput);
    net.weightsRecurrent.set(json.weightsRecurrent);
    net.weightsOutput.set(json.weightsOutput);
    net.biasesHidden.set(json.biasesHidden);
    net.biasesOutput.set(json.biasesOutput);
    return net;
  }
}

