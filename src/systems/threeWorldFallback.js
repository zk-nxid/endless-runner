import * as THREE from "three";
import { CONFIG } from "../core/constants.js";

const VOID_RAIN_COUNT = 40;

export class ThreeWorldFallback {
  constructor(scene, theme, rng, obstaclePoolSize) {
    this.scene = scene;
    this.theme = theme;
    this.rng = rng;
    this.trackCenterOffsetZ = -300;
    this.skylineLoopDistance = 16 * 26;
    this.obstaclePool = [];
    this.laneLights = [];
    this.skyline = [];
    this._voidRainPrevTime = null;

    this.scene.background = new THREE.Color(this.theme.palette.sceneBackground);
    this.scene.fog = new THREE.Fog(
      this.theme.palette.fogColor,
      this.theme.fog.near,
      this.theme.fog.far
    );

    this.#buildGround();
    this.#buildLaneLights();
    this.#buildSkyline();
    this.#buildVoidRain();
    this.#buildObstaclePool(obstaclePoolSize);
  }

  setCamera() {}
  resize() {}
  render() {}

  syncObstacles(obstacleData) {
    for (let i = 0; i < this.obstaclePool.length && i < obstacleData.length; i += 1) {
      const data = obstacleData[i];
      const mesh = this.obstaclePool[i];
      mesh.visible = !!data.active;
      if (!data.active) continue;
      mesh.position.set(data.x, data.isBoost ? 0.01 : data.colliderHeight * 0.5, data.z);
      mesh.scale.setScalar(data.scale ?? 1);
      mesh.rotation.set(data.rotationX ?? 0, data.rotationY ?? 0, data.rotationZ ?? 0);
    }
  }

  setMoodIntensity(intensity, paletteShift = 0) {
    if (this.scene.background) {
      const dark = new THREE.Color(this.theme.palette.sceneBackground);
      const light = new THREE.Color(this.theme.palette.lightSceneBackground ?? 0xc6b89a);
      this.scene.background.copy(dark.clone().lerp(light, paletteShift));
    }
    if (this.scene.fog) {
      const darkFog = new THREE.Color(this.theme.palette.fogColor);
      const lightFog = new THREE.Color(this.theme.palette.lightFogColor ?? 0xc8b88a);
      this.scene.fog.color.copy(darkFog.lerp(lightFog, paletteShift));
      this.scene.fog.near = this.theme.fog.near;
      this.scene.fog.far = this.theme.fog.far;
    }
    const ghostCount = this.theme.geometry.laneGhostCount;
    this.laneLights.forEach((line, idx) => {
      line.material.opacity =
        0.06 + (idx % ghostCount === 0 ? 0.26 : 0.08) + intensity * 0.14;
    });
    this.skyline.forEach((tower) => {
      tower.traverse((child) => {
        if (!child.isMesh || !child.material) return;
        child.material.opacity = 0.14 + intensity * 0.2;
      });
    });
    if (this.ground?.material?.color) {
      const darkGround = new THREE.Color(this.theme.palette.groundColor);
      const lightGround = new THREE.Color(this.theme.palette.lightGroundColor ?? 0xd6c8a4);
      this.ground.material.color.copy(darkGround.clone().lerp(lightGround, paletteShift));
      if (this.ground.material.emissive) {
        const beige = new THREE.Color(this.theme.palette.lightGroundColor ?? 0xd6c8a4);
        this.ground.material.emissive.setRGB(
          beige.r * paletteShift * 0.18,
          beige.g * paletteShift * 0.18,
          beige.b * paletteShift * 0.18
        );
      }
    }
    const lightObstacleBase = new THREE.Color(this.theme.palette.lightObstacleBase ?? 0xc8a878);
    const lightObstacleAccent = new THREE.Color(this.theme.palette.lightObstacleAccent ?? 0xb8d8a8);
    this.obstaclePool.forEach((mesh) => {
      if (!mesh?.material?.color) return;
      if (mesh.userData?.isBoost) return; // Boost pads keep their dedicated color.
      const base = (mesh.userData?.baseColor || new THREE.Color(this.theme.palette.obstacleBaseColor)).clone();
      const target = mesh.userData?.lightColor
        ? mesh.userData.lightColor.clone()
        : (mesh.userData?.useAccent ? lightObstacleAccent.clone() : lightObstacleBase.clone());
      mesh.material.color.copy(base.lerp(target, paletteShift));
      if (mesh.material.emissive) {
        mesh.material.emissive.copy(mesh.material.color);
      }
    });

    if (this.voidRain?.length) {
      const baseOpacity = 0.1 + intensity * 0.12 + paletteShift * 0.05;
      this.voidRain.forEach((entry) => {
        entry.mesh.material.opacity = Math.min(0.28, baseOpacity);
      });
    }
  }

