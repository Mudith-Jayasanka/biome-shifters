/**
 * Biome Shifters — WebGPU Environmental Cellular Automata Engine
 * Replicates all 8 environmental CA passes from js/environment.js using WebGPU compute shaders.
 * Headless module: Zero DOM or canvas dependencies (Web Worker and Node compatible).
 */

import { CONFIG } from './config.js';

const BUFFER_USAGE = {
  MAP_READ: 0x0001,
  COPY_SRC: 0x0004,
  COPY_DST: 0x0008,
  UNIFORM: 0x0040,
  STORAGE: 0x0080,
};

const SHADER_STAGE = {
  COMPUTE: 0x4,
};

const MAP_MODE = {
  READ: 0x0001,
};

const SHADER_NAMES = [
  'water_sources',
  'rain_evaporation',
  'hydrology',
  'erosion',
  'moisture',
  'vegetation',
  'trail_decay',
  'pheromone'
];

const STAGING_STATE = {
  IDLE: 0,
  ENQUEUED: 1,
  MAPPING: 2,
  MAPPED: 3
};

export class GpuEnvironment {
  /**
   * @param {Grid} grid - The simulation grid whose Float32Array layers will be GPU-accelerated.
   */
  constructor(grid) {
    this.grid = grid;
    this.width = grid.width;
    this.height = grid.height;
    this.size = grid.size;

    this.device = null;
    this.adapter = null;
    this.isInitialized = false;
    this.isFlushing = false;
    this.tickCount = 0;
    this.lastGpuTickTime = 0;
    this.minIntervalMs = 16; // Throttle compute passes to ~60 Hz to protect PCIe / GPU queues across workers

    this.buffers = null;
    this.pipelines = null;
    this.bindGroupLayout = null;
    this.bindGroup = null;

    // Phase 14: Pure WebGPU Agent Pipeline
    this.maxAgents = 1024;
    this.agentBrainBindGroupLayout = null;
    this.agentBrainBindGroup = null;
    this.agentSenseBindGroupLayout = null;
    this.agentSenseBindGroup = null;
    this.agentActBindGroupLayout = null;
    this.agentActBindGroup = null;
    this.agentLifecycleBindGroupLayout = null;
    this.agentLifecycleBindGroup = null;
    this.agentOutputStagingBuffer = null;
    this.agentStateStagingBuffer = null;
    this.agentStateStagingMapped = false;
    this.agentStateStagingPending = false;

    // Per-window action tally & birth/death telemetry (mirrors CPU dynamicsAccumulator)
    this.statsStagingBuffer = null;
    this.statsStagingMapped = false;
    this.statsStagingPending = false;

    // Double-buffered staging buffers with explicit lifecycle states
    this.stagingBuffers = null;
    this.currentStagingIdx = 0;
    this.stagingStates = [STAGING_STATE.IDLE, STAGING_STATE.IDLE];
    this.mapPromises = [null, null];

    // Uniform buffer data (24 uint32/float32 = 96 bytes)
    this.uniformArrayBuffer = new ArrayBuffer(96);
    this.uniformF32 = new Float32Array(this.uniformArrayBuffer);
    this.uniformU32 = new Uint32Array(this.uniformArrayBuffer);

    this._initUniformDefaults();
  }

  /**
   * @returns {boolean} Whether WebGPU is supported in the current environment.
   */
  static isSupported() {
    return typeof navigator !== 'undefined' && 'gpu' in navigator;
  }

