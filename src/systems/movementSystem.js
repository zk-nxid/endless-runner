import { CONFIG } from "../core/constants.js";

export class MovementSystem {
  constructor() {
    this.laneIndex = 1;
    this.targetLaneIndex = 1;
    this.forwardZ = 0;
    this.simY = CONFIG.playerBaseY;
    this.verticalVelocity = 0;
    this.isGrounded = true;
    this.laneTransitionSpeed = 15;
    this.renderX = 0;
    this.simX = 0;
    this.renderY = CONFIG.playerBaseY;
    this.renderZ = 0;
  }

  handleCommand(command) {
    let moved = false;
    let jumped = false;
    if (command === "laneLeft") {
      const before = this.targetLaneIndex;
      this.targetLaneIndex -= 1;
      this.targetLaneIndex = Math.max(0, Math.min(CONFIG.laneCount - 1, this.targetLaneIndex));
      moved = this.targetLaneIndex !== before;
    }
    if (command === "laneRight") {
      const before = this.targetLaneIndex;
      this.targetLaneIndex += 1;
      this.targetLaneIndex = Math.max(0, Math.min(CONFIG.laneCount - 1, this.targetLaneIndex));
      moved = moved || this.targetLaneIndex !== before;
    }
    if (command === "jump" && this.isGrounded) {
      this.verticalVelocity = CONFIG.jump.velocity;
      this.isGrounded = false;
      jumped = true;
    }
    return { moved, jumped };
  }

  tick(deltaSeconds, forwardSpeed) {
    const targetX = (this.targetLaneIndex - 1) * CONFIG.laneWidth;
    const diff = targetX - this.simX;
    const maxStep = this.laneTransitionSpeed * deltaSeconds;
    const step = Math.abs(diff) < maxStep ? diff : Math.sign(diff) * maxStep;
    this.simX += step;
    this.forwardZ -= forwardSpeed * deltaSeconds;

    this.verticalVelocity -= CONFIG.jump.gravity * deltaSeconds;
    this.simY += this.verticalVelocity * deltaSeconds;
    if (this.simY <= CONFIG.playerBaseY) {
      this.simY = CONFIG.playerBaseY;
      this.verticalVelocity = 0;
      this.isGrounded = true;
    }
  }

  getBodyPosition() {
    return { x: this.simX, y: this.simY, z: this.forwardZ };
  }

  interpolate(previous, alpha) {
    this.renderX = previous.x + (this.simX - previous.x) * alpha;
    this.renderY = previous.y + (this.simY - previous.y) * alpha;
    this.renderZ = previous.z + (this.forwardZ - previous.z) * alpha;
    return { x: this.renderX, y: this.renderY, z: this.renderZ };
  }
}
