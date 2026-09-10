# Biome Shifters — Task Roadmap & Dependency Chain

This document defines the sequential implementation plan for **Biome Shifters**.
Each task is designed to be **self-contained and functionally complete on its own**, producing testable code that can be verified before moving to the next task.

---

## 🗺️ Master Dependency Chain

```
Phase 1: Foundations & Grid CA
TASK_01 (UI Scaffolding)
   ↓
TASK_02 (Flat TypedArray Grid World)
   ↓
TASK_03 (Recurrent Neural Network with Hidden Carry)
   ↓
TASK_04 (Hydrology & Flora Cellular Automata)

Phase 2: Agent Mechanics & Simulation Core
TASK_05 (Neural Agent Perception & Actions)
   ↓
TASK_06 (Simulation Coordinator & Lifecycle)

Phase 3: Visuals, Controls & Inspector
TASK_07 (Multi-Layer Canvas Renderer & Biome Palette)
   ↓
TASK_08 (Main Loop, Turbo Execution & UI Inspector)
   ↓
TASK_09 (UI & CSS Fixes: HUD Overflow, Inspector Unhide & Neural Net Cropping)
   ↓
TASK_10 (Population Scaling, Higher Capacity & Interactive Controls)
   ↓
TASK_11 (Inspector Vertical Cropping & Flex Shrink Layout Fix)
   ↓
TASK_12 (Inspector World Telemetry & Generation Statistics Graphs)
   ↓
TASK_13 (Save/Load System & REST Integration)

Phase 4: Advanced Emergence & Terraforming
TASK_14 (Erosion, Trampled Trails & Highway Formation)
   ↓
TASK_15 (Terraforming Actions: Canals, Dams & Irrigation)
   ↓
TASK_16 (Pheromone Scent Gradients & Stigmergic Trails)

Phase 5: Evolutionary Genetics & Speciation
TASK_17 (Sexual Crossover & Evolvable Mutation Rates)
   ↓
TASK_18 (Elite Reseeding & Extinction Safety Floor)
   ↓
TASK_19 (Real-Time Population & Eco-System Telemetry Graphs)

Phase 6: Multi-Core Scale & Island Evolution
TASK_18 (Headless Island Web Worker Core & Elite Export/Import)
   ↓
TASK_19 (Multi-Island Manager & Cross-Island Elite Migration)
   ↓
TASK_20 (8-Island UI Switcher, Multi-Core Dashboard & HUD Controls)
   ↓
TASK_21 (Turbo Mode Canvas & UI Throttling to 4 FPS)
   ↓
TASK_22 (Auto-Save Timer Pause Synchronization)
   ↓
TASK_23 (Save Telemetry Extractor Script)
   ↓
TASK_24 (Ecological Stepping Stones for Irrigation)
   ↓
TASK_25 (Save Metadata Indexing System & Performance Optimization)
   ↓
TASK_26 (Save Menu Layout Widening & Loading Spinner Overlay)
   ↓
TASK_27 (Fix serializeAll islandStates Reference Error)

Phase 7: Distributed LAN Multi-Island Cluster
TASK_28 (Cluster Backend Coordinator & LAN REST Endpoints)
   ↓
TASK_29 (Dynamic IslandManager & Contributor Worker Pool)
   ↓
TASK_30 (Client Join Dialog, Host Detection & Feature Gating)
   ↓
TASK_31 (Cluster-Wide Genetic Migration & Cross-Breeding Protocol)
   ↓
TASK_32 (Host Cluster Nodes Dashboard & LAN Sharing UI)
   ↓
TASK_33 (Cluster Heartbeat Persistence & Migration Synchronization Fix)
   ↓
TASK_34 (Suppress Heartbeat Terminal Logging)
   ↓
Phase 8: Advanced Host Cluster Governance & Zero-Render Worker Mode
TASK_35 (Cluster Node Control Backend Endpoints & Persistent IP:Name Store)
   ↓
TASK_36 (Contributor Kick Handling & Join Screen Reset)
   ↓
TASK_37 (Zero-Render Contributor Screen Saver Mode)
   ↓
TASK_38 (Host LAN Dashboard Controls UI)

Phase 9: Distributed Ecosystem Orchestration & Telemetry (Future Improvements)
TASK_39 (Per-Node Performance Limiter: Eco, Standard, Turbo)
   ↓
TASK_40 (Radiation & Extreme Mutation Laboratory Mode)
   ↓
TASK_41 (Remote Miniature Island Cam & Viewport Snooper)
   ↓
TASK_42 (Fix Cluster Modal DOM Hierarchy & HUD Binding)

Phase 10: Agricultural Emergence & Coastal Ecology
TASK_43 (Harsh Coastal Perimeter & Anti-Corner Eviction)
   ↓
TASK_44 (Subterranean Root Foraging & Profitable Irrigation)
   ↓
TASK_45 (Caloric Seed Sowing & Agricultural Feedback Loop)
   ↓
TASK_46 (Distributed LAN Cluster Dashboard Wide Layout & Seamless Scrolling)
   ↓
TASK_47 (LAN Cluster Dashboard Horizontal Island Cameras Sub-Row)
   ↓
TASK_48 (Native Grid Camera Preview Resolution & Fixed Quality)
   ↓
TASK_49 (Lossless PNG Camera Preview)
   ↓
TASK_50 (Fix Radiation Toggle Worker Map Lookup)
   ↓
TASK_51 (Performance Limiter Decoupling & Host Uncapped Execution)
   ↓
TASK_52 (Island Worker MessageChannel Turbo Pump for Maximum CPU Saturation)

Phase 11: Cluster Resilience, Auto-Recovery & Zero-Friction Version Synchronization
TASK_53 (Build Version Generator, Cache-Busting Headers & Version Endpoints)
   ↓
TASK_54 (Client Auto-Disconnect, Auto-Reconnect & Version Mismatch Synchronization)

Phase 12: Ecological Dispersal & Local Optimum Countermeasures
TASK_55 (Break Lake Camping Local Optimum & Restore Nomadic Dispersal)

Phase 13: WebGPU Accelerated Environment Engine
TASK_56 (WebGPU Environment Engine — 8 Compute Shader CA Passes)
   ↓
TASK_57 (GPU/CPU Toggle in Simulation.tick() & Island Worker)
   ↓
TASK_58 (IslandManager GPU API & Host HUD Toggle Button)
   ↓
TASK_59 (GPU Cluster Propagation & Admin Control for Contributor Nodes)
   ↓
TASK_60 (Fix GPU Toggle Oscillation & Worker Shader Path Resolution)
   ↓
TASK_61 (Flight Recorder Diagnostics System & Trace Analyzer)
   ↓
TASK_62 (Fix GPU Toggle Async Race Condition & WebGPU Capability Detection)
   ↓
TASK_63 (Fix WebGPU Shader NaN Propagation, Readback Queue Saturation, and Terrain State Handover)
   ↓
TASK_64 (Fix Heartbeat PerfMode Reconciliation and Turbo Mode Loop Persistence)
   ↓
TASK_65 (Fix WebGPU Storage Buffer Limit Request in Device Acquisition)
   ↓
Phase 14: Pure WebGPU Simulation Engine
TASK_66 (WebGPU Agent Buffer Allocation & RNN Brain Inference Compute Pipeline)
   ↓
TASK_67 (WebGPU Agent Perception & Sensory Raycasting Compute Pipeline)
   ↓
TASK_68 (WebGPU Agent Action Execution & Spatial Collisions Compute Pipeline)
   ↓
TASK_69 (WebGPU Agent Lifecycle, Energy Economics & Genetic Pipeline)
   ↓
TASK_70 (Closed-Loop VRAM Simulation Engine & Decoupled Pacing)
   ↓
Phase 15: Simulation Dynamics & Parity Alignment Loop
TASK_71 (Simulation Dynamics Parity Tracer & Differential Analyzer)
   ↓
TASK_72 (Headless Parity Benchmark & Recursive Alignment Harness)
   ↓
TASK_73 (WebGPU Simulation Dynamics Parity Alignment)
```

