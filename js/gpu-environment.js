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
    this.tickCount = 0;

    this.buffers = null;
    this.pipelines = null;
    this.bindGroupLayout = null;
    this.bindGroup = null;

    // Double-buffered staging buffers for zero-stall asynchronous readback
    this.stagingBuffers = null;
    this.currentStagingIdx = 0;
    this.stagingPending = [false, false];

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
    if (typeof fetch !== 'undefined') {
      try {
        const res = await fetch(`./js/wgsl/${name}.wgsl`);
        if (res.ok) {
          return await res.text();
        }
      } catch (err) {
        // Fallback or re-throw
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
        console.warn('[GpuEnvironment] Failed to acquire WebGPU adapter.');
        return false;
      }
      console.log('[GpuEnvironment] WebGPU adapter acquired');

      this.device = await this.adapter.requestDevice();
      if (!this.device) {
        console.warn('[GpuEnvironment] Failed to create WebGPU device.');
        return false;
      }

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
        })
      };

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

      // 7. Compile all 8 compute pipelines
      this.pipelines = {};
      for (const name of SHADER_NAMES) {
        const code = await this._loadShader(name);
        const shaderModule = this.device.createShaderModule({ label: name, code });
        this.pipelines[name] = this.device.createComputePipeline({
          layout: pipelineLayout,
          compute: {
            module: shaderModule,
            entryPoint: 'main'
          }
        });
      }
      console.log('[GpuEnvironment] All 8 compute pipelines compiled');

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
   * Run one full GPU environmental tick (mirrors Environment.tick()).
   * Zero new JS object allocations per call.
   */
  tick() {
    if (!this.isInitialized) return;

    // 1. Drain previously completed staging buffer into CPU grid arrays
    const prevStagingIdx = 1 - this.currentStagingIdx;
    if (this.stagingPending[prevStagingIdx]) {
      const prevBuf = this.stagingBuffers[prevStagingIdx];
      try {
        const mapped = new Float32Array(prevBuf.getMappedRange());
        this.grid.elevation.set(mapped.subarray(0, this.size));
        this.grid.water.set(mapped.subarray(this.size, 2 * this.size));
        this.grid.moisture.set(mapped.subarray(2 * this.size, 3 * this.size));
        this.grid.biomass.set(mapped.subarray(3 * this.size, 4 * this.size));
        this.grid.trample.set(mapped.subarray(4 * this.size, 5 * this.size));
        this.grid.scent.set(mapped.subarray(5 * this.size, 6 * this.size));
        prevBuf.unmap();
        this.stagingPending[prevStagingIdx] = false;
      } catch (err) {
        // Buffer was not mapped yet; will drain on next tick
      }
    }

    // 2. Upload CPU changes made by agents since last tick
    this.device.queue.writeBuffer(this.buffers.elevation, 0, this.grid.elevation);
    this.device.queue.writeBuffer(this.buffers.biomass, 0, this.grid.biomass);
    this.device.queue.writeBuffer(this.buffers.trample, 0, this.grid.trample);
    this.device.queue.writeBuffer(this.buffers.scent, 0, this.grid.scent);

    // 3. Compute stochastic rain parameters for this tick
    this.tickCount++;
    this.uniformU32[23] = this.tickCount;

    if (Math.random() < CONFIG.RAIN_PROBABILITY) {
      this.uniformF32[4] = 1.0; // rainActive
      this.uniformF32[6] = Math.floor(Math.random() * this.width); // rainCenterX
      this.uniformF32[7] = Math.floor(Math.random() * this.height); // rainCenterY
      this.uniformF32[8] = 6 + Math.floor(Math.random() * 8); // rainRadius
      this.uniformF32[5] = CONFIG.RAIN_INTENSITY * (0.5 + Math.random() * 0.5); // rainIntensity
    } else {
      this.uniformF32[4] = 0.0;
    }
    this.device.queue.writeBuffer(this.buffers.uniforms, 0, this.uniformArrayBuffer);

    // 4. Encode all 8 compute passes
    const byteSize = this.size * 4;
    const dispatchX = Math.ceil(this.width / 8);
    const dispatchY = Math.ceil(this.height / 8);

    const encoder = this.device.createCommandEncoder();

    // Pass 1: Water sources (replenishes low elevation groundwater in-place)
    {
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.pipelines.water_sources);
      pass.setBindGroup(0, this.bindGroup);
      pass.dispatchWorkgroups(dispatchX, dispatchY);
      pass.end();
    }

    // Pass 2: Rain & Evaporation (in-place on water)
    {
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.pipelines.rain_evaporation);
      pass.setBindGroup(0, this.bindGroup);
      pass.dispatchWorkgroups(dispatchX, dispatchY);
      pass.end();
    }

    // Pass 3: Hydrology (writes to tmp_a, then copy tmp_a -> water)
    {
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.pipelines.hydrology);
      pass.setBindGroup(0, this.bindGroup);
      pass.dispatchWorkgroups(dispatchX, dispatchY);
      pass.end();
      encoder.copyBufferToBuffer(this.buffers.tmp_a, 0, this.buffers.water, 0, byteSize);
    }

    // Pass 4: Geological Erosion (writes to tmp_a, then copy tmp_a -> elevation)
    {
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.pipelines.erosion);
      pass.setBindGroup(0, this.bindGroup);
      pass.dispatchWorkgroups(dispatchX, dispatchY);
      pass.end();
      encoder.copyBufferToBuffer(this.buffers.tmp_a, 0, this.buffers.elevation, 0, byteSize);
    }

    // Pass 5: Soil Moisture (writes to tmp_a, then copy tmp_a -> moisture)
    {
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.pipelines.moisture);
      pass.setBindGroup(0, this.bindGroup);
      pass.dispatchWorkgroups(dispatchX, dispatchY);
      pass.end();
      encoder.copyBufferToBuffer(this.buffers.tmp_a, 0, this.buffers.moisture, 0, byteSize);
    }

    // Pass 6: Logistic Vegetation (writes to tmp_a, then copy tmp_a -> biomass)
    {
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.pipelines.vegetation);
      pass.setBindGroup(0, this.bindGroup);
      pass.dispatchWorkgroups(dispatchX, dispatchY);
      pass.end();
      encoder.copyBufferToBuffer(this.buffers.tmp_a, 0, this.buffers.biomass, 0, byteSize);
    }

    // Pass 7: Trail Decay (in-place on trample)
    {
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.pipelines.trail_decay);
      pass.setBindGroup(0, this.bindGroup);
      pass.dispatchWorkgroups(dispatchX, dispatchY);
      pass.end();
    }

    // Pass 8: Pheromone Scent Diffusion (writes to tmp_a, then copy tmp_a -> scent)
    {
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.pipelines.pheromone);
      pass.setBindGroup(0, this.bindGroup);
      pass.dispatchWorkgroups(dispatchX, dispatchY);
      pass.end();
      encoder.copyBufferToBuffer(this.buffers.tmp_a, 0, this.buffers.scent, 0, byteSize);
    }

    // 5. Copy modified layers to staging buffer for readback
    const curBuf = this.stagingBuffers[this.currentStagingIdx];
    // If the staging buffer is still mapped or pending from an earlier cycle, unmap it before copying
    if (this.stagingPending[this.currentStagingIdx]) {
      try { curBuf.unmap(); } catch (e) {}
      this.stagingPending[this.currentStagingIdx] = false;
    }

    encoder.copyBufferToBuffer(this.buffers.elevation, 0, curBuf, 0 * byteSize, byteSize);
    encoder.copyBufferToBuffer(this.buffers.water, 0, curBuf, 1 * byteSize, byteSize);
    encoder.copyBufferToBuffer(this.buffers.moisture, 0, curBuf, 2 * byteSize, byteSize);
    encoder.copyBufferToBuffer(this.buffers.biomass, 0, curBuf, 3 * byteSize, byteSize);
    encoder.copyBufferToBuffer(this.buffers.trample, 0, curBuf, 4 * byteSize, byteSize);
    encoder.copyBufferToBuffer(this.buffers.scent, 0, curBuf, 5 * byteSize, byteSize);

    // 6. Submit commands to GPU queue
    this.device.queue.submit([encoder.finish()]);

    // 7. Initiate asynchronous readback mapping on the staging buffer
    const stageIdx = this.currentStagingIdx;
    this.stagingPending[stageIdx] = true;
    const mapRead = globalThis.GPUMapMode?.READ || MAP_MODE.READ;
    curBuf.mapAsync(mapRead).catch(() => {
      this.stagingPending[stageIdx] = false;
    });

    // Advance staging index
    this.currentStagingIdx = 1 - this.currentStagingIdx;
  }

  /**
   * Synchronously flush and await completion of GPU work and drain staging buffer into grid.
   * Useful for testing, single-step diagnostics, or clean shutdown.
   */
  async syncReadback() {
    if (!this.isInitialized) return;
    await this.device.queue.onSubmittedWorkDone();

    for (let i = 0; i < 2; i++) {
      if (this.stagingPending[i]) {
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
          this.stagingPending[i] = false;
        } catch (e) {}
      }
    }
  }

  /**
   * Release all GPU buffers, bind groups, pipelines and device.
   */
  destroy() {
    this.isInitialized = false;

    if (this.stagingBuffers) {
      for (const b of this.stagingBuffers) {
        try { b.destroy(); } catch (e) {}
      }
      this.stagingBuffers = null;
    }

    if (this.buffers) {
      for (const key of Object.keys(this.buffers)) {
        try { this.buffers[key].destroy(); } catch (e) {}
      }
      this.buffers = null;
    }

    this.pipelines = null;
    this.bindGroupLayout = null;
    this.bindGroup = null;

    if (this.device) {
      try { this.device.destroy(); } catch (e) {}
      this.device = null;
    }
    this.adapter = null;
  }
}