  /**
   * Pre-flight asynchronous check to determine if WebGPU device/adapter can actually be acquired.
   * @returns {Promise<{supported: boolean, reason?: string, adapter?: any}>}
   */
  static async checkSupport() {
    if (!GpuEnvironment.isSupported()) {
      return { supported: false, reason: 'navigator.gpu unavailable' };
    }
    try {
      let adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) {
        adapter = await navigator.gpu.requestAdapter();
      }
      if (!adapter) {
        return { supported: false, reason: 'No WebGPU adapter found' };
      }
      return { supported: true, adapter };
    } catch (err) {
      return { supported: false, reason: err.message };
    }
  }

  /**
   * Pre-populate static simulation constants into the uniform array buffer
   */
  _initUniformDefaults() {
    this.uniformU32[0] = this.width;
    this.uniformU32[1] = this.height;
    this.uniformF32[2] = CONFIG.WATER_FLOW_RATE;
    this.uniformF32[3] = CONFIG.WATER_EVAP_RATE;
    this.uniformF32[4] = 0.0; // rainActive
    this.uniformF32[5] = 0.0; // rainIntensity
    this.uniformF32[6] = 0.0; // rainCenterX
    this.uniformF32[7] = 0.0; // rainCenterY
    this.uniformF32[8] = 0.0; // rainRadius
    this.uniformF32[9] = CONFIG.SOIL_INFILTRATION;
    this.uniformF32[10] = CONFIG.MOISTURE_DIFFUSION;
    this.uniformF32[11] = CONFIG.MOISTURE_DRYING;
    this.uniformF32[12] = CONFIG.BIOMASS_GROWTH_RATE;
    this.uniformF32[13] = CONFIG.BIOMASS_MAX;
    this.uniformF32[14] = CONFIG.BIOMASS_SPREAD_CHANCE;
    this.uniformF32[15] = CONFIG.TRAMPLE_DECAY;
    this.uniformF32[16] = CONFIG.SCENT_EVAPORATION;
    this.uniformF32[17] = CONFIG.SCENT_DIFFUSION;
    this.uniformF32[18] = CONFIG.SOIL_CREEP_THRESHOLD;
    this.uniformF32[19] = CONFIG.SOIL_CREEP_RATE;
    this.uniformF32[20] = CONFIG.EROSION_HYDRAULIC_RATE;
    this.uniformF32[21] = CONFIG.EROSION_BASE_WEATHERING;
    this.uniformU32[22] = CONFIG.COASTAL_BORDER_WIDTH || 3;
    this.uniformU32[23] = 0;   // tickCount
  }

  /**
   * Load WGSL shader text from js/wgsl/<name>.wgsl
   */
  async _loadShader(name) {
    const urls = [];
    if (typeof import.meta !== 'undefined' && import.meta.url) {
      try {
        urls.push(new URL(`./wgsl/${name}.wgsl`, import.meta.url).href);
      } catch (e) {}
    }
    urls.push(`/js/wgsl/${name}.wgsl`);
    urls.push(`./js/wgsl/${name}.wgsl`);
    urls.push(`../wgsl/${name}.wgsl`);

    for (const url of urls) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          return await res.text();
        }
      } catch (err) {
        // Try next candidate
      }
    }
    throw new Error(`[GpuEnvironment] Unable to load shader source for ${name}`);
  }

  /**
   * Request WebGPU device, compile all 8 compute shaders, allocate GPU buffers.
   * @returns {Promise<boolean>} - true on success, false if WebGPU unsupported/failed.
   */
  async init() {
    if (!GpuEnvironment.isSupported()) {
      console.warn('[GpuEnvironment] WebGPU is not supported in this browser/environment.');
      return false;
    }

    try {
      this.adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!this.adapter) {
        this.adapter = await navigator.gpu.requestAdapter();
      }
      if (!this.adapter) {
        console.warn('[GpuEnvironment] Failed to acquire WebGPU adapter.');
        return false;
      }
      console.log('[GpuEnvironment] WebGPU adapter acquired');

      // Request requiredLimits if supported by the adapter.
      // WebGPU baseline defaults maxStorageBuffersPerShaderStage to 8.
      // Since our bindGroupLayout requires 10 storage buffers (bindings 0-9),
      // we must request at least 10 (or the adapter maximum, e.g. 16) if available.
      const requiredLimits = {};
      const maxStorage = this.adapter.limits?.maxStorageBuffersPerShaderStage;
      if (maxStorage && maxStorage >= 10) {
        requiredLimits.maxStorageBuffersPerShaderStage = Math.min(maxStorage, 16);
      } else if (maxStorage && maxStorage < 10) {
        console.warn(`[GpuEnvironment] WebGPU adapter supports max ${maxStorage} storage buffers per stage (10 required) — falling back to CPU.`);
        return false;
      }

      this.device = await this.adapter.requestDevice({ requiredLimits });
      if (!this.device) {
        console.warn('[GpuEnvironment] Failed to create WebGPU device.');
        return false;
      }

      this.device.onuncapturederror = (event) => {
        console.error('[GpuEnvironment] WebGPU uncaptured error:', event.error?.message || event.error);
      };

      // 1. Allocate GPU storage and uniform buffers
      const byteSize = this.size * 4; // 128*128*4 = 65,536 bytes
      const storageUsage = (globalThis.GPUBufferUsage?.STORAGE || BUFFER_USAGE.STORAGE) |
                           (globalThis.GPUBufferUsage?.COPY_SRC || BUFFER_USAGE.COPY_SRC) |
                           (globalThis.GPUBufferUsage?.COPY_DST || BUFFER_USAGE.COPY_DST);

      this.buffers = {
        elevation: this.device.createBuffer({ size: byteSize, usage: storageUsage, label: 'elevation' }),
        baseElevation: this.device.createBuffer({ size: byteSize, usage: storageUsage, label: 'base_elevation' }),
        water: this.device.createBuffer({ size: byteSize, usage: storageUsage, label: 'water' }),
        moisture: this.device.createBuffer({ size: byteSize, usage: storageUsage, label: 'moisture' }),
        fertility: this.device.createBuffer({ size: byteSize, usage: storageUsage, label: 'fertility' }),
        biomass: this.device.createBuffer({ size: byteSize, usage: storageUsage, label: 'biomass' }),
        trample: this.device.createBuffer({ size: byteSize, usage: storageUsage, label: 'trample' }),
        scent: this.device.createBuffer({ size: byteSize, usage: storageUsage, label: 'scent' }),
        coastal: this.device.createBuffer({ size: byteSize, usage: storageUsage, label: 'coastal' }),
        tmp_a: this.device.createBuffer({ size: byteSize, usage: storageUsage, label: 'tmp_a' }),
        uniforms: this.device.createBuffer({
          size: 96,
          usage: (globalThis.GPUBufferUsage?.UNIFORM || BUFFER_USAGE.UNIFORM) |
                 (globalThis.GPUBufferUsage?.COPY_DST || BUFFER_USAGE.COPY_DST),
          label: 'uniforms'
        }),
        // Agent Buffers (Phase 14 Pure WebGPU Engine: up to 1024 agents)
        agentState: this.device.createBuffer({ size: this.maxAgents * 64, usage: storageUsage, label: 'agent_state' }),
        agentInputs: this.device.createBuffer({ size: this.maxAgents * 37 * 4, usage: storageUsage, label: 'agent_inputs' }),
        agentHidden: this.device.createBuffer({ size: this.maxAgents * 24 * 4, usage: storageUsage, label: 'agent_hidden' }),
        agentWeights: this.device.createBuffer({ size: this.maxAgents * 1738 * 4, usage: storageUsage, label: 'agent_weights' }),
        agentOutputs: this.device.createBuffer({ size: this.maxAgents * 64, usage: storageUsage, label: 'agent_outputs' }),
        brainUniforms: this.device.createBuffer({
          size: 32,
          usage: (globalThis.GPUBufferUsage?.UNIFORM || BUFFER_USAGE.UNIFORM) |
                 (globalThis.GPUBufferUsage?.COPY_DST || BUFFER_USAGE.COPY_DST),
          label: 'brain_uniforms'
        }),
        occupancy: this.device.createBuffer({ size: byteSize, usage: storageUsage, label: 'occupancy' }),
        senseUniforms: this.device.createBuffer({
          size: 32,
          usage: (globalThis.GPUBufferUsage?.UNIFORM || BUFFER_USAGE.UNIFORM) |
                 (globalThis.GPUBufferUsage?.COPY_DST || BUFFER_USAGE.COPY_DST),
          label: 'sense_uniforms'
        }),
        actUniforms: this.device.createBuffer({
          size: 96,
          usage: (globalThis.GPUBufferUsage?.UNIFORM || BUFFER_USAGE.UNIFORM) |
                 (globalThis.GPUBufferUsage?.COPY_DST || BUFFER_USAGE.COPY_DST),
          label: 'act_uniforms'
        }),
        slotOccupied: this.device.createBuffer({
          size: this.maxAgents * 4,
          usage: storageUsage,
          label: 'slot_occupied'
        }),
        lifecycleGlobals: this.device.createBuffer({
          size: 20,
          usage: storageUsage,
          label: 'lifecycle_globals'
        }),
        actionStats: this.device.createBuffer({
          size: 40,
          usage: storageUsage,
          label: 'action_stats'
        }),
        lifecycleUniforms: this.device.createBuffer({
          size: 48,
          usage: (globalThis.GPUBufferUsage?.UNIFORM || BUFFER_USAGE.UNIFORM) |
                 (globalThis.GPUBufferUsage?.COPY_DST || BUFFER_USAGE.COPY_DST),
          label: 'lifecycle_uniforms'
        })
      };

      // Upload initial occupancy grid (-1 for empty cells; slot index populated by uploadAgentData)
      const emptyOcc = new Int32Array(this.size).fill(-1);
      this.device.queue.writeBuffer(this.buffers.occupancy, 0, emptyOcc);

      // 2. Precompute and upload coastal perimeter mask
      const coastalArray = new Float32Array(this.size);
      for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          coastalArray[y * this.width + x] = this.grid.isCoastal(x, y) ? 1.0 : 0.0;
        }
      }
      this.device.queue.writeBuffer(this.buffers.coastal, 0, coastalArray);

      // 3. Upload initial physical grid layers
      this.device.queue.writeBuffer(this.buffers.elevation, 0, this.grid.elevation);
      this.device.queue.writeBuffer(this.buffers.baseElevation, 0, this.grid.baseElevation || this.grid.elevation);
      this.device.queue.writeBuffer(this.buffers.water, 0, this.grid.water);
      this.device.queue.writeBuffer(this.buffers.moisture, 0, this.grid.moisture);
      this.device.queue.writeBuffer(this.buffers.fertility, 0, this.grid.fertility);
      this.device.queue.writeBuffer(this.buffers.biomass, 0, this.grid.biomass);
      this.device.queue.writeBuffer(this.buffers.trample, 0, this.grid.trample);
      this.device.queue.writeBuffer(this.buffers.scent, 0, this.grid.scent);
      this.device.queue.writeBuffer(this.buffers.uniforms, 0, this.uniformArrayBuffer);

      // 4. Allocate double-buffered staging buffers for readback (6 layers: elev, water, moisture, biomass, trample, scent)
      const readTotalBytes = 6 * byteSize; // 6 * 65536 = 393,216 bytes
      const readUsage = (globalThis.GPUBufferUsage?.MAP_READ || BUFFER_USAGE.MAP_READ) |
                        (globalThis.GPUBufferUsage?.COPY_DST || BUFFER_USAGE.COPY_DST);

      this.stagingBuffers = [
        this.device.createBuffer({ size: readTotalBytes, usage: readUsage, label: 'staging_0' }),
        this.device.createBuffer({ size: readTotalBytes, usage: readUsage, label: 'staging_1' })
      ];
      this.stagingStates = [STAGING_STATE.IDLE, STAGING_STATE.IDLE];
      this.mapPromises = [null, null];
      this.currentStagingIdx = 0;
      this.lastGpuTickTime = 0;

      // 5. Create bind group layout
      const computeStage = globalThis.GPUShaderStage?.COMPUTE || SHADER_STAGE.COMPUTE;
      this.bindGroupLayout = this.device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: computeStage, buffer: { type: 'storage' } },
          { binding: 1, visibility: computeStage, buffer: { type: 'storage' } },
          { binding: 2, visibility: computeStage, buffer: { type: 'storage' } },
          { binding: 3, visibility: computeStage, buffer: { type: 'storage' } },
          { binding: 4, visibility: computeStage, buffer: { type: 'storage' } },
          { binding: 5, visibility: computeStage, buffer: { type: 'storage' } },
          { binding: 6, visibility: computeStage, buffer: { type: 'storage' } },
          { binding: 7, visibility: computeStage, buffer: { type: 'storage' } },
          { binding: 8, visibility: computeStage, buffer: { type: 'read-only-storage' } },
          { binding: 9, visibility: computeStage, buffer: { type: 'storage' } },
          { binding: 10, visibility: computeStage, buffer: { type: 'uniform' } },
        ]
      });

      // 6. Create bind group
      this.bindGroup = this.device.createBindGroup({
        layout: this.bindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: this.buffers.elevation } },
          { binding: 1, resource: { buffer: this.buffers.baseElevation } },
          { binding: 2, resource: { buffer: this.buffers.water } },
          { binding: 3, resource: { buffer: this.buffers.moisture } },
          { binding: 4, resource: { buffer: this.buffers.fertility } },
          { binding: 5, resource: { buffer: this.buffers.biomass } },
          { binding: 6, resource: { buffer: this.buffers.trample } },
          { binding: 7, resource: { buffer: this.buffers.scent } },
          { binding: 8, resource: { buffer: this.buffers.coastal } },
          { binding: 9, resource: { buffer: this.buffers.tmp_a } },
          { binding: 10, resource: { buffer: this.buffers.uniforms } },
        ]
      });

      const pipelineLayout = this.device.createPipelineLayout({
        bindGroupLayouts: [this.bindGroupLayout]
      });

      // 7. Compile all 8 compute pipelines asynchronously
      this.pipelines = {};
      for (const name of SHADER_NAMES) {
        const code = await this._loadShader(name);
        const shaderModule = this.device.createShaderModule({ label: name, code });

        if (shaderModule.getCompilationInfo) {
          const compInfo = await shaderModule.getCompilationInfo();
          let hasError = false;
          for (const msg of compInfo.messages) {
            if (msg.type === 'error') {
              console.error(`[GpuEnvironment] WGSL compilation error in ${name}.wgsl [line ${msg.lineNum}:${msg.linePos}]: ${msg.message}`);
              hasError = true;
            }
          }
          if (hasError) {
            throw new Error(`[GpuEnvironment] WGSL compilation failed for ${name}.wgsl`);
          }
        }

        this.pipelines[name] = await this.device.createComputePipelineAsync({
          layout: pipelineLayout,
          compute: {
            module: shaderModule,
            entryPoint: 'main'
          }
        });
      }
      console.log('[GpuEnvironment] All 8 compute pipelines compiled asynchronously');

      // 8. Compile WebGPU Agent Brain Inference Pipeline (Phase 14)
      this.agentBrainBindGroupLayout = this.device.createBindGroupLayout({
        label: 'agent_brain_layout',
        entries: [
          { binding: 0, visibility: computeStage, buffer: { type: 'read-only-storage' } },
          { binding: 1, visibility: computeStage, buffer: { type: 'read-only-storage' } },
          { binding: 2, visibility: computeStage, buffer: { type: 'storage' } },
          { binding: 3, visibility: computeStage, buffer: { type: 'read-only-storage' } },
          { binding: 4, visibility: computeStage, buffer: { type: 'storage' } },
          { binding: 5, visibility: computeStage, buffer: { type: 'uniform' } },
        ]
      });

      this.agentBrainBindGroup = this.device.createBindGroup({
        label: 'agent_brain_bind_group',
        layout: this.agentBrainBindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: this.buffers.agentState } },
          { binding: 1, resource: { buffer: this.buffers.agentInputs } },
          { binding: 2, resource: { buffer: this.buffers.agentHidden } },
          { binding: 3, resource: { buffer: this.buffers.agentWeights } },
          { binding: 4, resource: { buffer: this.buffers.agentOutputs } },
          { binding: 5, resource: { buffer: this.buffers.brainUniforms } },
        ]
      });

      const brainPipelineLayout = this.device.createPipelineLayout({
        label: 'brain_pipeline_layout',
        bindGroupLayouts: [this.agentBrainBindGroupLayout]
      });

      const brainCode = await this._loadShader('agent_brain');
      const brainModule = this.device.createShaderModule({ label: 'agent_brain', code: brainCode });
      if (brainModule.getCompilationInfo) {
        const compInfo = await brainModule.getCompilationInfo();
        let hasError = false;
        for (const msg of compInfo.messages) {
          if (msg.type === 'error') {
            console.error(`[GpuEnvironment] WGSL compilation error in agent_brain.wgsl [line ${msg.lineNum}:${msg.linePos}]: ${msg.message}`);
            hasError = true;
          }
        }
        if (hasError) {
          throw new Error('[GpuEnvironment] WGSL compilation failed for agent_brain.wgsl');
        }
      }

      this.pipelines['agent_brain'] = await this.device.createComputePipelineAsync({
        layout: brainPipelineLayout,
        compute: {
          module: brainModule,
          entryPoint: 'main'
        }
      });
      console.log('[GpuEnvironment] Agent brain compute pipeline compiled asynchronously');

      // 9. Compile WebGPU Agent Perception Pipeline (Phase 14)
      this.agentSenseBindGroupLayout = this.device.createBindGroupLayout({
        label: 'agent_sense_layout',
        entries: [
          { binding: 0, visibility: computeStage, buffer: { type: 'read-only-storage' } },
          { binding: 1, visibility: computeStage, buffer: { type: 'read-only-storage' } },
          { binding: 2, visibility: computeStage, buffer: { type: 'read-only-storage' } },
          { binding: 3, visibility: computeStage, buffer: { type: 'read-only-storage' } },
          { binding: 4, visibility: computeStage, buffer: { type: 'read-only-storage' } },
          { binding: 5, visibility: computeStage, buffer: { type: 'read-only-storage' } },
          { binding: 6, visibility: computeStage, buffer: { type: 'read-only-storage' } },
          { binding: 7, visibility: computeStage, buffer: { type: 'read-only-storage' } },
          { binding: 8, visibility: computeStage, buffer: { type: 'storage' } },
          { binding: 9, visibility: computeStage, buffer: { type: 'uniform' } },
        ]
      });

      this.agentSenseBindGroup = this.device.createBindGroup({
        label: 'agent_sense_bind_group',
        layout: this.agentSenseBindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: this.buffers.elevation } },
          { binding: 1, resource: { buffer: this.buffers.water } },
          { binding: 2, resource: { buffer: this.buffers.moisture } },
          { binding: 3, resource: { buffer: this.buffers.biomass } },
          { binding: 4, resource: { buffer: this.buffers.trample } },
          { binding: 5, resource: { buffer: this.buffers.scent } },
          { binding: 6, resource: { buffer: this.buffers.occupancy } },
          { binding: 7, resource: { buffer: this.buffers.agentState } },
          { binding: 8, resource: { buffer: this.buffers.agentInputs } },
          { binding: 9, resource: { buffer: this.buffers.senseUniforms } },
        ]
      });

      const sensePipelineLayout = this.device.createPipelineLayout({
        label: 'sense_pipeline_layout',
        bindGroupLayouts: [this.agentSenseBindGroupLayout]
      });

      const senseCode = await this._loadShader('agent_sense');
      const senseModule = this.device.createShaderModule({ label: 'agent_sense', code: senseCode });
      if (senseModule.getCompilationInfo) {
        const compInfo = await senseModule.getCompilationInfo();
        let hasError = false;
        for (const msg of compInfo.messages) {
          if (msg.type === 'error') {
            console.error(`[GpuEnvironment] WGSL compilation error in agent_sense.wgsl [line ${msg.lineNum}:${msg.linePos}]: ${msg.message}`);
            hasError = true;
          }
        }
        if (hasError) {
          throw new Error('[GpuEnvironment] WGSL compilation failed for agent_sense.wgsl');
        }
      }

      this.pipelines['agent_sense'] = await this.device.createComputePipelineAsync({
        layout: sensePipelineLayout,
        compute: {
          module: senseModule,
          entryPoint: 'main'
        }
      });
      console.log('[GpuEnvironment] Agent perception compute pipeline compiled asynchronously');

      // 10. Compile WebGPU Agent Action Execution Pipeline (Phase 14)
      this.agentActBindGroupLayout = this.device.createBindGroupLayout({
        label: 'agent_act_layout',
        entries: [
          { binding: 0, visibility: computeStage, buffer: { type: 'storage' } },
          { binding: 1, visibility: computeStage, buffer: { type: 'read-only-storage' } },
          { binding: 2, visibility: computeStage, buffer: { type: 'read-only-storage' } },
          { binding: 3, visibility: computeStage, buffer: { type: 'storage' } },
          { binding: 4, visibility: computeStage, buffer: { type: 'storage' } },
          { binding: 5, visibility: computeStage, buffer: { type: 'storage' } },
          { binding: 6, visibility: computeStage, buffer: { type: 'storage' } },
          { binding: 7, visibility: computeStage, buffer: { type: 'storage' } },
          { binding: 8, visibility: computeStage, buffer: { type: 'storage' } },
          { binding: 9, visibility: computeStage, buffer: { type: 'read-only-storage' } },
          { binding: 10, visibility: computeStage, buffer: { type: 'uniform' } },
          { binding: 11, visibility: computeStage, buffer: { type: 'storage' } },
        ]
      });

      this.agentActBindGroup = this.device.createBindGroup({
        label: 'agent_act_bind_group',
        layout: this.agentActBindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: this.buffers.elevation } },
          { binding: 1, resource: { buffer: this.buffers.water } },
          { binding: 2, resource: { buffer: this.buffers.moisture } },
          { binding: 3, resource: { buffer: this.buffers.biomass } },
          { binding: 4, resource: { buffer: this.buffers.trample } },
          { binding: 5, resource: { buffer: this.buffers.fertility } },
          { binding: 6, resource: { buffer: this.buffers.scent } },
          { binding: 7, resource: { buffer: this.buffers.occupancy } },
          { binding: 8, resource: { buffer: this.buffers.agentState } },
          { binding: 9, resource: { buffer: this.buffers.agentOutputs } },
          { binding: 10, resource: { buffer: this.buffers.actUniforms } },
          { binding: 11, resource: { buffer: this.buffers.actionStats } },
        ]
      });

      const actPipelineLayout = this.device.createPipelineLayout({
        label: 'act_pipeline_layout',
        bindGroupLayouts: [this.agentActBindGroupLayout]
      });

      const actCode = await this._loadShader('agent_act');
      const actModule = this.device.createShaderModule({ label: 'agent_act', code: actCode });
      if (actModule.getCompilationInfo) {
        const compInfo = await actModule.getCompilationInfo();
        let hasError = false;
        for (const msg of compInfo.messages) {
          if (msg.type === 'error') {
            console.error(`[GpuEnvironment] WGSL compilation error in agent_act.wgsl [line ${msg.lineNum}:${msg.linePos}]: ${msg.message}`);
            hasError = true;
          }
        }
        if (hasError) {
          throw new Error('[GpuEnvironment] WGSL compilation failed for agent_act.wgsl');
        }
      }

      this.pipelines['agent_act'] = await this.device.createComputePipelineAsync({
        layout: actPipelineLayout,
        compute: {
          module: actModule,
          entryPoint: 'main'
        }
      });
      console.log('[GpuEnvironment] Agent action execution compute pipeline compiled asynchronously');

      // 11. Compile WebGPU Agent Lifecycle & Genetics Pipeline (Phase 14)
      this.agentLifecycleBindGroupLayout = this.device.createBindGroupLayout({
        label: 'agent_lifecycle_layout',
        entries: [
          { binding: 0, visibility: computeStage, buffer: { type: 'read-only-storage' } },
          { binding: 1, visibility: computeStage, buffer: { type: 'read-only-storage' } },
          { binding: 2, visibility: computeStage, buffer: { type: 'storage' } },
          { binding: 3, visibility: computeStage, buffer: { type: 'storage' } },
          { binding: 4, visibility: computeStage, buffer: { type: 'storage' } },
          { binding: 5, visibility: computeStage, buffer: { type: 'storage' } },
          { binding: 6, visibility: computeStage, buffer: { type: 'storage' } },
          { binding: 7, visibility: computeStage, buffer: { type: 'storage' } },
          { binding: 8, visibility: computeStage, buffer: { type: 'uniform' } },
        ]
      });

      this.agentLifecycleBindGroup = this.device.createBindGroup({
        label: 'agent_lifecycle_bind_group',
        layout: this.agentLifecycleBindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: this.buffers.elevation } },
          { binding: 1, resource: { buffer: this.buffers.water } },
          { binding: 2, resource: { buffer: this.buffers.occupancy } },
          { binding: 3, resource: { buffer: this.buffers.agentState } },
          { binding: 4, resource: { buffer: this.buffers.agentWeights } },
          { binding: 5, resource: { buffer: this.buffers.agentHidden } },
          { binding: 6, resource: { buffer: this.buffers.slotOccupied } },
          { binding: 7, resource: { buffer: this.buffers.lifecycleGlobals } },
          { binding: 8, resource: { buffer: this.buffers.lifecycleUniforms } },
        ]
      });

      const lifecyclePipelineLayout = this.device.createPipelineLayout({
        label: 'lifecycle_pipeline_layout',
        bindGroupLayouts: [this.agentLifecycleBindGroupLayout]
      });

      const lifecycleCode = await this._loadShader('agent_lifecycle');
      const lifecycleModule = this.device.createShaderModule({ label: 'agent_lifecycle', code: lifecycleCode });
      if (lifecycleModule.getCompilationInfo) {
        const compInfo = await lifecycleModule.getCompilationInfo();
        let hasError = false;
        for (const msg of compInfo.messages) {
          if (msg.type === 'error') {
            console.error(`[GpuEnvironment] WGSL compilation error in agent_lifecycle.wgsl [line ${msg.lineNum}:${msg.linePos}]: ${msg.message}`);
            hasError = true;
          }
        }
        if (hasError) {
          throw new Error('[GpuEnvironment] WGSL compilation failed for agent_lifecycle.wgsl');
        }
      }

      this.pipelines['agent_lifecycle'] = await this.device.createComputePipelineAsync({
        layout: lifecyclePipelineLayout,
        compute: {
          module: lifecycleModule,
          entryPoint: 'main'
        }
      });
      console.log('[GpuEnvironment] Agent lifecycle compute pipeline compiled asynchronously');

      // Staging buffers for agent diagnostics / inspection
      this.agentOutputStagingBuffer = this.device.createBuffer({
        size: this.maxAgents * 64,
        usage: (globalThis.GPUBufferUsage?.MAP_READ || BUFFER_USAGE.MAP_READ) |
               (globalThis.GPUBufferUsage?.COPY_DST || BUFFER_USAGE.COPY_DST),
        label: 'agent_outputs_staging'
      });

      this.agentStateStagingBuffer = this.device.createBuffer({
        size: this.maxAgents * 64,
        usage: (globalThis.GPUBufferUsage?.MAP_READ || BUFFER_USAGE.MAP_READ) |
               (globalThis.GPUBufferUsage?.COPY_DST || BUFFER_USAGE.COPY_DST),
        label: 'agent_state_staging'
      });

      // Combined stats staging: [0..40) actionStats (10 x u32), [40..60) lifecycleGlobals (5 x u32)
      this.statsStagingBuffer = this.device.createBuffer({
        size: 60,
        usage: (globalThis.GPUBufferUsage?.MAP_READ || BUFFER_USAGE.MAP_READ) |
               (globalThis.GPUBufferUsage?.COPY_DST || BUFFER_USAGE.COPY_DST),
        label: 'stats_staging'
      });

      this.isInitialized = true;
      console.log('[GpuEnvironment] init() complete');
      return true;
    } catch (err) {
      console.error('[GpuEnvironment] Initialization failed:', err);
      this.destroy();
      return false;
    }
  }

  /**
   * Drain completed staging buffers into CPU grid and agent array for canvas/UI rendering.
   * Zero allocation in the hot loop.
   * @param {Simulation} [simulation]
   */
  _drainStagingBuffers(simulation) {
    // 1. Drain terrain staging buffers into grid
    for (let i = 0; i < 2; i++) {
      if (this.stagingStates[i] === STAGING_STATE.MAPPED) {
        const buf = this.stagingBuffers[i];
        try {
          const mapped = new Float32Array(buf.getMappedRange());
          this.grid.elevation.set(mapped.subarray(0, this.size));
          this.grid.water.set(mapped.subarray(this.size, 2 * this.size));
          this.grid.moisture.set(mapped.subarray(2 * this.size, 3 * this.size));
          this.grid.biomass.set(mapped.subarray(3 * this.size, 4 * this.size));
          this.grid.trample.set(mapped.subarray(4 * this.size, 5 * this.size));
          this.grid.scent.set(mapped.subarray(5 * this.size, 6 * this.size));
          buf.unmap();
        } catch (err) {
          console.warn('[GpuEnvironment] Drain terrain error:', err);
        }
        this.stagingStates[i] = STAGING_STATE.IDLE;
        this.mapPromises[i] = null;
      }
    }

    // 2. Drain agent state staging buffer into simulation.agents
    if (this.agentStateStagingMapped && this.agentStateStagingBuffer) {
      try {
        const byteSize = this.maxAgents * 64;
        const range = this.agentStateStagingBuffer.getMappedRange(0, byteSize);
        const mapped = new ArrayBuffer(byteSize);
        new Uint8Array(mapped).set(new Uint8Array(range));
        this.agentStateStagingBuffer.unmap();
        this.agentStateStagingMapped = false;

        if (simulation) {
          const u32 = new Uint32Array(mapped);
          const f32 = new Float32Array(mapped);
          const i32 = new Int32Array(mapped);

          const living = [];
          let totalEnergy = 0;
          let maxGen = 1;
          let genSum = 0;

          for (let i = 0; i < this.maxAgents; i++) {
            const b = i * 16;
            const alive = u32[b + 6];
            const energy = f32[b + 2];
            if (alive === 1 && energy > 0) {
              const id = u32[b + 5];
              const gen = u32[b + 4];
              if (gen > maxGen) maxGen = gen;
              genSum += gen;
              totalEnergy += energy;

              const r = Math.min(240, Math.max(50, Math.floor(f32[b + 11] * 200 + 40)));
              const g = Math.min(240, Math.max(50, Math.floor(f32[b + 12] * 200 + 40)));
              const bl = Math.min(240, Math.max(50, Math.floor(f32[b + 13] * 200 + 40)));

              living.push({
                id,
                x: u32[b + 0],
                y: u32[b + 1],
                energy,
                age: u32[b + 3],
                generation: gen,
                isDead: false,
                lastAction: u32[b + 7],
                lastActionResult: f32[b + 8],
                lastMoveDir: i32[b + 9],
                fitness: f32[b + 10],
                speciesR: f32[b + 11],
                speciesG: f32[b + 12],
                speciesB: f32[b + 13],
                seedsSown: u32[b + 14],
                biomassEaten: f32[b + 15],
                color: `rgb(${r},${g},${bl})`
              });
            }
          }

          simulation.agents = living;
          simulation.stats.population = living.length;
          simulation.stats.generationMax = maxGen;
          if (maxGen > simulation.stats.generationMaxAllTime) {
            simulation.stats.generationMaxAllTime = maxGen;
          }
          simulation.stats.generationAvg = living.length > 0 ? Number((genSum / living.length).toFixed(1)) : 0;
          simulation.stats.averageEnergy = living.length > 0 ? Number((totalEnergy / living.length).toFixed(1)) : 0;

          // Drain accumulated per-window action tally & birth/death counters (mirrors CPU
          // dynamicsAccumulator: cumulative across every tick in the window, not just the
          // final tick's instantaneous action per agent).
          const gpuActions = {
            idle: 0,
            move: 0,
            moveCollisions: 0,
            graze: 0,
            grazeFailures: 0,
            digTrench: 0,
            moundEarth: 0,
            emitScent: 0,
            sowSeeds: 0,
            sowFailures: 0
          };
          let gpuBirths = 0, gpuDeathsStarvation = 0, gpuDeathsAge = 0;

          if (this.statsStagingMapped && this.statsStagingBuffer) {
            try {
              const range = this.statsStagingBuffer.getMappedRange(0, 60);
              const statsU32 = new Uint32Array(range.slice(0));
              this.statsStagingBuffer.unmap();
              this.statsStagingMapped = false;

              gpuActions.idle = statsU32[0];
              gpuActions.move = statsU32[1];
              gpuActions.moveCollisions = statsU32[2];
              gpuActions.graze = statsU32[3];
              gpuActions.grazeFailures = statsU32[4];
              gpuActions.digTrench = statsU32[5];
              gpuActions.moundEarth = statsU32[6];
              gpuActions.emitScent = statsU32[7];
              gpuActions.sowSeeds = statsU32[8];
              gpuActions.sowFailures = statsU32[9];

              // lifecycleGlobals: [10]=nextAgentId [11]=livingCount [12]=birthCount
              //                   [13]=deathsStarvation [14]=deathsAge
              gpuBirths = statsU32[12];
              gpuDeathsStarvation = statsU32[13];
              gpuDeathsAge = statsU32[14];

              // Reset per-window counters for the next snapshot interval (leave
              // nextAgentId/livingCount untouched — they are not window-scoped).
              this.device.queue.writeBuffer(this.buffers.actionStats, 0, new Uint32Array(10));
              this.device.queue.writeBuffer(this.buffers.lifecycleGlobals, 8, new Uint32Array(3));
            } catch (err) {
              console.warn('[GpuEnvironment] Drain stats error:', err);
              this.statsStagingMapped = false;
            }
          }

          if (typeof simulation.onDynamicsSnapshot === 'function') {
            let totalWater = 0;
            let totalMoisture = 0;
            let totalBiomass = 0;
            const size = this.grid.size;
            const water = this.grid.water;
            const moisture = this.grid.moisture;
            const biomass = this.grid.biomass;
            for (let i = 0; i < size; i++) {
              totalWater += water[i];
              totalMoisture += moisture[i];
              totalBiomass += biomass[i];
            }

            simulation.onDynamicsSnapshot({
              engine: 'gpu',
              tick: simulation.tickCount,
              population: living.length,
              avgEnergy: living.length > 0 ? Number((totalEnergy / living.length).toFixed(2)) : 0,
              maxGen,
              avgGen: living.length > 0 ? Number((genSum / living.length).toFixed(2)) : 0,
              totalBiomass: Math.round(totalBiomass * 10) / 10,
              totalWater: Math.round(totalWater * 10) / 10,
              totalMoisture: Math.round(totalMoisture * 10) / 10,
              births: gpuBirths,
              deathsStarvation: gpuDeathsStarvation,
              deathsAge: gpuDeathsAge,
              caloriesGainedGraze: 0,
              caloriesGainedRoots: 0,
              caloriesBurnedMetabolism: 0,
              caloriesBurnedMovement: 0,
              actions: gpuActions
            });
          }
        }
      } catch (err) {
        console.warn('[GpuEnvironment] Drain agent state error:', err);
        this.agentStateStagingMapped = false;
      }
    }
  }

  /**
   * Run 100% closed-loop GPU simulation tick(s).
   * All state (8 Environmental CA passes + Sense + Brain + Act + Lifecycle) remains in VRAM.
   * Staging buffers are drained and requested at presentation cadence (~16ms for normal, ~250ms for Turbo).
   * @param {number} [batchTicks=1] Number of simulation ticks to dispatch
   * @param {boolean} [isRadiationMode=false] Radiation lab mode toggle
   * @param {Simulation} [simulation] Parent simulation instance
   */
  stepSimulation(batchTicks = 1, isRadiationMode = false, simulation = null, allowReadback = true) {
    if (!this.isInitialized || this.isFlushing) return;

    // 1. Drain completed staging buffer into CPU grid arrays & agent array (if mapped)
    this._drainStagingBuffers(simulation);

    const byteSize = this.size * 4;
    const dispatchX = Math.ceil(this.width / 8);
    const dispatchY = Math.ceil(this.height / 8);
    const agentWorkgroups = Math.ceil(this.maxAgents / 64);

    // Update common agent uniforms for this batch
    if (this.buffers.senseUniforms) {
      const sUniforms = new Uint32Array(8);
      const sFloatView = new Float32Array(sUniforms.buffer);
      sUniforms[0] = this.width;
      sUniforms[1] = this.height;
      sUniforms[2] = this.maxAgents;
      sFloatView[3] = CONFIG.MAX_ENERGY || 250.0;
      sFloatView[4] = CONFIG.MAX_AGE || 1800.0;
      this.device.queue.writeBuffer(this.buffers.senseUniforms, 0, sUniforms);
    }

    if (this.buffers.actUniforms) {
      const aUniforms = new Uint32Array(24);
      const aFloatView = new Float32Array(aUniforms.buffer);
      aUniforms[0] = this.width;
      aUniforms[1] = this.height;
      aUniforms[2] = this.maxAgents;
      aUniforms[3] = CONFIG.COASTAL_BORDER_WIDTH || 3;
      aFloatView[4] = CONFIG.COASTAL_EXPOSURE_DRAIN || 0.35;
      aFloatView[5] = CONFIG.BASAL_METABOLIC_DRAIN || 0.20;
      aFloatView[6] = CONFIG.MOISTURE_METABOLIC_RELIEF || 0.40;
      aFloatView[7] = CONFIG.AQUATIC_SAFE_DEPTH || 0.15;
      aFloatView[8] = CONFIG.AQUATIC_EXPOSURE_DRAIN || 0.35;
      aFloatView[9] = CONFIG.STATIONARY_TRAMPLE_DEPOSIT || 0.04;
      aFloatView[10] = CONFIG.MOVE_ENERGY_BASE || 0.28;
      aFloatView[11] = CONFIG.TRAMPLE_DEPOSIT || 0.25;
      aFloatView[12] = CONFIG.GRAZE_MAX_INTAKE || 20.0;
      aFloatView[13] = CONFIG.FERTILITY_GRAZE_DEPLETION || 0.005;
      aFloatView[14] = CONFIG.TERRAFORM_ENERGY_COST || 2.5;
      aFloatView[15] = CONFIG.TERRAFORM_MAX_ELEVATION || 0.72;
      aFloatView[16] = CONFIG.ROOT_HARVEST_MAX || 4.5;
      aFloatView[17] = CONFIG.SCENT_COST || 0.08;
      aFloatView[18] = CONFIG.SCENT_DEPOSIT || 1.0;
      aFloatView[19] = CONFIG.SEED_SOW_COST || 2.5;
      aFloatView[20] = CONFIG.SEED_GERM_MIN_MOISTURE || 0.30;
      aFloatView[21] = CONFIG.SEED_GERM_MAX_TRAMPLE || 0.45;
      aFloatView[22] = CONFIG.SEED_GERM_BIOMASS || 0.04;
      aFloatView[23] = CONFIG.MAX_ENERGY || 250.0;
      this.device.queue.writeBuffer(this.buffers.actUniforms, 0, aUniforms);
    }

    if (this.buffers.lifecycleUniforms) {
      const radMult = isRadiationMode ? 4.0 : 1.0;
      const lUniforms = new Uint32Array(12);
      const lFloatView = new Float32Array(lUniforms.buffer);
      lUniforms[0] = this.width;
      lUniforms[1] = this.height;
      lUniforms[2] = this.maxAgents;
      lUniforms[3] = (simulation && simulation.maxPopulation) ? simulation.maxPopulation : (CONFIG.MAX_POPULATION || 800);
      lUniforms[4] = CONFIG.COASTAL_BORDER_WIDTH || 3;
      lUniforms[5] = CONFIG.MAX_AGE || 1800;
      lUniforms[6] = this.tickCount;
      lUniforms[7] = (this.tickCount * 1103515245 + 12345) >>> 0;
      lFloatView[8] = CONFIG.REPRODUCTION_THRESHOLD || 115.0;
      lFloatView[9] = CONFIG.REPRODUCTION_SPLIT || 0.5;
      lFloatView[10] = (CONFIG.MUTATION_RATE_DEFAULT || 0.08) * radMult;
      lFloatView[11] = isRadiationMode ? 0.45 : 0.20;
      this.device.queue.writeBuffer(this.buffers.lifecycleUniforms, 0, lUniforms);
    }

    if (this.buffers.brainUniforms) {
      const bUniforms = new Uint32Array(8);
      const bFloatView = new Float32Array(bUniforms.buffer);
      bUniforms[0] = this.maxAgents;
      bUniforms[1] = 37;
      bUniforms[2] = 24;
      bUniforms[3] = 10;
      bFloatView[4] = 0.5;
      bUniforms[5] = this.tickCount;
      bUniforms[6] = (this.tickCount * 1664525 + 1013904223) >>> 0;
      bUniforms[7] = 0;
      this.device.queue.writeBuffer(this.buffers.brainUniforms, 0, bUniforms);
    }

    const encoder = this.device.createCommandEncoder({ label: 'closed_loop_sim_encoder' });

    for (let t = 0; t < batchTicks; t++) {
      this.tickCount++;

      // CA Rain parameters
      this.uniformU32[23] = this.tickCount;
      if (Math.random() < CONFIG.RAIN_PROBABILITY) {
        this.uniformF32[4] = 1.0;
        this.uniformF32[6] = Math.floor(Math.random() * this.width);
        this.uniformF32[7] = Math.floor(Math.random() * this.height);
        this.uniformF32[8] = 6 + Math.floor(Math.random() * 8);
        this.uniformF32[5] = CONFIG.RAIN_INTENSITY * (0.5 + Math.random() * 0.5);
      } else {
        this.uniformF32[4] = 0.0;
      }
      this.device.queue.writeBuffer(this.buffers.uniforms, 0, this.uniformArrayBuffer);

      // --- 8 Environmental CA Passes ---
      {
        const pass = encoder.beginComputePass({ label: 'ca_water_sources' });
        pass.setPipeline(this.pipelines.water_sources);
        pass.setBindGroup(0, this.bindGroup);
        pass.dispatchWorkgroups(dispatchX, dispatchY);
        pass.end();
      }
      {
        const pass = encoder.beginComputePass({ label: 'ca_rain_evap' });
        pass.setPipeline(this.pipelines.rain_evaporation);
        pass.setBindGroup(0, this.bindGroup);
        pass.dispatchWorkgroups(dispatchX, dispatchY);
        pass.end();
      }
      {
        const pass = encoder.beginComputePass({ label: 'ca_hydrology' });
        pass.setPipeline(this.pipelines.hydrology);
        pass.setBindGroup(0, this.bindGroup);
        pass.dispatchWorkgroups(dispatchX, dispatchY);
        pass.end();
        encoder.copyBufferToBuffer(this.buffers.tmp_a, 0, this.buffers.water, 0, byteSize);
      }
      {
        const pass = encoder.beginComputePass({ label: 'ca_erosion' });
        pass.setPipeline(this.pipelines.erosion);
        pass.setBindGroup(0, this.bindGroup);
        pass.dispatchWorkgroups(dispatchX, dispatchY);
        pass.end();
        encoder.copyBufferToBuffer(this.buffers.tmp_a, 0, this.buffers.elevation, 0, byteSize);
      }
      {
        const pass = encoder.beginComputePass({ label: 'ca_moisture' });
        pass.setPipeline(this.pipelines.moisture);
        pass.setBindGroup(0, this.bindGroup);
        pass.dispatchWorkgroups(dispatchX, dispatchY);
        pass.end();
        encoder.copyBufferToBuffer(this.buffers.tmp_a, 0, this.buffers.moisture, 0, byteSize);
      }
      {
        const pass = encoder.beginComputePass({ label: 'ca_vegetation' });
        pass.setPipeline(this.pipelines.vegetation);
        pass.setBindGroup(0, this.bindGroup);
        pass.dispatchWorkgroups(dispatchX, dispatchY);
        pass.end();
        encoder.copyBufferToBuffer(this.buffers.tmp_a, 0, this.buffers.biomass, 0, byteSize);
      }
      {
        const pass = encoder.beginComputePass({ label: 'ca_trail_decay' });
        pass.setPipeline(this.pipelines.trail_decay);
        pass.setBindGroup(0, this.bindGroup);
        pass.dispatchWorkgroups(dispatchX, dispatchY);
        pass.end();
      }
      {
        const pass = encoder.beginComputePass({ label: 'ca_pheromone' });
        pass.setPipeline(this.pipelines.pheromone);
        pass.setBindGroup(0, this.bindGroup);
        pass.dispatchWorkgroups(dispatchX, dispatchY);
        pass.end();
        encoder.copyBufferToBuffer(this.buffers.tmp_a, 0, this.buffers.scent, 0, byteSize);
      }

      // --- 4 Agent Passes ---
      if (this.pipelines.agent_sense && this.agentSenseBindGroup) {
        const pass = encoder.beginComputePass({ label: 'agent_sense_pass' });
        pass.setPipeline(this.pipelines.agent_sense);
        pass.setBindGroup(0, this.agentSenseBindGroup);
        pass.dispatchWorkgroups(agentWorkgroups, 1, 1);
        pass.end();
      }

      if (this.pipelines.agent_brain && this.agentBrainBindGroup) {
        const pass = encoder.beginComputePass({ label: 'agent_brain_pass' });
        pass.setPipeline(this.pipelines.agent_brain);
        pass.setBindGroup(0, this.agentBrainBindGroup);
        pass.dispatchWorkgroups(agentWorkgroups, 1, 1);
        pass.end();
      }

      if (this.pipelines.agent_act && this.agentActBindGroup) {
        const pass = encoder.beginComputePass({ label: 'agent_act_pass' });
        pass.setPipeline(this.pipelines.agent_act);
        pass.setBindGroup(0, this.agentActBindGroup);
        pass.dispatchWorkgroups(agentWorkgroups, 1, 1);
        pass.end();
      }

      if (this.pipelines.agent_lifecycle && this.agentLifecycleBindGroup) {
        const pass = encoder.beginComputePass({ label: 'agent_lifecycle_pass' });
        pass.setPipeline(this.pipelines.agent_lifecycle);
        pass.setBindGroup(0, this.agentLifecycleBindGroup);
        pass.dispatchWorkgroups(agentWorkgroups, 1, 1);
        pass.end();
      }
    }

    // Rate-limited presentation readback (at ~16–60 FPS)
    const now = performance.now();
    if (
      allowReadback &&
      (now - this.lastGpuTickTime >= this.minIntervalMs) &&
      (this.stagingStates[this.currentStagingIdx] === STAGING_STATE.IDLE) &&
      !this.agentStateStagingPending &&
      !this.statsStagingPending
    ) {
      const targetStaging = this.stagingBuffers[this.currentStagingIdx];
      const writeIdx = this.currentStagingIdx;

      encoder.copyBufferToBuffer(this.buffers.elevation, 0, targetStaging, 0, byteSize);
      encoder.copyBufferToBuffer(this.buffers.water, 0, targetStaging, byteSize, byteSize);
      encoder.copyBufferToBuffer(this.buffers.moisture, 0, targetStaging, 2 * byteSize, byteSize);
      encoder.copyBufferToBuffer(this.buffers.biomass, 0, targetStaging, 3 * byteSize, byteSize);
      encoder.copyBufferToBuffer(this.buffers.trample, 0, targetStaging, 4 * byteSize, byteSize);
      encoder.copyBufferToBuffer(this.buffers.scent, 0, targetStaging, 5 * byteSize, byteSize);

      if (this.agentStateStagingBuffer) {
        encoder.copyBufferToBuffer(this.buffers.agentState, 0, this.agentStateStagingBuffer, 0, this.maxAgents * 64);
      }

      if (this.statsStagingBuffer) {
        encoder.copyBufferToBuffer(this.buffers.actionStats, 0, this.statsStagingBuffer, 0, 40);
        encoder.copyBufferToBuffer(this.buffers.lifecycleGlobals, 0, this.statsStagingBuffer, 40, 20);
      }

      this.device.queue.submit([encoder.finish()]);
      this.lastGpuTickTime = now;

      this.stagingStates[writeIdx] = STAGING_STATE.IN_FLIGHT;
      this.agentStateStagingPending = true;
      this.statsStagingPending = true;

      const mapRead = globalThis.GPUMapMode?.READ || MAP_MODE.READ;
      targetStaging.mapAsync(mapRead, 0, 6 * byteSize).then(() => {
        this.stagingStates[writeIdx] = STAGING_STATE.MAPPED;
      }).catch(() => {
        this.stagingStates[writeIdx] = STAGING_STATE.IDLE;
      });

      if (this.agentStateStagingBuffer) {
        this.agentStateStagingBuffer.mapAsync(mapRead, 0, this.maxAgents * 64).then(() => {
          this.agentStateStagingMapped = true;
          this.agentStateStagingPending = false;
        }).catch(() => {
          this.agentStateStagingPending = false;
        });
      }

      if (this.statsStagingBuffer) {
        this.statsStagingBuffer.mapAsync(mapRead, 0, 60).then(() => {
          this.statsStagingMapped = true;
          this.statsStagingPending = false;
        }).catch(() => {
          this.statsStagingPending = false;
        });
      }

      this.currentStagingIdx = 1 - this.currentStagingIdx;
    } else {
      this.device.queue.submit([encoder.finish()]);
    }
  }

  /**
   * Run one full GPU environmental tick (mirrors Environment.tick()).
   * Zero new JS object allocations per call.
   */
  tick() {
    this.stepSimulation(1, false, null);
  }

  /**
   * Synchronously flush and await completion of GPU work and drain staging buffer into grid.
   * Useful for testing, single-step diagnostics, or clean shutdown before disabling GPU.
   */
  async syncReadback() {
    if (!this.isInitialized) return;
    this.isFlushing = true;
    try {
      await this.device.queue.onSubmittedWorkDone();

      for (let i = 0; i < 2; i++) {
        if (this.mapPromises[i]) {
          try {
            await this.mapPromises[i];
            this.stagingStates[i] = STAGING_STATE.MAPPED;
          } catch (e) {}
          this.mapPromises[i] = null;
        }
      }

      for (let i = 0; i < 2; i++) {
        if (this.stagingStates[i] === STAGING_STATE.MAPPED) {
          const buf = this.stagingBuffers[i];
          try {
            const mapped = new Float32Array(buf.getMappedRange());
            this.grid.elevation.set(mapped.subarray(0, this.size));
            this.grid.water.set(mapped.subarray(this.size, 2 * this.size));
            this.grid.moisture.set(mapped.subarray(2 * this.size, 3 * this.size));
            this.grid.biomass.set(mapped.subarray(3 * this.size, 4 * this.size));
            this.grid.trample.set(mapped.subarray(4 * this.size, 5 * this.size));
            this.grid.scent.set(mapped.subarray(5 * this.size, 6 * this.size));
            buf.unmap();
          } catch (e) {}
          this.stagingStates[i] = STAGING_STATE.IDLE;
        }
      }
    } catch (err) {
      console.warn('[GpuEnvironment] syncReadback error:', err);
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Run batch of ticks and perform synchronous presentation readback and telemetry snapshot.
   * Designed specifically for parity harnesses and headless test runners.
   * @param {number} [batchTicks=1] Number of ticks to run
   * @param {boolean} [isRadiationMode=false]
   * @param {Simulation} [simulation]
   */
  async stepAndDrain(batchTicks = 1, isRadiationMode = false, simulation = null) {
    if (!this.isInitialized || this.isFlushing) return;

    // Drain any leftover mapped state
    this._drainStagingBuffers(simulation);

    // 1. Run the simulation steps without scheduling presentation readbacks
    for (let t = 0; t < batchTicks; t++) {
      this.stepSimulation(1, isRadiationMode, null, false);
    }

    // 2. Submit explicit readback copies for terrain and agent state
    const byteSize = this.size * 4;
    const encoder = this.device.createCommandEncoder({ label: 'sync_drain_encoder' });
    const targetStaging = this.stagingBuffers[0];

    encoder.copyBufferToBuffer(this.buffers.elevation, 0, targetStaging, 0, byteSize);
    encoder.copyBufferToBuffer(this.buffers.water, 0, targetStaging, byteSize, byteSize);
    encoder.copyBufferToBuffer(this.buffers.moisture, 0, targetStaging, 2 * byteSize, byteSize);
    encoder.copyBufferToBuffer(this.buffers.biomass, 0, targetStaging, 3 * byteSize, byteSize);
    encoder.copyBufferToBuffer(this.buffers.trample, 0, targetStaging, 4 * byteSize, byteSize);
    encoder.copyBufferToBuffer(this.buffers.scent, 0, targetStaging, 5 * byteSize, byteSize);

    if (this.agentStateStagingBuffer) {
      encoder.copyBufferToBuffer(this.buffers.agentState, 0, this.agentStateStagingBuffer, 0, this.maxAgents * 64);
    }

    if (this.statsStagingBuffer) {
      encoder.copyBufferToBuffer(this.buffers.actionStats, 0, this.statsStagingBuffer, 0, 40);
      encoder.copyBufferToBuffer(this.buffers.lifecycleGlobals, 0, this.statsStagingBuffer, 40, 20);
    }

    this.device.queue.submit([encoder.finish()]);
    await this.device.queue.onSubmittedWorkDone();

    const mapRead = globalThis.GPUMapMode?.READ || MAP_MODE.READ;

    const mapPromises = [targetStaging.mapAsync(mapRead, 0, 6 * byteSize)];
    if (this.agentStateStagingBuffer) {
      mapPromises.push(this.agentStateStagingBuffer.mapAsync(mapRead, 0, this.maxAgents * 64));
    }
    if (this.statsStagingBuffer) {
      mapPromises.push(this.statsStagingBuffer.mapAsync(mapRead, 0, 60));
    }

    await Promise.all(mapPromises);

    this.stagingStates[0] = STAGING_STATE.MAPPED;
    this.agentStateStagingMapped = true;
    this.statsStagingMapped = true;

    // 3. Drain newly mapped buffers into simulation and trigger onDynamicsSnapshot
    this._drainStagingBuffers(simulation);
  }

  /**
   * Upload CPU agents into GPU buffers for initialization or handover.
   * Serializes agent state, RNN weights, and recurrent hidden carry buffers into flat VRAM buffers.
   * @param {Agent[]} agents Array of active CPU Agent instances
   * @param {number} [seed=12345] Random seed for GPU PRNG
   */
  uploadAgentData(agents, seed = 12345) {
    if (!this.isInitialized || !agents || !this.buffers) return;
    const count = Math.min(agents.length, this.maxAgents);

    const stateArray = new Uint32Array(this.maxAgents * 16);
    const stateFloatView = new Float32Array(stateArray.buffer);
    const stateIntView = new Int32Array(stateArray.buffer);

    const weightsArray = new Float32Array(this.maxAgents * 1738);
    const hiddenArray = new Float32Array(this.maxAgents * 24);
    const inputsArray = new Float32Array(this.maxAgents * 37);

    for (let i = 0; i < count; i++) {
      const a = agents[i];
      if (!a) continue;

      const sBase = i * 16;
      stateArray[sBase + 0] = a.x;
      stateArray[sBase + 1] = a.y;
      stateFloatView[sBase + 2] = a.energy;
      stateArray[sBase + 3] = a.age;
      stateArray[sBase + 4] = a.generation;
      stateArray[sBase + 5] = a.id;
      stateArray[sBase + 6] = a.isDead ? 0 : 1;
      stateArray[sBase + 7] = a.lastAction || 0;
      stateFloatView[sBase + 8] = a.lastActionResult || 0;
      stateIntView[sBase + 9] = (typeof a.lastMoveDir === 'number') ? a.lastMoveDir : -1;
      stateFloatView[sBase + 10] = a.fitness || 0;
      if (a.brain && a.brain.weightsInput) {
        const w = a.brain.weightsInput;
        const third = Math.floor(w.length / 3);
        let rSum = 0, gSum = 0, bSum = 0;
        for (let j = 0; j < third; j++) rSum += Math.abs(w[j]);
        for (let j = third; j < third * 2; j++) gSum += Math.abs(w[j]);
        for (let j = third * 2; j < w.length; j++) bSum += Math.abs(w[j]);
        stateFloatView[sBase + 11] = Math.min(1.0, rSum / third);
        stateFloatView[sBase + 12] = Math.min(1.0, gSum / third);
        stateFloatView[sBase + 13] = Math.min(1.0, bSum / third);
      } else {
        stateFloatView[sBase + 11] = 0.3;
        stateFloatView[sBase + 12] = 0.8;
        stateFloatView[sBase + 13] = 0.4;
      }
      stateArray[sBase + 14] = a.seedsSown || 0;
      stateFloatView[sBase + 15] = a.biomassEaten || 0;

      // Weights layout:
      // weightsInput (888), weightsRecurrent (576), weightsOutput (240), biasesHidden (24), biasesOutput (10)
      if (a.brain) {
        const wBase = i * 1738;
        if (a.brain.weightsInput) weightsArray.set(a.brain.weightsInput, wBase);
        if (a.brain.weightsRecurrent) weightsArray.set(a.brain.weightsRecurrent, wBase + 888);
        if (a.brain.weightsOutput) weightsArray.set(a.brain.weightsOutput, wBase + 1464);
        if (a.brain.biasesHidden) weightsArray.set(a.brain.biasesHidden, wBase + 1704);
        if (a.brain.biasesOutput) weightsArray.set(a.brain.biasesOutput, wBase + 1728);

        if (a.brain.hiddenState) {
          hiddenArray.set(a.brain.hiddenState, i * 24);
        }
      }

      if (a.sensorBuffer) {
        inputsArray.set(a.sensorBuffer, i * 37);
      }
    }

    this.device.queue.writeBuffer(this.buffers.agentState, 0, stateArray);
    this.device.queue.writeBuffer(this.buffers.agentWeights, 0, weightsArray);
    this.device.queue.writeBuffer(this.buffers.agentHidden, 0, hiddenArray);
    this.device.queue.writeBuffer(this.buffers.agentInputs, 0, inputsArray);

    // Brain Uniforms: agentCount, inputSize (37), hiddenSize (24), outputSize (10), temperature, tickCount, seed, pad
    const bUniforms = new Uint32Array(8);
    const bFloatView = new Float32Array(bUniforms.buffer);
    bUniforms[0] = count;
    bUniforms[1] = 37;
    bUniforms[2] = 24;
    bUniforms[3] = 10;
    // Construct and upload slot-indexed occupancy buffer
    const occArray = new Int32Array(this.size).fill(-1);
    for (let i = 0; i < count; i++) {
      const a = agents[i];
      if (a && !a.isDead) {
        occArray[a.y * this.width + a.x] = i;
      }
    }
    this.device.queue.writeBuffer(this.buffers.occupancy, 0, occArray);

    bFloatView[4] = 0.5; // temperature
    bUniforms[5] = this.tickCount;
    bUniforms[6] = seed;
    bUniforms[7] = 0;
    this.device.queue.writeBuffer(this.buffers.brainUniforms, 0, bUniforms);

    // Lifecycle: initialize slotOccupied and lifecycleGlobals
    const slotArray = new Uint32Array(this.maxAgents);
    let maxId = 1;
    let livingCount = 0;
    for (let i = 0; i < count; i++) {
      if (agents[i] && !agents[i].isDead) {
        slotArray[i] = 1;
        livingCount++;
        if (agents[i].id >= maxId) maxId = agents[i].id + 1;
      }
    }
    this.device.queue.writeBuffer(this.buffers.slotOccupied, 0, slotArray);

    const globalsArray = new Uint32Array(5);
    globalsArray[0] = maxId;       // nextAgentId
    globalsArray[1] = livingCount; // livingCount
    globalsArray[2] = 0;           // birthCount
    globalsArray[3] = 0;           // deathsStarvation
    globalsArray[4] = 0;           // deathsAge
    this.device.queue.writeBuffer(this.buffers.lifecycleGlobals, 0, globalsArray);

    // Reset per-window action tally for a clean start
    this.device.queue.writeBuffer(this.buffers.actionStats, 0, new Uint32Array(10));
  }

  /**
   * Dispatch agent perception compute shader to populate the 37-element sensory input buffer.
   * @param {GPUCommandEncoder} encoder Active WebGPU command encoder
   * @param {number} agentCount Number of agents to evaluate
   */
  dispatchAgentSense(encoder, agentCount) {
    if (!this.isInitialized || !this.pipelines?.agent_sense || !encoder) return;
    const count = Math.min(agentCount, this.maxAgents);
    if (count === 0) return;

    // Update sense uniforms: width, height, agentCount, maxEnergy, maxAge
    const sUniforms = new Uint32Array(8);
    const sFloatView = new Float32Array(sUniforms.buffer);
    sUniforms[0] = this.width;
    sUniforms[1] = this.height;
    sUniforms[2] = count;
    sFloatView[3] = CONFIG.MAX_ENERGY || 250.0;
    sFloatView[4] = CONFIG.MAX_AGE || 1200.0;
    this.device.queue.writeBuffer(this.buffers.senseUniforms, 0, sUniforms);

    const pass = encoder.beginComputePass({ label: 'agent_sense_pass' });
    pass.setPipeline(this.pipelines.agent_sense);
    pass.setBindGroup(0, this.agentSenseBindGroup);
    const workgroups = Math.ceil(count / 64);
    pass.dispatchWorkgroups(workgroups, 1, 1);
    pass.end();
  }

  /**
   * Dispatch agent brain compute shader.
   * @param {GPUCommandEncoder} encoder Active WebGPU command encoder
   * @param {number} agentCount Number of agents to evaluate
   * @param {number} tickCount Current simulation tick
   * @param {number} [temperature=0.5] Softmax sampling temperature
   */
  dispatchAgentBrain(encoder, agentCount, tickCount, temperature = 0.5) {
    if (!this.isInitialized || !this.pipelines?.agent_brain || !encoder) return;
    const count = Math.min(agentCount, this.maxAgents);
    if (count === 0) return;

    const bUniforms = new Uint32Array(8);
    const bFloatView = new Float32Array(bUniforms.buffer);
    bUniforms[0] = count;
    bUniforms[1] = 37;
    bUniforms[2] = 24;
    bUniforms[3] = 10;
    bFloatView[4] = temperature;
    bUniforms[5] = tickCount;
    bUniforms[6] = 42;
    bUniforms[7] = 0;
    this.device.queue.writeBuffer(this.buffers.brainUniforms, 0, bUniforms);

    const pass = encoder.beginComputePass({ label: 'agent_brain_pass' });
    pass.setPipeline(this.pipelines.agent_brain);
    pass.setBindGroup(0, this.agentBrainBindGroup);
    const workgroups = Math.ceil(count / 64);
    pass.dispatchWorkgroups(workgroups, 1, 1);
    pass.end();
  }

  /**
   * Diagnostic readback of agent brain output logits and chosen actions.
   * @param {number} [count] Number of agents to read back
   * @returns {Promise<Array<{chosenAction: number, logits: Float32Array}>>}
   */
  async readAgentOutputs(count = this.maxAgents) {
    if (!this.isInitialized || !this.agentOutputStagingBuffer) return [];
    const readCount = Math.min(count, this.maxAgents);
    const byteSize = readCount * 64;

    const encoder = this.device.createCommandEncoder({ label: 'read_agent_outputs_encoder' });
    encoder.copyBufferToBuffer(this.buffers.agentOutputs, 0, this.agentOutputStagingBuffer, 0, byteSize);
    this.device.queue.submit([encoder.finish()]);

    const mapRead = globalThis.GPUMapMode?.READ || MAP_MODE.READ;
    await this.agentOutputStagingBuffer.mapAsync(mapRead, 0, byteSize);
    const mapped = new Uint32Array(this.agentOutputStagingBuffer.getMappedRange(0, byteSize));
    const floatView = new Float32Array(mapped.buffer, mapped.byteOffset, mapped.length);

    const results = [];
    for (let i = 0; i < readCount; i++) {
      const base16 = i * 16;
      const chosenAction = mapped[base16 + 0];
      const logits = floatView.slice(base16 + 4, base16 + 14);
      results.push({ chosenAction, logits });
    }
    this.agentOutputStagingBuffer.unmap();
    return results;
  }

  /**
   * Dispatch agent action execution compute shader to apply chosen actions to VRAM terrain and agent state.
   * @param {GPUCommandEncoder} encoder Active WebGPU command encoder
   * @param {number} agentCount Number of agents to evaluate
   */
  dispatchAgentAct(encoder, agentCount) {
    if (!this.isInitialized || !this.pipelines?.agent_act || !encoder) return;
    const count = Math.min(agentCount, this.maxAgents);
    if (count === 0) return;

    // Update act uniforms (24 32-bit values = 96 bytes)
    const aUniforms = new Uint32Array(24);
    const aFloatView = new Float32Array(aUniforms.buffer);

    aUniforms[0] = this.width;
    aUniforms[1] = this.height;
    aUniforms[2] = count;
    aUniforms[3] = CONFIG.COASTAL_BORDER_WIDTH || 3;
    aFloatView[4] = CONFIG.COASTAL_EXPOSURE_DRAIN || 0.35;
    aFloatView[5] = CONFIG.BASAL_METABOLIC_DRAIN || 0.20;
    aFloatView[6] = CONFIG.MOISTURE_METABOLIC_RELIEF || 0.40;
    aFloatView[7] = CONFIG.AQUATIC_SAFE_DEPTH || 0.15;
    aFloatView[8] = CONFIG.AQUATIC_EXPOSURE_DRAIN || 0.35;
    aFloatView[9] = CONFIG.STATIONARY_TRAMPLE_DEPOSIT || 0.04;
    aFloatView[10] = CONFIG.MOVE_ENERGY_BASE || 0.28;
    aFloatView[11] = CONFIG.TRAMPLE_DEPOSIT || 0.25;
    aFloatView[12] = CONFIG.GRAZE_MAX_INTAKE || 20.0;
    aFloatView[13] = CONFIG.FERTILITY_GRAZE_DEPLETION || 0.005;
    aFloatView[14] = CONFIG.TERRAFORM_ENERGY_COST || 2.5;
    aFloatView[15] = CONFIG.TERRAFORM_MAX_ELEVATION || 0.72;
    aFloatView[16] = CONFIG.ROOT_HARVEST_MAX || 4.5;
    aFloatView[17] = CONFIG.SCENT_COST || 0.08;
    aFloatView[18] = CONFIG.SCENT_DEPOSIT || 1.0;
    aFloatView[19] = CONFIG.SEED_SOW_COST || 2.5;
    aFloatView[20] = CONFIG.SEED_GERM_MIN_MOISTURE || 0.30;
    aFloatView[21] = CONFIG.SEED_GERM_MAX_TRAMPLE || 0.45;
    aFloatView[22] = CONFIG.SEED_GERM_BIOMASS || 0.04;
    aFloatView[23] = CONFIG.MAX_ENERGY || 250.0;

    this.device.queue.writeBuffer(this.buffers.actUniforms, 0, aUniforms);

    const pass = encoder.beginComputePass({ label: 'agent_act_pass' });
    pass.setPipeline(this.pipelines.agent_act);
    pass.setBindGroup(0, this.agentActBindGroup);
    const workgroups = Math.ceil(count / 64);
    pass.dispatchWorkgroups(workgroups, 1, 1);
    pass.end();
  }

  /**
   * Dispatch agent lifecycle compute shader to handle aging, mortality, reproduction, and genetics in VRAM.
   * @param {GPUCommandEncoder} encoder Active WebGPU command encoder
   * @param {number} agentCount Number of agents / slots to scan
   * @param {number} tickCount Current simulation tick
   * @param {boolean} [isRadiationMode=false] Radiation lab mode toggle
   */
  dispatchAgentLifecycle(encoder, agentCount, tickCount, isRadiationMode = false) {
    if (!this.isInitialized || !this.pipelines?.agent_lifecycle || !encoder) return;
    const count = Math.min(agentCount || this.maxAgents, this.maxAgents);
    if (count === 0) return;

    const radMult = isRadiationMode ? 4.0 : 1.0;
    const lUniforms = new Uint32Array(12);
    const lFloatView = new Float32Array(lUniforms.buffer);

    lUniforms[0] = this.width;
    lUniforms[1] = this.height;
    lUniforms[2] = count;
    lUniforms[3] = CONFIG.MAX_POPULATION || 800;
    lUniforms[4] = CONFIG.COASTAL_BORDER_WIDTH || 3;
    lUniforms[5] = CONFIG.MAX_AGE || 1800;
    lUniforms[6] = tickCount;
    lUniforms[7] = (tickCount * 1664525 + 1013904223) >>> 0;
    lFloatView[8] = CONFIG.REPRODUCTION_THRESHOLD || 115.0;
    lFloatView[9] = CONFIG.REPRODUCTION_SPLIT || 0.5;
    lFloatView[10] = (CONFIG.MUTATION_RATE_DEFAULT || 0.08) * radMult;
    lFloatView[11] = isRadiationMode ? 0.45 : 0.20;

    this.device.queue.writeBuffer(this.buffers.lifecycleUniforms, 0, lUniforms);

    const pass = encoder.beginComputePass({ label: 'agent_lifecycle_pass' });
    pass.setPipeline(this.pipelines.agent_lifecycle);
    pass.setBindGroup(0, this.agentLifecycleBindGroup);
    const workgroups = Math.ceil(count / 64);
    pass.dispatchWorkgroups(workgroups, 1, 1);
    pass.end();
  }

  /**
   * Diagnostic readback of raw agent states from VRAM.
   * @param {number} [count] Number of agents to read back
   * @returns {Promise<Array<object>>}
   */
  async readAgentStates(count = this.maxAgents) {
    if (!this.isInitialized || !this.agentStateStagingBuffer) return [];
    const readCount = Math.min(count, this.maxAgents);
    const byteSize = readCount * 64;

    const encoder = this.device.createCommandEncoder({ label: 'read_agent_states_encoder' });
    encoder.copyBufferToBuffer(this.buffers.agentState, 0, this.agentStateStagingBuffer, 0, byteSize);
    this.device.queue.submit([encoder.finish()]);

    const mapRead = globalThis.GPUMapMode?.READ || MAP_MODE.READ;
    await this.agentStateStagingBuffer.mapAsync(mapRead, 0, byteSize);
    const mapped = new ArrayBuffer(byteSize);
    new Uint8Array(mapped).set(new Uint8Array(this.agentStateStagingBuffer.getMappedRange(0, byteSize)));
    this.agentStateStagingBuffer.unmap();

    const u32 = new Uint32Array(mapped);
    const f32 = new Float32Array(mapped);
    const i32 = new Int32Array(mapped);

    const states = [];
    for (let i = 0; i < readCount; i++) {
      const b = i * 16;
      states.push({
        x: u32[b + 0],
        y: u32[b + 1],
        energy: f32[b + 2],
        age: u32[b + 3],
        generation: u32[b + 4],
        id: u32[b + 5],
        alive: u32[b + 6],
        lastAction: u32[b + 7],
        lastSuccess: f32[b + 8],
        lastMoveDir: i32[b + 9],
        fitness: f32[b + 10],
        speciesR: f32[b + 11],
        speciesG: f32[b + 12],
        speciesB: f32[b + 13],
        seedsSown: u32[b + 14],
        biomassEaten: f32[b + 15]
      });
    }
    return states;
  }

  /**
   * Release all GPU buffers, bind groups, pipelines and device.
   */
  destroy() {
    this.isInitialized = false;
    this.isFlushing = false;

    if (this.stagingBuffers) {
      for (let i = 0; i < 2; i++) {
        const b = this.stagingBuffers[i];
        try {
          if (this.stagingStates[i] === STAGING_STATE.MAPPED) {
            b.unmap();
          }
          b.destroy();
        } catch (e) {}
      }
      this.stagingBuffers = null;
      this.stagingStates = [STAGING_STATE.IDLE, STAGING_STATE.IDLE];
      this.mapPromises = [null, null];
    }

    if (this.buffers) {
      for (const key of Object.keys(this.buffers)) {
        try { this.buffers[key].destroy(); } catch (e) {}
      }
      this.buffers = null;
    }

    if (this.agentOutputStagingBuffer) {
      try { this.agentOutputStagingBuffer.destroy(); } catch (e) {}
      this.agentOutputStagingBuffer = null;
    }

    if (this.agentStateStagingBuffer) {
      try { this.agentStateStagingBuffer.destroy(); } catch (e) {}
      this.agentStateStagingBuffer = null;
    }

    if (this.statsStagingBuffer) {
      try { this.statsStagingBuffer.destroy(); } catch (e) {}
      this.statsStagingBuffer = null;
    }

    this.pipelines = null;
    this.bindGroupLayout = null;
    this.bindGroup = null;
    this.agentBrainBindGroupLayout = null;
    this.agentBrainBindGroup = null;
    this.agentSenseBindGroupLayout = null;
    this.agentSenseBindGroup = null;
    this.agentActBindGroupLayout = null;
    this.agentActBindGroup = null;
    this.agentLifecycleBindGroupLayout = null;
    this.agentLifecycleBindGroup = null;

    if (this.device) {
      try { this.device.destroy(); } catch (e) {}
      this.device = null;
    }
    this.adapter = null;
  }
}

