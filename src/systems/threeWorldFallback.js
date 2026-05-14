import * as THREE from "three";
import { CONFIG } from "../core/constants.js";

function voidRainLaneExcludeHalf() {
  const laneOuter = ((CONFIG.laneCount - 1) * CONFIG.laneWidth) / 2 + CONFIG.laneWidth * 0.5;
  return laneOuter + CONFIG.laneWidth * 0.92;
}

const VOID_RAIN_COUNT = 10;
const VOID_RAIN_GRAVITY = 13;
const VOID_JUNK_CLUSTER_SCALE = 2.45;
const VOID_RAIN_VANISH_Y = -118;
const VOID_RAIN_VIRTUAL_TOP_MIN = 68;
const VOID_RAIN_VIRTUAL_TOP_MAX = 102;
const VOID_RAIN_SPAWN_DEPTH_MIN = 5;
const VOID_RAIN_SPAWN_DEPTH_MAX = 36;
const VOID_RAIN_RESPAWN_DEPTH_MIN = 2.5;
const VOID_RAIN_RESPAWN_DEPTH_MAX = 20;
const VOID_RAIN_X_OUTER = 132;

export class ThreeWorldFallback {
  constructor(scene, theme, rng, obstaclePoolSize) {
    this.scene = scene;
    this.theme = theme;
    this.rng = rng;
    this.trackCenterOffsetZ = -300;
    this.obstaclePool = [];
    this.laneLights = [];
    this._voidRainPrevTime = null;

    this.scene.background = new THREE.Color(this.theme.palette.sceneBackground);
    this.scene.fog = new THREE.Fog(
      this.theme.palette.fogColor,
      this.theme.fog.near,
      this.theme.fog.far
    );

    this.#buildGround();
    this.#buildCinematicSkyBackdrop();
    this.#buildLaneLights();
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
      const baseOpacity = 0.5 + intensity * 0.3 + paletteShift * 0.08;
      const emissiveInt = 0.32 + intensity * 0.52 + paletteShift * 0.14;
      this.voidRain.forEach((entry) => {
        for (const mat of entry.materials) {
          mat.opacity = Math.min(0.94, baseOpacity);
          mat.emissiveIntensity = emissiveInt;
        }
      });
    }

    if (this.cinematicSkyRingMat) {
      const m = Math.max(0, Math.min(1, intensity));
      this.cinematicSkyRingMat.opacity = 0.28 + m * 0.28;
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
    if (this.cinematicSkyGroup) {
      this.cinematicSkyGroup.position.set(bodyZ * 0.025, 4.6, bodyZ * 0.92);
      const t = now * 0.00035;
      this.cinematicSkyGroup.rotation.set(
        Math.sin(t) * 0.04,
        t * 0.22,
        Math.cos(t * 0.4) * 0.03
      );
    }

    if (this.voidRain?.length) {
      const t = now * 0.001;
      const behindZ = bodyZ + 14;
      for (const entry of this.voidRain) {
        const g = entry.group;
        g.rotation.x += entry.spin.x * dt;
        g.rotation.y += entry.spin.y * dt;
        g.rotation.z += entry.spin.z * dt;
        entry.fallVel += VOID_RAIN_GRAVITY * dt;
        let y = g.position.y - entry.fallVel * dt;
        let x = g.position.x + Math.sin(t * 0.35 + entry.phase) * 0.018 * dt;
        x = this.#clampVoidRainX(x, g.position.x);
        let zPos = g.position.z;
        if (y < VOID_RAIN_VANISH_Y || zPos > behindZ) {
          const kin = this.#sampleVoidJunkKinematics(true);
          y = kin.y;
          x = this.#sampleVoidRainX();
          zPos = bodyZ - this.rng.range(45, 200);
          entry.fallVel = kin.fallVel;
        }
        g.position.set(x, y, zPos);
      }
    }
  }

