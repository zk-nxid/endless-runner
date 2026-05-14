import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RGBShiftShader } from "three/addons/shaders/RGBShiftShader.js";

/**
 * Three.js post-FX pipeline for the avatar overlay canvas.
 * Provides bloom + chromatic aberration that can be tuned in real time
 * (e.g. boost punch, collision spike). Falls back to direct render if
 * any addon import fails or perf budget is exceeded.
 */
export class PostFxSystem {
  constructor(renderer, scene, camera, { width, height }) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.enabled = true;
    this.baseBloomStrength = 0.32;
    this.baseBloomRadius = 0.42;
    this.baseBloomThreshold = 0.6;
    this.baseAberration = 0.0006;
    this.aberrationBoost = 0;
    this.bloomBoost = 0;

    try {
      this.composer = new EffectComposer(renderer);
      this.composer.setSize(width, height);

      this.renderPass = new RenderPass(scene, camera);
      this.composer.addPass(this.renderPass);

      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(width, height),
        this.baseBloomStrength,
        this.baseBloomRadius,
        this.baseBloomThreshold
      );
      this.composer.addPass(this.bloomPass);

      this.aberrationPass = new ShaderPass(RGBShiftShader);
      this.aberrationPass.uniforms.amount.value = this.baseAberration;
      this.composer.addPass(this.aberrationPass);

      this.outputPass = new OutputPass();
      this.composer.addPass(this.outputPass);
    } catch (error) {
      console.warn("PostFxSystem disabled - addon import failed:", error);
      this.composer = null;
      this.enabled = false;
    }
  }

  setSize(w, h) {
    if (!this.composer) return;
    this.composer.setSize(w, h);
    if (this.bloomPass?.resolution) {
      this.bloomPass.resolution.set(w, h);
    }
  }

  /** Brief CA + bloom punch, decays over `duration` seconds. */
  punch({ aberration = 0.004, bloom = 0.22, duration = 0.35 } = {}) {
    this._punchAberration = aberration;
    this._punchBloom = bloom;
    this._punchTime = 0;
    this._punchDuration = duration;
  }

  /** Sustained boost while active is true (called every frame). */
  // The pickup punch carries the visual hit; sustained haze felt like blur, so it's disabled.
  setBoostActive(_active) {
    this.bloomBoost = 0;
    this.aberrationBoost = 0;
  }

  update(deltaSeconds) {
    if (!this.composer || !this.enabled) return;
    let punchAberration = 0;
    let punchBloom = 0;
    if (this._punchDuration && this._punchTime !== undefined) {
      this._punchTime += deltaSeconds;
      const t = Math.min(1, this._punchTime / this._punchDuration);
      const ease = 1 - t;
      punchAberration = this._punchAberration * ease;
      punchBloom = this._punchBloom * ease;
      if (t >= 1) {
        this._punchDuration = 0;
      }
    }
    if (this.bloomPass) {
      this.bloomPass.strength = this.baseBloomStrength + this.bloomBoost + punchBloom;
    }
    if (this.aberrationPass?.uniforms?.amount) {
      this.aberrationPass.uniforms.amount.value =
        this.baseAberration + this.aberrationBoost + punchAberration;
    }
  }

  render(deltaSeconds) {
    if (!this.composer || !this.enabled) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.composer.render(deltaSeconds);
  }

  disable() {
    this.enabled = false;
  }
}
