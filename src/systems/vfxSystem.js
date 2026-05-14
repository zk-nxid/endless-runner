import * as THREE from "three";

/**
 * Lightweight Three.js VFX pool for the avatar overlay scene.
 * Manages speed-line streaks (boost) and impact ring (collision).
 * All effects use additive transparent materials so they bloom in
 * the post-FX pass.
 */
export class VfxSystem {
  constructor(scene, theme) {
    this.scene = scene;
    this.theme = theme;
    this.speedLines = [];
    this.activeSpeedLines = [];
    this.maxSpeedLines = 24;
    this.spawnAccumulator = 0;
    this.spawnInterval = 0.05;

    this.#buildSpeedLinePool();
    this.#buildImpactRing();
  }

  /** Returns a position vector to spawn streaks behind, called every frame. */
  setAnchor(x, y, z) {
    this.anchorX = x;
    this.anchorY = y;
    this.anchorZ = z;
  }

  setBoostActive(active, intensity = 1) {
    this.boostActive = active;
    this.boostIntensity = intensity;
  }

  triggerImpact(x, y, z) {
    if (!this.impactRing) return;
    this.impactRing.position.set(x, y, z);
    this.impactRing.visible = true;
    this.impactTime = 0;
    this.impactDuration = 0.7;
    this.impactRing.scale.setScalar(0.2);
    this.impactMaterial.opacity = 0.95;
  }

  update(deltaSeconds) {
    this.#updateSpeedLines(deltaSeconds);
    this.#updateImpact(deltaSeconds);
  }

  #buildSpeedLinePool() {
    const palette = this.theme.palette;
    const lineMat = new THREE.MeshBasicMaterial({
      color: palette.accentLightB ?? 0x51d9ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const accentMat = new THREE.MeshBasicMaterial({
      color: palette.accentLightA ?? 0xff5bb7,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < this.maxSpeedLines; i += 1) {
      const mat = i % 2 === 0 ? lineMat.clone() : accentMat.clone();
      const geo = new THREE.PlaneGeometry(0.04, 1.6);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.speedLines.push({ mesh, material: mat, life: 0, maxLife: 0.35, vz: 0 });
    }
  }

  #buildImpactRing() {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.07, 12, 36), mat);
    ring.rotation.x = Math.PI / 2;
    ring.visible = false;
    this.impactRing = ring;
    this.impactMaterial = mat;
    this.scene.add(ring);
  }

  #updateSpeedLines(deltaSeconds) {
    if (this.boostActive) {
      this.spawnAccumulator += deltaSeconds;
      while (this.spawnAccumulator >= this.spawnInterval) {
        this.spawnAccumulator -= this.spawnInterval;
        this.#spawnSpeedLine();
      }
    } else {
      this.spawnAccumulator = 0;
    }

    for (const entry of this.speedLines) {
      if (!entry.mesh.visible) continue;
      entry.life += deltaSeconds;
      const t = entry.life / entry.maxLife;
      if (t >= 1) {
        entry.mesh.visible = false;
        entry.material.opacity = 0;
        continue;
      }
      entry.mesh.position.z += entry.vz * deltaSeconds;
      entry.material.opacity = 0.85 * (1 - t);
      entry.mesh.scale.y = 1 + t * 1.5;
    }
  }

  #spawnSpeedLine() {
    const entry = this.speedLines.find((e) => !e.mesh.visible);
    if (!entry || this.anchorX === undefined) return;
    const lateral = (Math.random() - 0.5) * 5.5;
    const vert = 0.3 + Math.random() * 1.3;
    entry.mesh.position.set(
      this.anchorX + lateral,
      vert,
      this.anchorZ + 0.6 + Math.random() * 0.8
    );
    entry.mesh.rotation.y = Math.atan2(lateral, -3) * 0.4;
    entry.mesh.visible = true;
    entry.life = 0;
    entry.material.opacity = 0.85;
    entry.vz = 18 + Math.random() * 8;
  }

  #updateImpact(deltaSeconds) {
    if (!this.impactRing?.visible) return;
    this.impactTime += deltaSeconds;
    const t = Math.min(1, this.impactTime / this.impactDuration);
    if (t >= 1) {
      this.impactRing.visible = false;
      return;
    }
    const scale = 0.2 + t * 6.5;
    this.impactRing.scale.setScalar(scale);
    this.impactMaterial.opacity = 0.95 * (1 - t) ** 1.4;
  }
}