  setTrackOffset(bodyZ) {
    const now = performance.now();
    const dt =
      this._voidRainPrevTime == null
        ? CONFIG.fixedDeltaSeconds
        : Math.min(0.1, (now - this._voidRainPrevTime) / 1000);
    this._voidRainPrevTime = now;

    const z = bodyZ + this.trackCenterOffsetZ;
    this.ground.position.z = z;
    this.laneLights.forEach((line) => {
      line.position.z = z;
    });
    this.skyline.forEach((tower, idx) => {
      if (tower.position.z > bodyZ + 12) {
        tower.position.z -= this.skylineLoopDistance;
      }
      tower.rotation.z = Math.sin(bodyZ * 0.03 + idx * 0.7) * 0.06;
    });

    if (this.voidRain?.length) {
      const t = now * 0.001;
      const behindZ = bodyZ + 14;
      const floorY = -2;
      for (const entry of this.voidRain) {
        const m = entry.mesh;
        let y = m.position.y - entry.fallSpeed * dt;
        let x = m.position.x + Math.sin(t * 0.35 + entry.phase) * 0.022 * dt;
        let zPos = m.position.z;
        if (y < floorY || zPos > behindZ) {
          y = this.rng.range(20, 48);
          x = this.rng.range(-36, 36);
          zPos = bodyZ - this.rng.range(45, 200);
        }
        m.position.set(x, y, zPos);
      }
    }
  }