  #buildGround() {
    const mat = new THREE.MeshStandardMaterial({
      color: this.theme.palette.groundColor,
      metalness: 0.12,
      roughness: 0.92,
    });
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(CONFIG.runwayStripWidth, 700), mat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.z = -300;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
  }

  #buildCinematicSkyBackdrop() {
    const canvas = document.createElement("canvas");
    canvas.width = 4;
    canvas.height = 640;
    const ctx = canvas.getContext("2d");
    const hex = (h) => {
      const n = typeof h === "number" ? h : 0;
      return `#${n.toString(16).padStart(6, "0")}`;
    };
    const g = ctx.createLinearGradient(0, 0, 0, 640);
    g.addColorStop(0, hex(this.theme.palette.sceneBackground));
    g.addColorStop(0.14, hex(this.theme.palette.accentLightB ?? 0x51d9ff));
    g.addColorStop(0.28, hex(this.theme.palette.fogColor));
    g.addColorStop(0.46, hex(this.theme.palette.accentLightA ?? 0xff5bb7));
    g.addColorStop(0.56, hex(this.theme.palette.accentLightB ?? 0x51d9ff));
    g.addColorStop(0.72, hex(this.theme.palette.sceneBackground));
    g.addColorStop(1, hex(this.theme.palette.sceneBackground));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 640);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.skyGradientMat = new THREE.MeshBasicMaterial({
      map: tex,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(185, 40, 28), this.skyGradientMat);
    sky.renderOrder = -999;
    this.cinematicSkyRingMat = new THREE.MeshBasicMaterial({
      color: this.theme.palette.accentLightB ?? 0x51d9ff,
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(92, 0.45, 10, 72), this.cinematicSkyRingMat);
    ring.rotation.x = Math.PI * 0.49;
    ring.rotation.y = Math.PI * 0.12;
    ring.position.set(9, -10, -52);
    ring.renderOrder = -998;
    this.cinematicSkyGroup = new THREE.Group();
    this.cinematicSkyGroup.add(sky, ring);
    this.scene.add(this.cinematicSkyGroup);
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

  #threeJunkTrack(materials, mat) {
    if (!materials.includes(mat)) materials.push(mat);
  }

  #threeJunkMat(hex, opts = {}) {
    const ec = new THREE.Color(hex);
    const rough = 1 - (opts.gloss ?? 0.56);
    return new THREE.MeshStandardMaterial({
      color: opts.diffuse != null ? new THREE.Color(opts.diffuse) : ec.clone(),
      emissive: ec,
      emissiveIntensity: opts.emissiveIntensity ?? 0.42,
      metalness: opts.metalness ?? 0.4,
      roughness: opts.roughness ?? rough,
      transparent: true,
      opacity: opts.opacity ?? 0.82,
      depthWrite: false,
    });
  }

  #threeJunkBox(group, materials, mat, sx, sy, sz, px, py, pz, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    m.position.set(px, py, pz);
    m.rotation.set(rx, ry, rz);
    m.castShadow = false;
    m.receiveShadow = false;
    group.add(m);
    this.#threeJunkTrack(materials, mat);
  }

  #threeVoidRainRing(group, materials, mat, ringRadius, thickness, segments) {
    for (let i = 0; i < segments; i += 1) {
      const theta = (i / segments) * Math.PI * 2;
      const nextTheta = ((i + 1) / segments) * Math.PI * 2;
      const chord = Math.max(
        0.02,
        ringRadius * Math.hypot(Math.cos(nextTheta) - Math.cos(theta), Math.sin(nextTheta) - Math.sin(theta))
      );
      const part = new THREE.Mesh(new THREE.BoxGeometry(chord, thickness, thickness), mat);
      part.position.set(Math.cos(theta) * ringRadius, Math.sin(theta) * ringRadius, 0);
      part.rotation.z = theta;
      part.castShadow = false;
      part.receiveShadow = false;
      group.add(part);
    }
    this.#threeJunkTrack(materials, mat);
  }

  /** Lane obstacle composites (no boost pad) for void rain — matches PlayCanvas set. */
  #createThreeVoidRainCluster() {
    const group = new THREE.Group();
    const materials = [];
    const pal = this.theme.palette;
    const useAccentLead = this.rng.next() > 0.5;
    const baseHex = useAccentLead ? pal.obstacleAccentColor : pal.obstacleBaseColor;
    const accentHex = useAccentLead ? pal.obstacleBaseColor : pal.obstacleAccentColor;
    const glowHex = pal.playerColor;
    const emBase = this.theme.emissive.obstacleBase;

    const bodyMat = this.#threeJunkMat(baseHex, {
      emissiveIntensity: emBase,
      metalness: 0.42,
      gloss: 0.55,
    });
    const accentMat = this.#threeJunkMat(accentHex, {
      emissiveIntensity: emBase * 0.85,
      metalness: 0.45,
      gloss: 0.62,
    });
    const glowMat = this.#threeJunkMat(glowHex, {
      emissiveIntensity: emBase * 1.15,
      metalness: 0.32,
      gloss: 0.72,
    });

    const types = ["luggage", "keycardPillar", "neonArch", "tower"];
    const type = types[Math.floor(this.rng.range(0, 4))];
    const s = VOID_JUNK_CLUSTER_SCALE * this.rng.range(0.88, 1.08);

    if (type === "luggage") {
      this.#threeJunkBox(group, materials, bodyMat, 1.05 * s, 0.82 * s, 0.72 * s, 0, 0, 0);
      const handle = new THREE.Group();
      this.#threeVoidRainRing(handle, materials, accentMat, 0.18 * s, 0.04 * s, 14);
      handle.position.set(0, 0.5 * s, 0);
      handle.rotation.x = Math.PI / 2;
      group.add(handle);
      this.#threeJunkBox(group, materials, glowMat, 1.08 * s, 0.14 * s, 0.06 * s, 0, 0.08 * s, 0.37 * s);
    } else if (type === "keycardPillar") {
      this.#threeJunkBox(group, materials, bodyMat, 0.62 * s, 1.5 * s, 0.13 * s, 0, 0, 0);
      this.#threeJunkBox(group, materials, accentMat, 0.16 * s, 0.16 * s, 0.05 * s, 0, 0.18 * s, 0.09 * s);
      this.#threeJunkBox(group, materials, glowMat, 0.44 * s, 0.08 * s, 0.02 * s, 0, -0.3 * s, 0.085 * s);
    } else if (type === "neonArch") {
      const archRing = new THREE.Group();
      this.#threeVoidRainRing(archRing, materials, accentMat, 0.46 * s, 0.12 * s, 24);
      group.add(archRing);
      this.#threeJunkBox(group, materials, bodyMat, 0.2 * s, 0.66 * s, 0.2 * s, -0.44 * s, -0.45 * s, 0);
      this.#threeJunkBox(group, materials, bodyMat, 0.2 * s, 0.66 * s, 0.2 * s, 0.44 * s, -0.45 * s, 0);
      this.#threeJunkBox(group, materials, glowMat, 0.6 * s, 0.14 * s, 0.06 * s, 0, 0.12 * s, 0);
    } else {
      this.#threeJunkBox(group, materials, bodyMat, 1.4 * s, 3.2 * s, 1.2 * s, 0, 0, 0);
      this.#threeJunkBox(group, materials, accentMat, 1.12 * s, 0.38 * s, 1.02 * s, 0, 1.72 * s, 0);
      this.#threeJunkBox(group, materials, glowMat, 1.46 * s, 0.2 * s, 0.08 * s, 0, 1.35 * s, 0.62 * s);
    }

    return { group, materials };
  }

  #sampleVoidJunkKinematics(recycle) {
    const H = this.rng.range(VOID_RAIN_VIRTUAL_TOP_MIN, VOID_RAIN_VIRTUAL_TOP_MAX);
    const yHi = H - 0.35;
    if (!recycle) {
      const depth = this.rng.range(VOID_RAIN_SPAWN_DEPTH_MIN, VOID_RAIN_SPAWN_DEPTH_MAX);
      const y = Math.min(H - depth, yHi);
      const fallVel = Math.sqrt(Math.max(0, 2 * VOID_RAIN_GRAVITY * depth));
      return { y, fallVel };
    }
    const depth = this.rng.range(VOID_RAIN_RESPAWN_DEPTH_MIN, VOID_RAIN_RESPAWN_DEPTH_MAX);
    const y = Math.min(H - depth, yHi);
    const fallVel = Math.sqrt(Math.max(0, 2 * VOID_RAIN_GRAVITY * depth));
    return { y, fallVel };
  }

  #sampleVoidRainX() {
    const inner = voidRainLaneExcludeHalf();
    if (this.rng.next() < 0.5) {
      return this.rng.range(-VOID_RAIN_X_OUTER, -inner);
    }
    return this.rng.range(inner, VOID_RAIN_X_OUTER);
  }

  #clampVoidRainX(x, prevX) {
    const inner = voidRainLaneExcludeHalf();
    if (x > -inner && x < inner) {
      const dir = Math.sign(prevX) || (this.rng.next() < 0.5 ? -1 : 1);
      return dir * (inner + 0.38);
    }
    return x;
  }

  #buildVoidRain() {
    this.voidRain = [];
    const bodyZ = 0;
    for (let i = 0; i < VOID_RAIN_COUNT; i += 1) {
      const { group, materials } = this.#createThreeVoidRainCluster();
      this.scene.add(group);
      const x = this.#sampleVoidRainX();
      const z = bodyZ - this.rng.range(40, 200);
      const { y, fallVel } = this.#sampleVoidJunkKinematics(false);
      group.position.set(x, y, z);
      group.rotation.set(
        this.rng.range(0, Math.PI * 2),
        this.rng.range(0, Math.PI * 2),
        this.rng.range(0, Math.PI * 2)
      );
      this.voidRain.push({
        group,
        materials,
        fallVel,
        phase: this.rng.range(0, Math.PI * 2),
        spin: {
          x: this.rng.range(-0.9, 0.9),
          y: this.rng.range(-0.9, 0.9),
          z: this.rng.range(-0.9, 0.9),
        },
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
      if (mesh.traverse) {
        mesh.traverse((ch) => {
          if (ch.isMesh) {
            ch.castShadow = true;
            ch.receiveShadow = true;
          }
        });
      } else if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
      mesh.userData.baseColor = new THREE.Color(baseColor);
      mesh.userData.useAccent = useAccent && !isBoost;
      mesh.userData.isBoost = isBoost;
      this.obstaclePool.push(mesh);
      this.scene.add(mesh);
    }
  }
}
