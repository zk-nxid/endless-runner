import { CONFIG } from "../core/constants.js";

const BOOST_SAFE_GAP_Z = 10;
const BOOST_LANE_TOLERANCE = CONFIG.laneWidth * 0.6;

export class SpawnerSystem {
  constructor(rng) {
    this.rng = rng;
    this.nextSpawnZ = -25;
    this.nextBoostZ = -42;
  }

  tick(playerZ, speed, obstacles, activateObstacle) {
    while (this.nextSpawnZ > playerZ - 120) {
      const laneIndex = this.rng.int(0, CONFIG.laneCount - 1);
      const x = (laneIndex - 1) * CONFIG.laneWidth;
      activateObstacle({ x, z: this.nextSpawnZ, isBoost: false }, obstacles);
      const spacing = this.rng.range(CONFIG.spawnMinDistance, CONFIG.spawnMaxDistance) + speed * 0.2;
      this.nextSpawnZ -= spacing;
    }

    while (this.nextBoostZ > playerZ - 120) {
      const startLane = this.rng.int(0, CONFIG.laneCount - 1);
      let placed = false;
      for (let attempt = 0; attempt < CONFIG.laneCount && !placed; attempt += 1) {
        const laneIndex = (startLane + attempt) % CONFIG.laneCount;
        const x = (laneIndex - 1) * CONFIG.laneWidth;
        if (this.#laneClearForBoost(obstacles, x, this.nextBoostZ)) {
          activateObstacle({ x, z: this.nextBoostZ, isBoost: true }, obstacles);
          placed = true;
        }
      }
      if (!placed) {
        // All lanes blocked at this Z. Shift further back and try again next iteration.
        this.nextBoostZ -= BOOST_SAFE_GAP_Z + 4;
        continue;
      }
      const boostSpacing = this.rng.range(48, 72);
      this.nextBoostZ -= boostSpacing;
    }
  }

  #laneClearForBoost(obstacles, x, z) {
    for (const o of obstacles) {
      if (!o.active || o.isBoost) continue;
      if (Math.abs(o.x - x) >= BOOST_LANE_TOLERANCE) continue;
      if (Math.abs(o.z - z) < BOOST_SAFE_GAP_Z) return false;
    }
    return true;
  }

  reset() {
    this.nextSpawnZ = -25;
    this.nextBoostZ = -42;
  }
}
