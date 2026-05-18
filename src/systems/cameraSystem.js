import { CONFIG } from "../core/constants.js";

/**
 * Cinematic chase camera with FOV punching, hit shake, and continuous
 * perlin-ish handheld micro-shake. State is consumed by both the Three.js
 * avatar camera and the PlayCanvas world camera each frame.
 */
export class CameraSystem {
  constructor() {
    this.state = {
      position: { x: 0, y: CONFIG.camera.followHeight, z: CONFIG.camera.followDistance },
      lookAt: { x: 0, y: 1.2, z: -6 },
      fov: CONFIG.camera.fov,
      aspect: 1,
    };
    this.baseFov = CONFIG.camera.fov;
    this.fovOffset = 0;
    this.fovPunchAmount = 0;
    this.fovPunchTime = 0;
    this.fovPunchDuration = 0;

    this.shakeAmount = 0;
    this.shakeTime = 0;
    this.shakeDuration = 0;
    this.shakeOffset = { x: 0, y: 0, z: 0 };
    this.lookShake = { x: 0, y: 0 };

    this.handheldPhase = Math.random() * 1000;
  }

  update(playerPosition, deltaSeconds, options = {}) {
    const targetX = playerPosition.x;
    const targetY = CONFIG.camera.followHeight;
    const targetZ = playerPosition.z + CONFIG.camera.followDistance;
    const smoothing = 1 - Math.exp(-CONFIG.camera.damping * deltaSeconds);

    this.state.position.x += (targetX - this.state.position.x) * smoothing;
    this.state.position.y += (targetY - this.state.position.y) * smoothing;
    this.state.position.z += (targetZ - this.state.position.z) * smoothing;

    this.state.lookAt.x = playerPosition.x * 0.3;
    this.state.lookAt.y = 1.2;
    this.state.lookAt.z = playerPosition.z - 6;

    this.#updateFov(deltaSeconds, options);
    this.#updateShake(deltaSeconds);
    this.#updateHandheld(deltaSeconds);
    this.#applyOffsets();
  }

  /** Eases base FOV toward base + amount, decays back to base over duration seconds. */
  punchFov(amount, duration = 0.45) {
    this.fovPunchAmount = amount;
    this.fovPunchDuration = duration;
    this.fovPunchTime = 0;
  }

  /** Adds a transient camera shake (position + lookAt jitter). */
  shake(intensity, duration = 0.3) {
    if (intensity > this.shakeAmount * (1 - this.shakeTime / Math.max(0.001, this.shakeDuration))) {
      this.shakeAmount = intensity;
      this.shakeDuration = duration;
      this.shakeTime = 0;
    }
  }

  reset(playerPosition) {
    this.state.position.x = playerPosition.x;
    this.state.position.y = CONFIG.camera.followHeight;
    this.state.position.z = playerPosition.z + CONFIG.camera.followDistance;
    this.state.lookAt.x = playerPosition.x * 0.3;
    this.state.lookAt.y = 1.2;
    this.state.lookAt.z = playerPosition.z - 6;
    this.state.fov = this.baseFov;
    this.fovOffset = 0;
    this.fovPunchAmount = 0;
    this.fovPunchDuration = 0;
    this.fovPunchTime = 0;
    this.shakeAmount = 0;
    this.shakeTime = 0;
    this.shakeDuration = 0;
  }

  setAspect(aspect) {
    this.state.aspect = aspect;
  }

  getState() {
    return this.state;
  }

  /** Match floating-origin shifts applied to the player (keeps smoothing coherent). */
  rebaseZ(delta) {
    this.state.position.z += delta;
    this.state.lookAt.z += delta;
  }

  applyToThree(camera) {
    camera.position.set(this.state.position.x, this.state.position.y, this.state.position.z);
    camera.lookAt(this.state.lookAt.x, this.state.lookAt.y, this.state.lookAt.z);
    if (camera.fov !== this.state.fov || camera.aspect !== this.state.aspect) {
      camera.fov = this.state.fov;
      camera.aspect = this.state.aspect;
      camera.updateProjectionMatrix();
    }
  }

  #updateFov(deltaSeconds, options) {
    let punchOffset = 0;
    if (this.fovPunchDuration > 0) {
      this.fovPunchTime += deltaSeconds;
      const t = Math.min(1, this.fovPunchTime / this.fovPunchDuration);
      const ease = (1 - t) * Math.exp(-2 * t);
      punchOffset = this.fovPunchAmount * ease;
      if (t >= 1) {
        this.fovPunchDuration = 0;
        this.fovPunchAmount = 0;
      }
    }
    const sustainedBoost = options.boostActive ? 2.2 : 0;
    const targetOffset = punchOffset + sustainedBoost;
    this.fovOffset += (targetOffset - this.fovOffset) * Math.min(1, deltaSeconds * 6);
  }

  #updateShake(deltaSeconds) {
    if (this.shakeDuration > 0) {
      this.shakeTime += deltaSeconds;
      const t = Math.min(1, this.shakeTime / this.shakeDuration);
      const decay = 1 - t;
      const intensity = this.shakeAmount * decay;
      this.shakeOffset.x = (Math.random() * 2 - 1) * intensity;
      this.shakeOffset.y = (Math.random() * 2 - 1) * intensity * 0.6;
      this.shakeOffset.z = (Math.random() * 2 - 1) * intensity * 0.4;
      this.lookShake.x = (Math.random() * 2 - 1) * intensity * 0.6;
      this.lookShake.y = (Math.random() * 2 - 1) * intensity * 0.4;
      if (t >= 1) {
        this.shakeDuration = 0;
        this.shakeAmount = 0;
        this.shakeOffset.x = 0;
        this.shakeOffset.y = 0;
        this.shakeOffset.z = 0;
        this.lookShake.x = 0;
        this.lookShake.y = 0;
      }
    } else {
      this.shakeOffset.x *= 0.7;
      this.shakeOffset.y *= 0.7;
      this.shakeOffset.z *= 0.7;
      this.lookShake.x *= 0.7;
      this.lookShake.y *= 0.7;
    }
  }

  #updateHandheld(deltaSeconds) {
    this.handheldPhase += deltaSeconds;
    const p = this.handheldPhase;
    this.handheldX = Math.sin(p * 0.7) * 0.018 + Math.sin(p * 1.9) * 0.008;
    this.handheldY = Math.cos(p * 0.6) * 0.012 + Math.sin(p * 2.1) * 0.006;
  }

  #applyOffsets() {
    this.state.position.x += this.shakeOffset.x + this.handheldX;
    this.state.position.y += this.shakeOffset.y + this.handheldY;
    this.state.position.z += this.shakeOffset.z;
    this.state.lookAt.x += this.lookShake.x + this.handheldX * 0.5;
    this.state.lookAt.y += this.lookShake.y + this.handheldY * 0.5;
    this.state.fov = this.baseFov + this.fovOffset;
  }
}