---

## 📋 Task Catalog & Status

| Task | Title | Target Files | Status | Description |
| :--- | :--- | :--- | :--- | :--- |
| **01** | `TASK_01_project_scaffolding.md` | `index.html`, `style.css` | `DONE` | Dark-mode HUD layout, canvas container, sidebar controls, and inspector panel. |
| **02** | `TASK_02_grid_world_layers.md` | `js/grid.js` | `DONE` | Multi-layered 1D TypedArray grid (Elevation, Moisture, Biomass, Scent, Trample). |
| **03** | `TASK_03_recurrent_neural_network.md` | `js/nn.js` | `DONE` | Recurrent Neural Network brain with Float32Array weights, persistent carry state, and mutation. |
| **04** | `TASK_04_environmental_ca.md` | `js/environment.js` | `DONE` | Cellular Automata engine for water flow, moisture infiltration, and logistic plant growth. |
| **05** | `TASK_05_agent_entity.md` | `js/agent.js` | `DONE` | Agent entity with egocentric sensory perception, decision decoding, and metabolic drain. |
| **06** | `TASK_06_simulation_core.md` | `js/simulation.js` | `DONE` | Master world coordinator, step loop, agent reproduction, deaths, and serialization. |
| **07** | `TASK_07_canvas_renderer.md` | `js/renderer.js` | `DONE` | Canvas renderer with multi-layer visualization (Biomes, Elevation, Water, Biomass, Trails). |
| **08** | `TASK_08_main_loop_and_ui.md` | `js/main.js` | `DONE` | Game loop, turbo pump, speed controls, camera pan/zoom, and live agent inspector. |
| **09** | `TASK_09_ui_css_fixes.md` | `style.css`, `index.html`, `js/main.js` | `DONE` | HUD overflow prevention, inspector unhide toggle button, neural net graph fixes. |
| **10** | `TASK_10_population_scaling_and_capacity.md` | `js/config.js`, `js/simulation.js`, `index.html`, `style.css`, `js/main.js` | `DONE` | Scaled population capacity (800+), elevated floor (100), and HUD controls for parallel exploration. |
| **11** | `TASK_11_inspector_vertical_cropping_fix.md` | `style.css`, `index.html`, `js/main.js` | `DONE` | Prevent flex compression on inspector cards, fix range slider clipping, and ensure full uncropped scrolling. |
| **12** | `TASK_12_inspector_telemetry_and_generation_graphs.md` | `js/simulation.js`, `index.html`, `style.css`, `js/renderer.js`, `js/main.js` | `DONE` | Relocate HUD stats into inspector with live Population/Biomass and Generation distribution graphs. |
| **13** | `TASK_13_ecosystem_balance_and_generation_progression.md` | `js/config.js`, `js/environment.js`, `js/simulation.js`, `js/main.js` | `DONE` | Ecological balance (hydrology, flora dormancy), reproduction rebalance, and elite lineage preservation. |
| **14** | `TASK_14_elevation_runaway_and_extinction_recovery_fix.md` | `js/config.js`, `js/grid.js`, `js/agent.js`, `js/environment.js`, `js/simulation.js` | `DONE` | Eliminate elevation runaway, add geological erosion CA, enforce mounding ceiling, and ensure robust spawn fallback. |
| **15** | `TASK_15_boundary_sensing_and_wall_awareness.md` | `js/agent.js` | `DONE` | Boundary wall physical sensing, obstacle awareness, and prevention of corner starvation traps. |
| **16** | `TASK_16_neural_network_enhancement_and_intelligent_foraging.md` | `js/config.js`, `js/nn.js`, `js/agent.js`, `js/simulation.js` | `DONE` | 37-input vision & momentum, 24-neuron RNN, sexual crossover, anti-saturation, and biological fitness. |
| **17** | `TASK_17_autosave_system_and_categorized_save_tabs.md` | `server.py`, `js/storage.js`, `index.html`, `style.css`, `js/main.js` | `DONE` | Configurable periodic auto-save to disk, and multi-tab Save/Load modal (Manual vs Auto-Saves). |
| **18** | `TASK_18_island_web_worker_core.md` | `js/simulation.js`, `js/workers/island.worker.js` | `DONE` | Headless Web Worker island thread, elite genome export/import, and immigrant spawning. |
| **19** | `TASK_19_multi_island_manager_and_migration.md` | `js/island-manager.js`, `js/storage.js` | `DONE` | 8-island worker coordinator, pull-based frame streaming, and cross-island elite migration protocol. |
| **20** | `TASK_20_multi_island_ui_and_controls.md` | `index.html`, `style.css`, `js/main.js`, `js/renderer.js` | `DONE` | 8-island switcher bar, live status badges, keyboard navigation (1-8), and multi-core dashboard. |
| **21** | `TASK_21_turbo_mode_canvas_ui_throttling.md` | `js/config.js`, `js/main.js`, `index.html` | `DONE` | Throttle canvas rendering, UI DOM updates, and worker frame polling to ~4 FPS in Turbo mode. |
| **22** | `TASK_22_autosave_pause_synchronization.md` | `js/main.js` | `DONE` | Synchronize auto-save timer countdown and accumulation with simulation pause/resume. |
| **23** | `TASK_23_save_telemetry_extractor_script.md` | `scripts/extract_save_stats.py` | `DONE` | Standalone CLI script for fast, token-efficient extraction of multi-island and single-sim telemetry. |
| **24** | `TASK_24_ecological_stepping_stones_for_irrigation.md` | `js/config.js`, `js/agent.js` | `DONE` | Ecological stepping stones: microclimate thermal relief, root excavation rebate, and scent momentum. |
| **25** | `TASK_25_save_metadata_indexing_system.md` | `server.py`, `js/island-manager.js`, `js/main.js` | `DONE` | Save metadata index in `saves/metadata.json`, incremental change detection, sub-5ms save menu loads. |
| **26** | `TASK_26_save_menu_layout_and_loading_spinner_overlay.md` | `style.css`, `index.html`, `js/main.js` | `DONE` | 660px save modal width, non-wrapping button layout, full-screen spinny wheel overlay and sim pause. |
| **27** | `TASK_27_fix_serializeall_islandstates_reference.md` | `js/island-manager.js` | `DONE` | Restore missing await Promise.all(serializePromises) in IslandManager.serializeAll(). |
| **28** | `TASK_28_cluster_backend_coordinator_and_lan_endpoints.md` | `server.py` | `DONE` | In-memory cluster manager, dynamic island ID allocation, heartbeat tracking, and LAN IP detection banner. |
| **29** | `TASK_29_dynamic_island_manager_and_contributor_pool.md` | `js/island-manager.js`, `js/cluster-client.js` | `DONE` | Support dynamic island ID offsets, arbitrary core counts (1–8), and remote heartbeat client sync. |
| **30** | `TASK_30_client_join_dialog_and_feature_gating.md` | `index.html`, `style.css`, `js/main.js` | `DONE` | Localhost vs LAN role detection, join modal (name + core picker), feature gating, and dynamic island bar. |
| **31** | `TASK_31_cluster_wide_genetic_migration_protocol.md` | `server.py`, `js/island-manager.js`, `js/cluster-client.js` | `DONE` | Distributed Darwinian elite genome exchange across host and clients via server genome pool. |
| **32** | `TASK_32_host_cluster_nodes_dashboard_and_lan_sharing.md` | `index.html`, `style.css`, `js/main.js` | `DONE` | Host Cluster Nodes modal displaying connected clients, core breakdown, live TPS, and 1-click LAN invite copy. |
| **33** | `TASK_33_cluster_heartbeat_persistence_and_migration_sync_fix.md` | `server.py`, `js/cluster-client.js`, `js/island-manager.js`, `js/main.js` | `DONE` | Fix disappearing LAN clients via heartbeat auto-healing, tolerant timeouts, and multi-machine migration sync. |
| **34** | `TASK_34_suppress_heartbeat_terminal_logging.md` | `server.py` | `DONE` | Silence repetitive heartbeat telemetry requests in terminal while retaining other HTTP logs. |
| **35** | `TASK_35_cluster_node_control_backend_and_name_store.md` | `server.py` | `DONE` | REST endpoints for kick, rename, visibility, and persistent IP:name registry. |
| **36** | `TASK_36_contributor_kick_handling_and_join_screen_reset.md` | `js/cluster-client.js`, `js/main.js` | `DONE` | Contributor detection of kick signal, worker termination, and clean return to join dialog. |
| **37** | `TASK_37_zero_render_screensaver_mode.md` | `index.html`, `style.css`, `js/cluster-client.js`, `js/main.js` | `DONE` | Zero-render power-saving mode, cybernetic animated telemetry screen saver, and control locking. |
| **38** | `TASK_38_host_lan_dashboard_controls_ui.md` | `index.html`, `style.css`, `js/main.js` | `DONE` | Actions column in Host dashboard with Rename, Hide/Unhide, and Remove buttons. |
| **39** | `TASK_39_per_node_performance_limiter.md` | `server.py`, `js/cluster-client.js`, `js/island-manager.js`, `js/workers/island.worker.js`, `index.html`, `style.css`, `js/main.js` | `DONE` | Performance mode limiter (Eco, Standard, Turbo) per contributor node. |
| **40** | `TASK_40_radiation_extreme_mutation_lab_mode.md` | `server.py`, `js/simulation.js`, `js/agent.js`, `js/island-manager.js`, `js/cluster-client.js`, `js/workers/island.worker.js`, `index.html`, `style.css`, `js/main.js` | `DONE` | Undoable per-island Radiation & Extreme Mutation Lab Mode for Host and Contributor islands. |
| **41** | `TASK_41_remote_miniature_island_cam.md` | `server.py`, `js/workers/island.worker.js`, `js/island-manager.js`, `js/cluster-client.js`, `index.html`, `style.css`, `js/main.js` | `DONE` | Demand-driven satellite viewport snooper (64x64) with zero idle network overhead. |
| **42** | `TASK_42_fix_cluster_modal_dom_hierarchy_and_hud_binding.md` | `index.html`, `js/main.js` | `DONE` | Fix unclosed join modal div hierarchy and ensure cluster modal HUD button binds reliably. |
| **43** | `TASK_43_harsh_coastal_perimeter_and_corner_eviction.md` | `js/config.js`, `js/grid.js`, `js/environment.js`, `js/agent.js`, `js/simulation.js`, `js/workers/island.worker.js`, `js/renderer.js` | `DONE` | Inhospitable coastal perimeter (zero flora, exposure drain) eliminating corner-camping traps. |
| **44** | `TASK_44_subterranean_root_foraging_and_profitable_irrigation.md` | `js/config.js`, `js/agent.js`, `js/simulation.js`, `js/workers/island.worker.js` | `DONE` | Profitable trench digging for tubers (+1.3 to +2.0 net ROI) and microclimate cooling. |
| **45** | `TASK_45_caloric_seed_sowing_and_agricultural_action.md` | `js/config.js`, `js/nn.js`, `js/agent.js`, `js/simulation.js`, `js/renderer.js` | `DONE` | Active seed sowing action (10-output RNN) requiring calories and moist uncompacted soil. |
| **46** | `TASK_46_cluster_dashboard_wide_layout_and_seamless_scrolling.md` | `style.css`, `index.html`, `js/main.js` | `DONE` | Widescreen command-center layout (1360px), column alignments, non-wrapping actions, and smooth scrolling. |
| **47** | `TASK_47_lan_dashboard_horizontal_island_cameras_subrow.md` | `style.css`, `index.html`, `js/main.js` | `DONE` | Dedicated horizontal cameras sub-row per node record, eliminating vertical bloating. |
| **48** | `TASK_48_native_grid_camera_preview_resolution.md` | `js/config.js`, `js/workers/island.worker.js`, `js/island-manager.js`, `js/cluster-client.js`, `js/main.js` | `DONE` | Native 128×128 grid camera preview with fixed 0.75 JPEG quality, preserving 1.5s framerate. |
| **49** | `TASK_49_lossless_png_camera_preview.md` | `js/config.js`, `js/island-manager.js` | `DONE` | Lossless PNG camera preview encoding for razor-sharp pixel-perfect grid viewing. |
| **50** | `TASK_50_fix_radiation_toggle_worker_map_lookup.md` | `js/cluster-client.js`, `js/island-manager.js` | `DONE` | Fix TypeError: this.islandManager.workers.has is not a function when toggling island radiation mode. |
| **51** | `TASK_51_perf_limiter_decoupling_and_host_turbo_default.md` | `js/workers/island.worker.js`, `server.py`, `js/cluster-client.js`, `js/island-manager.js`, `js/main.js` | `DONE` | Decouple simulation speed / Turbo from perf limiter, and set Host default to uncapped Turbo. |
| **52** | `TASK_52_island_worker_messagechannel_turbo_pump.md` | `js/workers/island.worker.js`, `js/config.js` | `DONE` | Replace 4ms-clamped setTimeout in island worker with MessageChannel pump for 100% CPU saturation. |
| **53** | `TASK_53_build_version_generator_and_cache_headers.md` | `scripts/commit_task.sh`, `version.json`, `server.py` | `DONE` | Build version generation on commit (SemVer 1.1.1 format), /api/version endpoints, and static Cache-Control headers. |
| **54** | `TASK_54_auto_disconnect_reconnect_and_version_sync.md` | `js/cluster-client.js`, `js/main.js`, `style.css`, `index.html`, `server.py` | `DONE` | Auto-disconnect 3m pause, 3s auto-reconnect, Host persistent version banner, and Contributor dramatic countdown reload. |
| **55** | `TASK_55_break_lake_camping_local_optimum.md` | `js/config.js`, `js/agent.js`, `js/simulation.js` | `DONE` | Seed maturation delay, aquatic submersion fatigue, stationary soil compaction, and fallow grazing cycles. |
| **56** | `TASK_56_webgpu_environment_engine.md` | `js/gpu-environment.js` [NEW], `js/wgsl/*.wgsl` [NEW] | `DONE` | WebGPU compute shader engine replicating all 8 CA passes from `environment.js`. GPU-only module, no UI wiring yet. |
| **57** | `TASK_57_gpu_toggle_simulation_and_worker.md` | `js/simulation.js`, `js/workers/island.worker.js` | `DONE` | Wire `GpuEnvironment` into `Simulation.tick()` with runtime GPU/CPU toggle via `enableGpu()` / `disableGpu()`. Worker handles `SET_GPU_MODE` message. |
| **58** | `TASK_58_gpu_toggle_island_manager_and_host_ui.md` | `js/island-manager.js`, `js/main.js`, `index.html`, `style.css` | `DONE` | `IslandManager.setAllIslandsGpu()` and a ⚡ GPU toggle button in the Host HUD (hidden from contributors). |
| **59** | `TASK_59_gpu_cluster_propagation_and_admin_control.md` | `server.py`, `js/cluster-client.js`, `js/main.js`, `index.html`, `style.css` | `DONE` | Server `gpuEnabled` global state flag, `POST /api/cluster/gpu` endpoint, cluster heartbeat sync, and per-node GPU button in Cluster Nodes dashboard. |
| **60** | `TASK_60_fix_gpu_toggle_oscillation_and_worker_path.md` | `js/gpu-environment.js`, `js/island-manager.js`, `js/cluster-client.js`, `js/main.js`, `server.py` | `DONE` | Fix GPU toggle oscillation bug, worker shader 404 path resolution, and heartbeat state re-triggering. |
| **61** | `TASK_61_flight_recorder_diagnostics_and_analyzer.md` | `js/flight-recorder.js`, `server.py`, `index.html`, `style.css`, `js/main.js`, `scripts/analyze_trace.py` | `DONE` | Build in-app flight recorder, recording popup modal, server trace store, and timeline CLI analyzer. |
| **62** | `TASK_62_fix_gpu_toggle_race_condition_and_unsupported_state.md` | `js/gpu-environment.js`, `js/main.js`, `js/cluster-client.js`, `js/island-manager.js` | `DONE` | Fix GPU toggle async race condition identified in flight recorder, add in-flight locking, and detect WebGPU capability. |
| **63** | `TASK_63_fix_webgpu_shader_nan_and_readback_saturation.md` | `js/wgsl/*.wgsl`, `js/gpu-environment.js`, `js/simulation.js`, `js/workers/island.worker.js`, `js/main.js` | `DONE` | Fix WebGPU shader NaN propagation, decouple GPU dispatch/readback cadence, and ensure clean terrain state handover. |
| **64** | `TASK_64_fix_heartbeat_perfmode_and_turbo_persistence.md` | `server.py`, `js/cluster-client.js`, `js/main.js` | `DONE` | Prevent heartbeat from killing Turbo mode after 2s; sync node perfMode and speed buttons. |
| **65** | `TASK_65_fix_webgpu_storage_buffer_limit_request.md` | `js/gpu-environment.js` | `DONE` | Request adequate maxStorageBuffersPerShaderStage in requestDevice() to support 10 storage buffers. |
| **66** | `TASK_66_webgpu_agent_brain_inference.md` | `js/wgsl/agent_brain.wgsl` [NEW], `js/gpu-environment.js` | `DONE` | WebGPU agent buffer allocation & RNN brain inference compute pipeline. |
| **67** | `TASK_67_webgpu_agent_perception_and_raycasting.md` | `js/wgsl/agent_sense.wgsl` [NEW], `js/gpu-environment.js` | `DONE` | WebGPU agent perception & sensory raycasting compute pipeline. |
| **68** | `TASK_68_webgpu_agent_action_execution.md` | `js/wgsl/agent_act.wgsl` [NEW], `js/gpu-environment.js` | `DONE` | WebGPU agent action execution & spatial atomic collisions compute pipeline. |
| **69** | `TASK_69_webgpu_agent_lifecycle_and_genetics.md` | `js/wgsl/agent_lifecycle.wgsl` [NEW], `js/gpu-environment.js` | `DONE` | WebGPU agent lifecycle, energy economics & genetic mutation/crossover pipeline. |
| **70** | `TASK_70_closed_loop_vram_simulation_and_pacing.md` | `js/gpu-environment.js`, `js/simulation.js`, `js/workers/island.worker.js` | `DONE` | Closed-loop VRAM simulation engine & decoupled Turbo microtask pacing. |
| **71** | `TASK_71_simulation_dynamics_parity_tracer_and_analyzer.md` | `js/flight-recorder.js`, `js/simulation.js`, `scripts/compare_cpu_gpu.py` [NEW] | `DONE` | Simulation dynamics parity trace category & differential CLI analyzer. |
| **72** | `TASK_72_headless_parity_benchmark_and_recursive_alignment.md` | `test_parity.html` [NEW], `scripts/run_parity_benchmark.sh` [NEW] | `DONE` | Headless max-speed CPU vs. GPU parity benchmark & recursive alignment harness. |
| **73** | `TASK_73_webgpu_simulation_dynamics_parity_alignment.md` | `js/wgsl/*.wgsl`, `js/gpu-environment.js`, `test_parity.html` | `DONE` | WebGPU simulation dynamics parity alignment: occupancy indexing, per-tick PRNG advancement, and synchronized snapshot cadence. |