  #buildGround() {
    const mat = new THREE.MeshStandardMaterial({
      color: this.theme.palette.groundColor,
      metalness: 0.12,
      roughness: 0.92,
    });
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 700), mat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.z = -300;
    this.scene.add(this.ground);
  }

  #buildLaneLights() {
    const ghostCount = this.theme.geometry.laneGhostCount;
    for (let i = 0; i < CONFIG.laneCount; i += 1) {
      for (let ghost = 0; ghost < ghostCount; ghost += 1) {
        const line = new THREE.Mesh(
          new THREE.BoxGeometry(0.05 + ghost * 0.035, 0.01, 700),
          new THREE.MeshBasicMaterial({
            color: ghost === 0 ? this.theme.palette.laneLightColor : this.theme.palette.laneGhostColor,
            transparent: true,
            opacity: ghost === 0 ? 0.34 : 0.1,
          })
        );
        line.position.set((i - 1) * CONFIG.laneWidth, 0.02 + ghost * 0.01, -300);
        this.laneLights.push(line);
        this.scene.add(line);
      }
    }
  }

  #buildSkyline() {
    const bodyMat = new THREE.MeshBasicMaterial({ color: 0x2c1f38, transparent: true, opacity: 0.22 });
    const glowMat = new THREE.MeshBasicMaterial({
      color: this.theme.palette.accentLightA ?? this.theme.palette.laneLightColor,
      transparent: true,
      opacity: 0.2,
    });
    const windowMat = new THREE.MeshBasicMaterial({
      color: this.theme.palette.accentLightB ?? this.theme.palette.laneGhostColor,
      transparent: true,
      opacity: 0.22,
    });
    for (let i = 0; i < 16; i += 1) {
      const width = this.rng.range(1.7, 3.3);
      const height = this.rng.range(2.8, 6.5);
      const tower = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.18), bodyMat);
      const crown = new THREE.Mesh(new THREE.BoxGeometry(width * 0.72, 0.26, 0.14), glowMat);
      crown.position.y = height * 0.5 + 0.16;
      tower.add(body, crown);
      for (let row = 0; row < 3; row += 1) {
        for (let col = 0; col < 2; col += 1) {
          const w = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.03), windowMat);
          w.position.set(-0.35 + col * 0.7, -height * 0.3 + row * (height / 4), 0.11);
          tower.add(w);
        }
      }
      const side = i % 2 === 0 ? -1 : 1;
      tower.position.set(side * this.rng.range(6.2, 11.2), this.rng.range(2.6, 5.8), -40 - i * 26);
      tower.rotation.y = side > 0 ? -0.2 : 0.2;
      this.skyline.push(tower);
      this.scene.add(tower);
    }
  }

  #buildVoidRain() {
    this.voidRain = [];
    const palette = this.theme.palette;
    const colors = [
      new THREE.Color(palette.accentLightA ?? palette.laneLightColor),
      new THREE.Color(palette.accentLightB ?? palette.laneGhostColor),
      new THREE.Color(palette.particleColor ?? 0xffd9ee),
    ];
    const bodyZ = 0;
    for (let i = 0; i < VOID_RAIN_COUNT; i += 1) {
      const color = colors[i % colors.length].clone();
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.14,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const w = this.rng.range(0.04, 0.09);
      const h = this.rng.range(0.55, 1.35);
      const d = this.rng.range(0.04, 0.08);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(
        this.rng.range(-34, 34),
        this.rng.range(18, 46),
        bodyZ - this.rng.range(40, 200)
      );
      this.scene.add(mesh);
      this.voidRain.push({
        mesh,
        fallSpeed: this.rng.range(2.2, 5.8),
        phase: this.rng.range(0, Math.PI * 2),
      });
    }
  }

  #buildObstaclePool(size) {
    const boostBase = this.theme.palette.boostBaseColor ?? 0xfff066;
    const boostAccent = this.theme.palette.boostAccentColor ?? 0xffaa1f;
    for (let i = 0; i < size; i += 1) {
      const kind = i % 5;
      const isBoost = kind === 4;
      const useAccent = i % 2 === 1;
      const baseColor = isBoost
        ? boostBase
        : useAccent
        ? this.theme.palette.obstacleAccentColor
        : this.theme.palette.obstacleBaseColor;
      const mat = new THREE.MeshStandardMaterial({
        color: baseColor,
        emissive: baseColor,
        emissiveIntensity: isBoost ? 0.7 : this.theme.emissive.obstacleBase,
        roughness: isBoost ? 0.2 : 0.5,
        metalness: isBoost ? 0.1 : 0.35,
      });
      let mesh;
      if (kind === 0) mesh = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.82, 0.72), mat);
      else if (kind === 1) mesh = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.5, 0.13), mat);
      else if (kind === 2) mesh = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.12, 18, 42), mat);
      else if (kind === 3) mesh = new THREE.Mesh(new THREE.BoxGeometry(1.4, 3.2, 1.2), mat);
      else {
        const padGroup = new THREE.Group();
        const padMat = new THREE.MeshStandardMaterial({
          color: boostBase,
          emissive: boostBase,
          emissiveIntensity: 0.7,
          roughness: 0.2,
          metalness: 0.1,
        });
        const pad = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.02, 1.65), padMat);
        padGroup.add(pad);

        const borderMat = new THREE.MeshStandardMaterial({
          color: this.theme.palette.boostGlowColor ?? 0xfff8b0,
          emissive: this.theme.palette.boostGlowColor ?? 0xfff8b0,
          emissiveIntensity: 1.0,
          roughness: 0.15,
          metalness: 0.1,
        });
        const border = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.018, 1.75), borderMat);
        border.position.y = -0.005;
        padGroup.add(border);

        const chevronMat = new THREE.MeshStandardMaterial({
          color: boostAccent,
          emissive: boostAccent,
          emissiveIntensity: 0.85,
          roughness: 0.2,
          metalness: 0.1,
        });
        for (let c = 0; c < 3; c += 1) {
          const chevronZ = -0.5 + c * 0.5;
          const left = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 0.16), chevronMat);
          left.position.set(-0.22, 0.022, chevronZ);
          left.rotation.y = (28 * Math.PI) / 180;
          padGroup.add(left);
          const right = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 0.16), chevronMat);
          right.position.set(0.22, 0.022, chevronZ);
          right.rotation.y = (-28 * Math.PI) / 180;
          padGroup.add(right);
        }

        mesh = padGroup;
      }
      mesh.visible = false;
      mesh.userData.baseColor = new THREE.Color(baseColor);
      mesh.userData.useAccent = useAccent && !isBoost;
      mesh.userData.isBoost = isBoost;
      this.obstaclePool.push(mesh);
      this.scene.add(mesh);
    }
  }
}
