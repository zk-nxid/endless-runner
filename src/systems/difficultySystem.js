import { CONFIG } from "../core/constants.js";

export class DifficultySystem {
  constructor() {
    this.elapsed = 0;
    this.speed = CONFIG.baseForwardSpeed;
  }

  tick(deltaSeconds) {
    this.elapsed += deltaSeconds;
    const linear = this.elapsed * CONFIG.speedRampPerSecond;
    const accelerated = 0.5 * CONFIG.speedRampAcceleration * this.elapsed * this.elapsed;
    this.speed = CONFIG.baseForwardSpeed + linear + accelerated;
  }
}
