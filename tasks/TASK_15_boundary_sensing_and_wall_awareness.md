# Task 15: Boundary Sensing & Wall Obstacle Awareness

## Status
`DONE`

---

## Goal
Equip agents with realistic physical sensory perception at the world boundaries so out-of-bounds walls are registered as steep impassable obstacles with zero food, preventing corner starvation traps and enabling natural boundary steering.

---

## Context
Long-running simulation runs revealed that agents frequently herd into corners and wall boundaries, cluster there, and starve.
Analysis showed:
1. When agents query neighbor tiles across world boundaries, `grid.clampX` and `grid.clampY` clamped out-of-bounds coordinates to the boundary tile itself.
2. An agent standing on lush grass at the map edge perceived that the wall also had food (`biomass > 0`), was flat (`slope = 0`), and was empty (`occupancy = -1` -> `0.0`).
3. The neural network had no sensory perception that a wall existed, interpreting the border as open terrain.
4. When herds hit the corner, they repeatedly pushed against the boundary, overgrazed the corner to zero biomass, heavily trampled the ground, paid wall collision penalties, and starved.

---

## Files to Create / Modify
- `[NEW]` `tasks/TASK_15_boundary_sensing_and_wall_awareness.md` — Task specification document.
- `[MODIFY]` `tasks/README.md` — Update task registry and dependency graph.
- `[MODIFY]` `js/agent.js` — Update `Agent.sense()` to provide accurate physical barrier signals for out-of-bounds neighbors.

---

## Detailed Specification

### `js/agent.js`
In `Agent.sense(grid)`:
```javascript
    // Coordinate offsets for N, S, E, W
    const nx = [x, x, x + 1, x - 1];
    const ny = [y - 1, y + 1, y, y];

    // [0..3]: Local Slope (Elevation differences: neighbor - current)
    // Out-of-bounds neighbors register as an impassable sheer cliff barrier (+1.0)
    for (let d = 0; d < 4; d++) {
      if (!grid.inBounds(nx[d], ny[d])) {
        s[d] = 1.0;
      } else {
        s[d] = (grid.getElevation(nx[d], ny[d]) - curElev) * 2.0; // Scaled to [-1, 1]
      }
    }

    // [4..7]: Local Moisture (Out-of-bounds has 0.0 moisture)
    for (let d = 0; d < 4; d++) {
      s[4 + d] = grid.inBounds(nx[d], ny[d]) ? grid.getMoisture(nx[d], ny[d]) : 0.0;
    }

    // [8..11]: Local Biomass (Out-of-bounds void has 0.0 food)
    for (let d = 0; d < 4; d++) {
      s[8 + d] = grid.inBounds(nx[d], ny[d]) ? grid.getBiomass(nx[d], ny[d]) : 0.0;
    }

    // [12..15]: Local Trample Compaction (Out-of-bounds is impassable, 1.0)
    for (let d = 0; d < 4; d++) {
      s[12 + d] = grid.inBounds(nx[d], ny[d]) ? grid.getTrample(nx[d], ny[d]) : 1.0;
    }

    // [16..19]: Local Scent
    for (let d = 0; d < 4; d++) {
      s[16 + d] = grid.inBounds(nx[d], ny[d]) ? grid.getScent(nx[d], ny[d]) : 0.0;
    }

    // [20..23]: Neighbor Occupancy & Obstacles (1.0 if occupied OR boundary wall, 0.0 if free)
    for (let d = 0; d < 4; d++) {
      if (!grid.inBounds(nx[d], ny[d])) {
        s[20 + d] = 1.0; // Wall is an impassable physical obstacle
      } else {
        const occ = grid.getOccupant(nx[d], ny[d]);
        s[20 + d] = (occ >= 0 && occ !== this.id) ? 1.0 : 0.0;
      }
    }
```

---

## Test Plan
1. **Corner Sensory Unit Test**:
   - Place an agent at $(0, 0)$ on a grid.
   - Call `agent.sense(grid)`.
   - Assert:
     - `s[0]` (North slope) === `1.0` and `s[3]` (West slope) === `1.0`.
     - `s[8]` (North biomass) === `0.0` and `s[11]` (West biomass) === `0.0`.
     - `s[20]` (North obstacle) === `1.0` and `s[23]` (West obstacle) === `1.0`.
     - In-bounds directions (South $d=1$ and East $d=2$) accurately reflect grid properties.
2. **Simulation Longevity & Multi-Directional Drift Test**:
   - Run 3,000 ticks in Node.js.
   - Verify that agents encountering boundaries turn or graze rather than permanently deadlocking in corner starvation clusters.

---

## Acceptance Criteria
- [x] Out-of-bounds tiles no longer mirror boundary cell biomass or slope.
- [x] Agents perceive walls as occupied/blocked obstacles (`1.0`), steep barriers (`1.0`), and devoid of food (`0.0`).
- [x] Tensor input dimension remains exactly 29, preserving full backward compatibility.
- [x] Agents do not permanently accumulate and die in infinite corner deadlock.
