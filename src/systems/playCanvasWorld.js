import * as pc from "playcanvas";
import { CONFIG } from "../core/constants.js";

export const OBSTACLE_PROFILES = [
  { type: "luggage", colliderHeight: 1.2, unjumpable: false },
  { type: "keycardPillar", colliderHeight: 1.35, unjumpable: false },
  { type: "neonArch", colliderHeight: 1.15, unjumpable: false },
  { type: "tower", colliderHeight: 3.4, unjumpable: true },
  { type: "speedPad", colliderHeight: 0.02, unjumpable: false, isBoost: true },
];

const VOID_RAIN_COUNT = 10;
/** World units/s²; integrated each tick with per-item fallVel for gravity-like drops. */
const VOID_RAIN_GRAVITY = 13;
/** Scale for void-rain obstacle shapes (matches lane dodge props). */
const VOID_JUNK_CLUSTER_SCALE = 2.45;
/**
 * Recycle only far under the playfield (large props must clear camera + fog).
 * Tall obstacle scale (~2.45×) needs extra margin so roots don’t vanish mid-fall.
 */
const VOID_RAIN_VANISH_Y = -118;
const VOID_RAIN_VIRTUAL_TOP_MIN = 68;
const VOID_RAIN_VIRTUAL_TOP_MAX = 102;
/** Fall distance below apex H for first spawn — keeps debris in the upper sky, not popping near the lane. */
const VOID_RAIN_SPAWN_DEPTH_MIN = 5;
const VOID_RAIN_SPAWN_DEPTH_MAX = 36;
/** Re-entry after recycle: always near the virtual ceiling (short fall so it reads as “still raining”). */
const VOID_RAIN_RESPAWN_DEPTH_MIN = 2.5;
const VOID_RAIN_RESPAWN_DEPTH_MAX = 20;
/** Furthest |world x| void rain uses (fills the horizon; lane strip is hollowed out). */
const VOID_RAIN_X_OUTER = 132;

/** Half-width of the no-drop corridor over the playable lanes (+ margin for scaled props). */
function voidRainLaneExcludeHalf() {
  const laneOuter = ((CONFIG.laneCount - 1) * CONFIG.laneWidth) / 2 + CONFIG.laneWidth * 0.5;
  return laneOuter + CONFIG.laneWidth * 0.92;
}

const SKY_STAR_COUNT = 88;
const SKY_AURORA_STRIPS = 5;

export class PlayCanvasWorld {
  constructor(canvas, theme, rng, obstaclePoolSize) {
    this.canvas = canvas;
    this.theme = theme;
    this.rng = rng;
    this.obstaclePoolSize = obstaclePoolSize;
    this.trackCenterOffsetZ = -300;
    this._trackBodyZ = 0;

    this.app = new pc.Application(canvas, {
      graphicsDeviceOptions: { antialias: true, powerPreference: "high-performance" },
    });
    this.app.setCanvasFillMode(pc.FILLMODE_NONE);
    this.app.setCanvasResolution(pc.RESOLUTION_AUTO);
    this.app.autoRender = true;

    this.#configureScene();
    this.#buildCamera();
    this.#buildLights();
    this.#buildStaticWorld();
    this.#buildDustMotes();
    this.#buildVoidRain();
    this.#buildObstaclePool();
    this.#buildCinematicSky();
    this.app.start();
    this.#initCinematicFrame();
    this.app.on("update", (dt) => {
      this.cameraFrame?.update(dt);
      this.#tickCinematicSky(dt);
      this.#tickDust(dt);
      this.#tickVoidRain(dt);
    });

    this.moodIntensity = 0;
    this.obstacleMaterialSets = [];
  }

  setCamera(state) {
    this.cameraEntity.setPosition(state.position.x, state.position.y, state.position.z);
    this.cameraEntity.lookAt(state.lookAt.x, state.lookAt.y, state.lookAt.z);
    if (this.cameraEntity.camera.fov !== state.fov) {
      this.cameraEntity.camera.fov = state.fov;
    }
    this.#syncCinematicSkyToCamera(state);
  }

  setMoodIntensity(intensity, paletteShift = 0) {
    this.moodIntensity = intensity;
    this.paletteShift = paletteShift;
    // Keep fog far stable so the scene stays sharp at high speed.
    this.app.scene.fogEnd = this.theme.fog.far;
    this.app.scene.fogStart = this.theme.fog.near;
    this.dirLight.light.intensity = 1.05 + intensity * 0.25 + paletteShift * 0.35;

    const darkFog = this.#colorFromHex(this.theme.palette.fogColor);
    const lightFog = this.#colorFromHex(this.theme.palette.lightFogColor ?? 0xc8b88a);
    this.app.scene.fogColor = this.#mixColors(darkFog, lightFog, paletteShift);

    const darkClear = this.#colorFromHex(this.theme.palette.sceneBackground);
    const lightClear = this.#colorFromHex(this.theme.palette.lightSceneBackground ?? 0xc6b89a);
    this.cameraEntity.camera.clearColor = this.#mixColors(darkClear, lightClear, paletteShift);

    const ambientDark = this.#colorFromHex(this.theme.palette.accentLightA ?? 0x8a97d8);
    ambientDark.r *= 0.55;
    ambientDark.g *= 0.55;
    ambientDark.b *= 0.55;
    const ambientLight = this.#colorFromHex(this.theme.palette.lightAmbient ?? 0xd0c0a0);
    this.app.scene.ambientLight = this.#mixColors(ambientDark, ambientLight, paletteShift);

    if (this.groundMaterial) {
      const darkGround = this.#colorFromHex(this.theme.palette.groundColor);
      const lightGround = this.#colorFromHex(this.theme.palette.lightGroundColor ?? 0xd6c8a4);
      const groundTint = this.#mixColors(darkGround, lightGround, paletteShift);
      this.groundMaterial.diffuse = groundTint;
      this.groundMaterial.emissive = this.#mixColors(new pc.Color(0, 0, 0), lightGround, paletteShift * 0.18);
      this.groundMaterial.update();
    }

    const ghostCount = this.theme.geometry.laneGhostCount;
    this.laneLightMaterials.forEach((mat, idx) => {
      const baseOpacity = idx % ghostCount === 0 ? 0.34 : 0.1;
      mat.opacity = 0.06 + baseOpacity + intensity * 0.14;
      mat.update();
    });

    const darkBase = this.#colorFromHex(this.theme.palette.obstacleBaseColor);
    const darkAccent = this.#colorFromHex(this.theme.palette.obstacleAccentColor);
    const darkGlow = this.#colorFromHex(this.theme.palette.playerColor);
    const lightBase = this.#colorFromHex(this.theme.palette.lightObstacleBase ?? 0xc8a878);
    const lightAccent = this.#colorFromHex(this.theme.palette.lightObstacleAccent ?? 0xb8d8a8);
    const lightGlow = this.#colorFromHex(this.theme.palette.lightObstacleAccent ?? 0xb8d8a8);
    this.obstacleMaterialSets.forEach((set) => {
      if (set.isBoost) return; // Boost pads keep their dedicated high-contrast colors.
      set.body.diffuse = this.#mixColors(darkBase, lightBase, paletteShift);
      set.body.emissive = this.#mixColors(darkBase, lightBase, paletteShift);
      set.body.update();
      set.accent.diffuse = this.#mixColors(darkAccent, lightAccent, paletteShift);
      set.accent.emissive = this.#mixColors(darkAccent, lightAccent, paletteShift);
      set.accent.update();
      set.glow.diffuse = this.#mixColors(darkGlow, lightGlow, paletteShift);
      set.glow.emissive = this.#mixColors(darkGlow, lightGlow, paletteShift);
      set.glow.update();
    });

    if (this.voidRain?.length) {
      const baseOpacity = 0.5 + intensity * 0.3 + paletteShift * 0.08;
      const emissiveInt = 0.32 + intensity * 0.52 + paletteShift * 0.14;
      this.voidRain.forEach((entry) => {
        for (const mat of entry.materials) {
          mat.opacity = Math.min(0.94, baseOpacity);
          mat.emissiveIntensity = emissiveInt;
          mat.update();
        }
      });
    }

    if (this.cameraFrame) {
      const m = Math.max(0, Math.min(1, intensity));
      this.cameraFrame.bloom.intensity = 0.028 + m * 0.055;
      this.cameraFrame.vignette.intensity = 0.24 + m * 0.15;
      this.cameraFrame.colorEnhance.vibrance = 0.2 + m * 0.18;
    }

    if (this.skyDomeMaterial) {
      const m = Math.max(0, Math.min(1, intensity));
      this.skyDomeMaterial.emissiveIntensity = 1.05 + m * 0.5;
      this.skyDomeMaterial.update();
    }
    if (this.auroraStrips?.length) {
      const m = Math.max(0, Math.min(1, intensity));
      for (const s of this.auroraStrips) {
        s.mat.emissiveIntensity = s.baseEmissive * (0.72 + m * 0.65);
        s.mat.update();
      }
    }
    if (this.megaRingMaterial) {
      const m = Math.max(0, Math.min(1, intensity));
      this.megaRingMaterial.emissiveIntensity = 0.5 + m * 0.85;
      this.megaRingMaterial.update();
    }
    if (this.skyStarEntries?.length) {
      const m = Math.max(0, Math.min(1, intensity));
      const mul = 0.82 + m * 0.52;
      for (const entry of this.skyStarEntries) {
        entry.moodMul = mul;
      }
    }
  }

  syncObstacles(obstacleData) {
    for (let i = 0; i < this.obstaclePool.length && i < obstacleData.length; i += 1) {
      const entry = obstacleData[i];
      const entity = this.obstaclePool[i];
      if (!entry.active) {
        if (entity.enabled) entity.enabled = false;
        continue;
      }
      if (!entity.enabled) entity.enabled = true;
      entity.setLocalScale(entry.scale, entry.scale, entry.scale);
      entity.setEulerAngles(
        (entry.rotationX ?? 0) * 57.2957795,
        (entry.rotationY ?? 0) * 57.2957795,
        (entry.rotationZ ?? 0) * 57.2957795
      );
      const y = entry.isBoost ? 0.01 : entry.colliderHeight * 0.5;
      entity.setPosition(entry.x, y, entry.z);
    }
  }

  setTrackOffset(bodyZ) {
    this._trackBodyZ = bodyZ;
    const z = bodyZ + this.trackCenterOffsetZ;
    this.ground.setPosition(0, 0, z);
    this.laneLights.forEach((entity) => {
      const p = entity.getPosition();
      entity.setPosition(p.x, p.y, z);
    });
    if (this.dustMotes) {
      const dustLoopAhead = bodyZ - 70;
      const dustLoopBehind = bodyZ + 8;
      this.dustMotes.forEach((entry) => {
        const p = entry.entity.getPosition();
        if (p.z > dustLoopBehind) {
          entry.entity.setPosition(p.x, p.y, dustLoopAhead - this.rng.range(0, 12));
        }
      });
    }
  }

  resize(w, h) {
    this.app.resizeCanvas(w, h);
  }

  render(dt) {
    // Application owns its own render loop via app.start().
    // Kept as a no-op so Game can call it without branching.
  }

  #configureScene() {
    this.app.scene.fog = pc.FOG_LINEAR;
    this.app.scene.fogStart = this.theme.fog.near;
    this.app.scene.fogEnd = this.theme.fog.far;
    this.app.scene.fogColor = this.#colorFromHex(this.theme.palette.fogColor);
    const ambient = this.#colorFromHex(this.theme.palette.accentLightA ?? 0x8a97d8);
    ambient.r *= 0.62;
    ambient.g *= 0.62;
    ambient.b *= 0.62;
    this.app.scene.ambientLight = ambient;

    if (this.app.scene.lighting) {
      this.app.scene.lighting.shadowsEnabled = true;
    }

    if (typeof pc.TONEMAP_ACES !== "undefined") {
      this.app.scene.toneMapping = pc.TONEMAP_ACES;
    } else if (typeof pc.TONEMAP_FILMIC !== "undefined") {
      this.app.scene.toneMapping = pc.TONEMAP_FILMIC;
    }
    if (this.app.scene.exposure !== undefined) {
      this.app.scene.exposure = 1.05;
    }
    if (this.app.scene.skyboxIntensity !== undefined) {
      this.app.scene.skyboxIntensity = 0.9;
    }
  }

  /** HDR frame graph: bloom, SSAO, grading — tuned for a grounded cinematic look. */
  #initCinematicFrame() {
    if (typeof pc.CameraFrame === "undefined") return;
    const camera = this.cameraEntity.camera;
    this.cameraFrame = new pc.CameraFrame(this.app, camera);
    const cf = this.cameraFrame;
    cf.rendering.toneMapping =
      typeof pc.TONEMAP_ACES !== "undefined" ? pc.TONEMAP_ACES : cf.rendering.toneMapping;
    cf.rendering.sharpness = 0.22;
    cf.rendering.samples = 2;
    cf.bloom.intensity = 0.032;
    cf.bloom.blurLevel = 12;
    cf.ssao.type = pc.SSAOTYPE_COMBINE;
    cf.ssao.intensity = 0.32;
    cf.ssao.radius = 22;
    cf.ssao.samples = 9;
    cf.ssao.power = 4.5;
    cf.ssao.blurEnabled = true;
    cf.grading.enabled = true;
    cf.grading.saturation = 1.08;
    cf.grading.contrast = 1.07;
    cf.grading.brightness = 0.98;
    cf.grading.tint.set(0.96, 0.99, 1.05);
    cf.colorEnhance.enabled = true;
    cf.colorEnhance.vibrance = 0.22;
    cf.colorEnhance.shadows = 0.12;
    cf.colorEnhance.midtones = 0.05;
    cf.colorEnhance.highlights = -0.1;
    cf.colorEnhance.dehaze = 0.1;
    cf.vignette.intensity = 0.3;
    cf.vignette.inner = 0.52;
    cf.vignette.outer = 1.22;
    cf.vignette.curvature = 0.78;
    cf.vignette.color.set(0.02, 0.01, 0.06);
    cf.fringing.intensity = 2.6;
  }

  #buildCamera() {
    this.cameraEntity = new pc.Entity("camera");
    this.cameraEntity.addComponent("camera", {
      clearColor: this.#colorFromHex(this.theme.palette.sceneBackground),
      fov: CONFIG.camera.fov,
      nearClip: 0.1,
      farClip: 300,
    });
    this.app.root.addChild(this.cameraEntity);
  }

  #buildLights() {
    this.dirLight = new pc.Entity("dirLight");
    const keyLightOpts = {
      type: "directional",
      color: this.#colorFromHex(this.theme.palette.accentLightB ?? 0xc2d4ff),
      intensity: 1.28,
      castShadows: true,
      shadowDistance: 96,
      shadowResolution: 2048,
      shadowIntensity: 1,
      shadowBias: 0.04,
      normalOffsetBias: 0.28,
      shadowSamples: 20,
    };
    if (typeof pc.SHADOW_PCF5 !== "undefined") {
      keyLightOpts.shadowType = pc.SHADOW_PCF5;
    }
    this.dirLight.addComponent("light", keyLightOpts);
    this.dirLight.setEulerAngles(58, 34, 0);
    this.app.root.addChild(this.dirLight);

    this.fillLight = new pc.Entity("fillLight");
    this.fillLight.addComponent("light", {
      type: "directional",
      color: this.#colorFromHex(this.theme.palette.accentLightA ?? 0xff5bb7),
      intensity: 0.42,
      castShadows: false,
    });
    this.fillLight.setEulerAngles(-18, -128, 0);
    this.app.root.addChild(this.fillLight);
  }

  #buildStaticWorld() {
    const groundMat = this.#standardMaterial({
      color: this.theme.palette.groundColor,
      metalness: 0.22,
      gloss: 0.14,
      clearCoat: 0.38,
      clearCoatGloss: 0.72,
    });
    this.groundMaterial = groundMat;
    this.ground = new pc.Entity("ground");
    this.ground.addComponent("render", { type: "plane" });
    this.ground.render.material = groundMat;
    this.ground.setLocalScale(CONFIG.runwayStripWidth, 1, 700);
    this.ground.setPosition(0, 0, this.trackCenterOffsetZ);
    this.app.root.addChild(this.ground);

    this.#buildLaneLights();
  }

  #buildLaneLights() {
    this.laneLights = [];
    this.laneLightMaterials = [];
    const ghostCount = this.theme.geometry.laneGhostCount;
    for (let i = 0; i < CONFIG.laneCount; i += 1) {
      for (let ghost = 0; ghost < ghostCount; ghost += 1) {
        const isPrimary = ghost === 0;
        const colorHex = isPrimary
          ? this.theme.palette.laneLightColor
          : this.theme.palette.laneGhostColor;
        const opacity = isPrimary ? 0.4 : 0.18;
        const mat = this.#standardMaterial({
          color: 0x000000,
          emissive: colorHex,
          emissiveIntensity: 1.0,
          opacity,
          blendType: pc.BLEND_NORMAL,
        });
        this.laneLightMaterials.push(mat);

        const lane = new pc.Entity("laneLight");
        lane.addComponent("render", { type: "box" });
        lane.render.material = mat;
        const width = 0.05 + ghost * 0.035;
        lane.setLocalScale(width, 0.01, 700);
        lane.setPosition((i - 1) * CONFIG.laneWidth, 0.02 + ghost * 0.01, this.trackCenterOffsetZ);
        this.laneLights.push(lane);
        this.app.root.addChild(lane);
      }
    }
  }

  #buildDustMotes() {
    this.dustMotes = [];
    const palette = this.theme.palette;
    const moteColors = [
      palette.accentLightA ?? 0xff5bb7,
      palette.accentLightB ?? 0x51d9ff,
      palette.particleColor ?? 0xffd9ee,
    ];
    const count = 24;
    for (let i = 0; i < count; i += 1) {
      const colorHex = moteColors[i % moteColors.length];
      const mat = this.#standardMaterial({
        color: 0x000000,
        emissive: colorHex,
        emissiveIntensity: 0.55,
        opacity: 0.22,
        blendType: pc.BLEND_ADDITIVE,
      });
      const mote = new pc.Entity("dustMote");
      mote.addComponent("render", { type: "box" });
      mote.render.material = mat;
      const scale = this.rng.range(0.03, 0.06);
      mote.setLocalScale(scale, scale, scale);
      const x = this.rng.range(-12, 12);
      const y = this.rng.range(0.5, 7.5);
      const z = this.rng.range(-60, 0);
      mote.setPosition(x, y, z);
      this.app.root.addChild(mote);
      this.dustMotes.push({
        entity: mote,
        baseY: y,
        phase: this.rng.range(0, Math.PI * 2),
        driftSpeed: this.rng.range(0.3, 0.85),
        material: mat,
      });
    }
  }

  #tickDust(dt) {
    if (!this.dustMotes) return;
    const t = performance.now() * 0.001;
    for (const entry of this.dustMotes) {
      const p = entry.entity.getPosition();
      const newY = entry.baseY + Math.sin(t * 0.6 + entry.phase) * 0.18;
      const newX = p.x + Math.sin(t * 0.4 + entry.phase) * 0.012;
      entry.entity.setPosition(newX, newY, p.z);
    }
  }

  #junkTrackMat(materials, mat) {
    if (!materials.includes(mat)) materials.push(mat);
  }

  #junkScatterMat(emissiveHex, opts = {}) {
    const mat = this.#standardMaterial({
      color: opts.diffuse ?? emissiveHex,
      emissive: emissiveHex,
      emissiveIntensity: opts.emissiveIntensity ?? 0.42,
      metalness: opts.metalness ?? 0.4,
      gloss: opts.gloss ?? 0.56,
      opacity: opts.opacity ?? 0.82,
      blendType: pc.BLEND_NORMAL,
      clearCoat: opts.clearCoat ?? 0.2,
      clearCoatGloss: 0.82,
    });
    mat.depthWrite = false;
    mat.update();
    return mat;
  }

  #junkAddBox(parent, materials, mat, sx, sy, sz, px, py, pz, rx = 0, ry = 0, rz = 0) {
    const e = new pc.Entity("junkPart");
    e.addComponent("render", { type: "box" });
    e.render.material = mat;
    e.render.castShadows = false;
    e.render.receiveShadows = false;
    e.setLocalScale(sx, sy, sz);
    e.setLocalPosition(px, py, pz);
    e.setLocalEulerAngles(rx, ry, rz);
    parent.addChild(e);
    this.#junkTrackMat(materials, mat);
  }

  /**
   * Box-segment ring (same idea as lane neon-arch handle), for void-rain obstacle copies.
   */
  #voidRainRingEntity(materials, mat, ringRadius, thickness, segments) {
    const ring = new pc.Entity("voidRainRing");
    for (let i = 0; i < segments; i += 1) {
      const part = new pc.Entity("voidRainRingPart");
      part.addComponent("render", { type: "box" });
      part.render.material = mat;
      part.render.castShadows = false;
      part.render.receiveShadows = false;
      const theta = (i / segments) * Math.PI * 2;
      const nextTheta = ((i + 1) / segments) * Math.PI * 2;
      const chord = Math.max(
        0.02,
        ringRadius * Math.hypot(Math.cos(nextTheta) - Math.cos(theta), Math.sin(nextTheta) - Math.sin(theta))
      );
      part.setLocalScale(chord, thickness, thickness);
      part.setLocalPosition(Math.cos(theta) * ringRadius, Math.sin(theta) * ringRadius, 0);
      part.setLocalEulerAngles(0, 0, (theta * 180) / Math.PI);
      ring.addChild(part);
    }
    this.#junkTrackMat(materials, mat);
    return ring;
  }

  /** Same composite shapes as `#buildObstacleEntity`, minus boost pads — scenery only. */
  #createVoidRainCluster() {
    const root = new pc.Entity("voidRainObstacle");
    const materials = [];
    const pal = this.theme.palette;
    const useAccentLead = this.rng.next() > 0.5;
    const baseHex = useAccentLead ? pal.obstacleAccentColor : pal.obstacleBaseColor;
    const accentHex = useAccentLead ? pal.obstacleBaseColor : pal.obstacleAccentColor;
    const glowHex = pal.playerColor;
    const emBase = this.theme.emissive.obstacleBase;

    const bodyMat = this.#junkScatterMat(baseHex, {
      emissiveIntensity: emBase,
      metalness: 0.42,
      gloss: 0.55,
      clearCoat: 0.28,
    });
    const accentMat = this.#junkScatterMat(accentHex, {
      emissiveIntensity: emBase * 0.85,
      metalness: 0.45,
      gloss: 0.62,
      clearCoat: 0.34,
    });
    const glowMat = this.#junkScatterMat(glowHex, {
      emissiveIntensity: emBase * 1.15,
      metalness: 0.32,
      gloss: 0.72,
      clearCoat: 0.22,
    });

    const types = ["luggage", "keycardPillar", "neonArch", "tower"];
    const type = types[Math.floor(this.rng.range(0, 4))];
    const s = VOID_JUNK_CLUSTER_SCALE * this.rng.range(0.88, 1.08);

    if (type === "luggage") {
      this.#junkAddBox(root, materials, bodyMat, 1.05 * s, 0.82 * s, 0.72 * s, 0, 0, 0);
      const handle = this.#voidRainRingEntity(materials, accentMat, 0.18 * s, 0.04 * s, 14);
      handle.setLocalPosition(0, 0.5 * s, 0);
      handle.setLocalEulerAngles(90, 0, 0);
      root.addChild(handle);
      this.#junkAddBox(root, materials, glowMat, 1.08 * s, 0.14 * s, 0.06 * s, 0, 0.08 * s, 0.37 * s);
    } else if (type === "keycardPillar") {
      this.#junkAddBox(root, materials, bodyMat, 0.62 * s, 1.5 * s, 0.13 * s, 0, 0, 0);
      this.#junkAddBox(root, materials, accentMat, 0.16 * s, 0.16 * s, 0.05 * s, 0, 0.18 * s, 0.09 * s);
      this.#junkAddBox(root, materials, glowMat, 0.44 * s, 0.08 * s, 0.02 * s, 0, -0.3 * s, 0.085 * s);
    } else if (type === "neonArch") {
      const ring = this.#voidRainRingEntity(materials, accentMat, 0.46 * s, 0.12 * s, 24);
      root.addChild(ring);
      this.#junkAddBox(root, materials, bodyMat, 0.2 * s, 0.66 * s, 0.2 * s, -0.44 * s, -0.45 * s, 0);
      this.#junkAddBox(root, materials, bodyMat, 0.2 * s, 0.66 * s, 0.2 * s, 0.44 * s, -0.45 * s, 0);
      this.#junkAddBox(root, materials, glowMat, 0.6 * s, 0.14 * s, 0.06 * s, 0, 0.12 * s, 0);
    } else {
      this.#junkAddBox(root, materials, bodyMat, 1.4 * s, 3.2 * s, 1.2 * s, 0, 0, 0);
      this.#junkAddBox(root, materials, accentMat, 1.12 * s, 0.38 * s, 1.02 * s, 0, 1.72 * s, 0);
      this.#junkAddBox(root, materials, glowMat, 1.46 * s, 0.2 * s, 0.08 * s, 0, 1.35 * s, 0.62 * s);
    }

    return { root, materials };
  }

  /**
   * Depth below a virtual apex H (always high sky). Velocity matches distance already
   * fallen: v = sqrt(2 g depth), so motion never looks like a mid-air spawn at rest.
   */
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

  /** Samples world X in (-outer, -inner] ∪ [inner, outer) — never over the runway strip. */
  #sampleVoidRainX() {
    const inner = voidRainLaneExcludeHalf();
    if (this.rng.next() < 0.5) {
      return this.rng.range(-VOID_RAIN_X_OUTER, -inner);
    }
    return this.rng.range(inner, VOID_RAIN_X_OUTER);
  }

  /** If lateral drift carries debris into the lane corridor, shove it back to the nearest wing. */
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
    const bodyZ = this._trackBodyZ;
    for (let i = 0; i < VOID_RAIN_COUNT; i += 1) {
      const { root, materials } = this.#createVoidRainCluster();
      const x0 = this.#sampleVoidRainX();
      const z0 = bodyZ - this.rng.range(40, 200);
      const { y: y0, fallVel: v0 } = this.#sampleVoidJunkKinematics(false);

      this.app.root.addChild(root);
      root.setPosition(x0, y0, z0);
      root.setLocalEulerAngles(
        this.rng.range(0, 360),
        this.rng.range(0, 360),
        this.rng.range(0, 360)
      );
      this.voidRain.push({
        entity: root,
        materials,
        fallVel: v0,
        phase: this.rng.range(0, Math.PI * 2),
        spin: {
          x: this.rng.range(-50, 50),
          y: this.rng.range(-50, 50),
          z: this.rng.range(-50, 50),
        },
      });
    }
  }

  #tickVoidRain(dt) {
    if (!this.voidRain?.length) return;
    const bodyZ = this._trackBodyZ;
    const t = performance.now() * 0.001;
    const behindZ = bodyZ + 14;
    for (const entry of this.voidRain) {
      const e = entry.entity;
      e.rotateLocal(entry.spin.x * dt, entry.spin.y * dt, entry.spin.z * dt);
      const p = e.getPosition();
      entry.fallVel += VOID_RAIN_GRAVITY * dt;
      let y = p.y - entry.fallVel * dt;
      let x = p.x + Math.sin(t * 0.35 + entry.phase) * 0.018 * dt;
      x = this.#clampVoidRainX(x, p.x);
      let z = p.z;
      if (y < VOID_RAIN_VANISH_Y || z > behindZ) {
        const kin = this.#sampleVoidJunkKinematics(true);
        y = kin.y;
        x = this.#sampleVoidRainX();
        z = bodyZ - this.rng.range(45, 200);
        entry.fallVel = kin.fallVel;
      }
      e.setPosition(x, y, z);
    }
  }

  #buildObstaclePool() {
    this.obstaclePool = [];
    this.obstacleMaterialSets = [];
    const palette = this.theme.palette;
    const boostBase = palette.boostBaseColor ?? 0xfff066;
    const boostAccent = palette.boostAccentColor ?? 0xffaa1f;
    const boostGlow = palette.boostGlowColor ?? 0xfff8b0;
    for (let i = 0; i < this.obstaclePoolSize; i += 1) {
      const profile = OBSTACLE_PROFILES[i % OBSTACLE_PROFILES.length];
      const isBoost = !!profile.isBoost;

      const baseHex = isBoost
        ? boostBase
        : i % 2 === 0
        ? palette.obstacleBaseColor
        : palette.obstacleAccentColor;
      const accentHex = isBoost
        ? boostAccent
        : i % 2 === 0
        ? palette.obstacleAccentColor
        : palette.obstacleBaseColor;
      const glowHex = isBoost ? boostGlow : palette.playerColor;

      const bodyMat = this.#standardMaterial({
        color: baseHex,
        emissive: baseHex,
        emissiveIntensity: isBoost ? 0.7 : this.theme.emissive.obstacleBase,
        metalness: isBoost ? 0.18 : 0.42,
        gloss: isBoost ? 0.9 : 0.55,
        clearCoat: isBoost ? 0.75 : 0.28,
        clearCoatGloss: isBoost ? 0.95 : 0.82,
      });
      const accentMat = this.#standardMaterial({
        color: accentHex,
        emissive: accentHex,
        emissiveIntensity: isBoost ? 0.85 : this.theme.emissive.obstacleBase * 0.85,
        metalness: isBoost ? 0.15 : 0.45,
        gloss: isBoost ? 0.92 : 0.62,
        clearCoat: isBoost ? 0.65 : 0.34,
        clearCoatGloss: 0.85,
      });
      const glowMat = this.#standardMaterial({
        color: glowHex,
        emissive: glowHex,
        emissiveIntensity: isBoost ? 1.0 : this.theme.emissive.obstacleBase * 1.15,
        metalness: isBoost ? 0.2 : 0.32,
        gloss: isBoost ? 0.95 : 0.72,
        clearCoat: isBoost ? 0.45 : 0.22,
        clearCoatGloss: 0.9,
      });

      const root = this.#buildObstacleEntity(profile.type, bodyMat, accentMat, glowMat);
      root.enabled = false;
      this.app.root.addChild(root);
      this.obstaclePool.push(root);
      this.obstacleMaterialSets.push({
        body: bodyMat,
        accent: accentMat,
        glow: glowMat,
        isBoost,
      });
    }
  }

  #buildObstacleEntity(type, bodyMat, accentMat, glowMat) {
    const root = new pc.Entity(`obstacle_${type}`);

    if (type === "luggage") {
      const bag = new pc.Entity("bag");
      bag.addComponent("render", { type: "box" });
      bag.render.material = bodyMat;
      bag.setLocalScale(1.05, 0.82, 0.72);
      root.addChild(bag);

      const handle = this.#ringEntity({ ringRadius: 0.18, thickness: 0.04, segments: 14, material: accentMat });
      handle.setLocalPosition(0, 0.5, 0);
      handle.setEulerAngles(90, 0, 0);
      root.addChild(handle);

      const stripe = new pc.Entity("stripe");
      stripe.addComponent("render", { type: "box" });
      stripe.render.material = glowMat;
      stripe.setLocalScale(1.08, 0.14, 0.06);
      stripe.setLocalPosition(0, 0.08, 0.37);
      root.addChild(stripe);
    } else if (type === "keycardPillar") {
      const card = new pc.Entity("card");
      card.addComponent("render", { type: "box" });
      card.render.material = bodyMat;
      card.setLocalScale(0.62, 1.5, 0.13);
      root.addChild(card);

      const chip = new pc.Entity("chip");
      chip.addComponent("render", { type: "box" });
      chip.render.material = accentMat;
      chip.setLocalScale(0.16, 0.16, 0.05);
      chip.setLocalPosition(0, 0.18, 0.09);
      root.addChild(chip);

      const scanLine = new pc.Entity("scanLine");
      scanLine.addComponent("render", { type: "box" });
      scanLine.render.material = glowMat;
      scanLine.setLocalScale(0.44, 0.08, 0.02);
      scanLine.setLocalPosition(0, -0.3, 0.085);
      root.addChild(scanLine);
    } else if (type === "neonArch") {
      const ring = this.#ringEntity({ ringRadius: 0.46, thickness: 0.12, segments: 24, material: accentMat });
      root.addChild(ring);

      const baseLeft = new pc.Entity("baseLeft");
      baseLeft.addComponent("render", { type: "box" });
      baseLeft.render.material = bodyMat;
      baseLeft.setLocalScale(0.2, 0.66, 0.2);
      baseLeft.setLocalPosition(-0.44, -0.45, 0);
      root.addChild(baseLeft);

      const baseRight = new pc.Entity("baseRight");
      baseRight.addComponent("render", { type: "box" });
      baseRight.render.material = bodyMat;
      baseRight.setLocalScale(0.2, 0.66, 0.2);
      baseRight.setLocalPosition(0.44, -0.45, 0);
      root.addChild(baseRight);

      const sign = new pc.Entity("sign");
      sign.addComponent("render", { type: "box" });
      sign.render.material = glowMat;
      sign.setLocalScale(0.6, 0.14, 0.06);
      sign.setLocalPosition(0, 0.12, 0);
      root.addChild(sign);
    } else {
      if (type === "speedPad") {
        const pad = new pc.Entity("speedPad");
        pad.addComponent("render", { type: "box" });
        pad.render.material = bodyMat;
        pad.setLocalScale(1.55, 0.02, 1.65);
        pad.setLocalPosition(0, 0.0, 0);
        root.addChild(pad);

        const border = new pc.Entity("border");
        border.addComponent("render", { type: "box" });
        border.render.material = glowMat;
        border.setLocalScale(1.65, 0.018, 1.75);
        border.setLocalPosition(0, -0.005, 0);
        root.addChild(border);

        for (let c = 0; c < 3; c += 1) {
          const chevronZ = -0.5 + c * 0.5;
          const left = new pc.Entity(`chevronL_${c}`);
          left.addComponent("render", { type: "box" });
          left.render.material = accentMat;
          left.setLocalScale(0.7, 0.04, 0.16);
          left.setLocalPosition(-0.22, 0.022, chevronZ);
          left.setLocalEulerAngles(0, 28, 0);
          root.addChild(left);

          const right = new pc.Entity(`chevronR_${c}`);
          right.addComponent("render", { type: "box" });
          right.render.material = accentMat;
          right.setLocalScale(0.7, 0.04, 0.16);
          right.setLocalPosition(0.22, 0.022, chevronZ);
          right.setLocalEulerAngles(0, -28, 0);
          root.addChild(right);
        }
      } else {
        const tower = new pc.Entity("tower");
        tower.addComponent("render", { type: "box" });
        tower.render.material = bodyMat;
        tower.setLocalScale(1.4, 3.2, 1.2);
        root.addChild(tower);

        const crown = new pc.Entity("crown");
        crown.addComponent("render", { type: "box" });
        crown.render.material = accentMat;
        crown.setLocalScale(1.12, 0.38, 1.02);
        crown.setLocalPosition(0, 1.72, 0);
        root.addChild(crown);

        const signBand = new pc.Entity("signBand");
        signBand.addComponent("render", { type: "box" });
        signBand.render.material = glowMat;
        signBand.setLocalScale(1.46, 0.2, 0.08);
        signBand.setLocalPosition(0, 1.35, 0.62);
        root.addChild(signBand);
      }
    }

    return root;
  }

  #ringEntity({ ringRadius, thickness, segments, material }) {
    const ring = new pc.Entity("ring");
    for (let i = 0; i < segments; i += 1) {
      const part = new pc.Entity("ringPart");
      part.addComponent("render", { type: "box" });
      part.render.material = material;
      const theta = (i / segments) * Math.PI * 2;
      const nextTheta = ((i + 1) / segments) * Math.PI * 2;
      const chord = Math.max(0.02, ringRadius * Math.hypot(Math.cos(nextTheta) - Math.cos(theta), Math.sin(nextTheta) - Math.sin(theta)));
      part.setLocalScale(chord, thickness, thickness);
      part.setLocalPosition(Math.cos(theta) * ringRadius, Math.sin(theta) * ringRadius, 0);
      part.setLocalEulerAngles(0, 0, (theta * 180) / Math.PI);
      ring.addChild(part);
    }
    return ring;
  }

  #createProceduralSkyGradientTexture() {
    const device = this.app.graphicsDevice;
    const w = 2;
    const h = 640;
    const tex = new pc.Texture(device, {
      width: w,
      height: h,
      format: pc.PIXELFORMAT_R8_G8_B8_A8,
      mipmaps: false,
      minFilter: pc.FILTER_LINEAR,
      magFilter: pc.FILTER_LINEAR,
      addressU: pc.ADDRESS_CLAMP_TO_EDGE,
      addressV: pc.ADDRESS_CLAMP_TO_EDGE,
    });
    const deep = this.#colorFromHex(this.theme.palette.sceneBackground);
    const fogC = this.#colorFromHex(this.theme.palette.fogColor);
    const A = this.#colorFromHex(this.theme.palette.accentLightA ?? 0xff5bb7);
    const B = this.#colorFromHex(this.theme.palette.accentLightB ?? 0x51d9ff);
    const pixels = tex.lock();
    const smooth = (e0, e1, x) => {
      const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
      return t * t * (3 - 2 * t);
    };
    for (let y = 0; y < h; y += 1) {
      const v = y / (h - 1);
      let r = deep.r * 0.35 + fogC.r * 0.65;
      let g = deep.g * 0.35 + fogC.g * 0.65;
      let b = deep.b * 0.4 + fogC.b * 0.6;
      const hBand = smooth(0.1, 0.38, v) * (1 - smooth(0.34, 0.56, v));
      r += B.r * 0.55 * hBand;
      g += B.g * 0.62 * hBand;
      b += B.b * 0.7 * hBand;
      const aur = smooth(0.42, 0.5, v) * (1 - smooth(0.5, 0.62, v));
      r += (A.r * 0.85 + B.r * 0.25) * aur * 1.15;
      g += (A.g * 0.45 + B.g * 0.55) * aur * 1.05;
      b += (A.b * 0.35 + B.b * 0.65) * aur * 1.1;
      const topFade = smooth(0.68, 1.0, v);
      r = r * (1 - topFade * 0.65) + deep.r * 0.12 * topFade;
      g = g * (1 - topFade * 0.65) + deep.g * 0.1 * topFade;
      b = b * (1 - topFade * 0.55) + deep.b * 0.15 * topFade;
      const tw = 1 + Math.sin(y * 0.08) * 0.04 + Math.sin(y * 0.19) * 0.02;
      r *= tw;
      g *= tw;
      b *= tw;
      for (let x = 0; x < w; x += 1) {
        const i = (y * w + x) * 4;
        pixels[i] = Math.min(255, Math.floor(r * 255));
        pixels[i + 1] = Math.min(255, Math.floor(g * 255));
        pixels[i + 2] = Math.min(255, Math.floor(b * 255));
        pixels[i + 3] = 255;
      }
    }
    tex.unlock();
    return tex;
  }

  #buildCinematicSky() {
    this._skyPhase = 0;
    this.skyRoot = new pc.Entity("cinematicSky");
    this.app.root.addChild(this.skyRoot);

    const grad = this.#createProceduralSkyGradientTexture();
    const domeMat = new pc.StandardMaterial();
    domeMat.diffuse.set(0, 0, 0);
    domeMat.emissive.set(1, 1, 1);
    domeMat.emissiveMap = grad;
    domeMat.emissiveIntensity = 1.12;
    domeMat.useLighting = false;
    domeMat.depthWrite = false;
    domeMat.cull = pc.CULLFACE_FRONT;
    domeMat.update();
    this.skyDomeMaterial = domeMat;

    const dome = new pc.Entity("skyGradientDome");
    dome.addComponent("render", { type: "sphere" });
    dome.render.material = domeMat;
    dome.render.layers = [pc.LAYERID_SKYBOX];
    dome.render.castShadows = false;
    dome.render.receiveShadows = false;
    dome.setLocalScale(480, 480, 480);
    this.skyRoot.addChild(dome);

    this.megaRingMaterial = new pc.StandardMaterial();
    this.megaRingMaterial.diffuse.set(0, 0, 0);
    this.megaRingMaterial.emissive = this.#colorFromHex(this.theme.palette.accentLightB ?? 0x51d9ff);
    this.megaRingMaterial.emissiveIntensity = 0.72;
    this.megaRingMaterial.useLighting = false;
    this.megaRingMaterial.depthWrite = false;
    this.megaRingMaterial.blendType = pc.BLEND_ADDITIVE;
    this.megaRingMaterial.opacity = 1;
    this.megaRingMaterial.update();

    this.megaRing = new pc.Entity("skyMegaRing");
    this.megaRing.addComponent("render", { type: "torus" });
    this.megaRing.render.material = this.megaRingMaterial;
    this.megaRing.render.layers = [pc.LAYERID_SKYBOX];
    this.megaRing.render.castShadows = false;
    this.megaRing.render.receiveShadows = false;
    this.megaRing.setLocalScale(110, 110, 110);
    this.megaRing.setLocalEulerAngles(72, 20, 0);
    this.megaRing.setLocalPosition(12, -8, -40);
    this.skyRoot.addChild(this.megaRing);

    this.auroraStrips = [];
    for (let i = 0; i < SKY_AURORA_STRIPS; i += 1) {
      const useA = i % 2 === 0;
      const stripMat = new pc.StandardMaterial();
      stripMat.diffuse.set(0, 0, 0);
      stripMat.emissive = useA
        ? this.#colorFromHex(this.theme.palette.accentLightA ?? 0xff5bb7)
        : this.#colorFromHex(this.theme.palette.accentLightB ?? 0x51d9ff);
      const be = 0.55 + this.rng.range(0, 0.35);
      stripMat.emissiveIntensity = be;
      stripMat.useLighting = false;
      stripMat.depthWrite = false;
      stripMat.blendType = pc.BLEND_ADDITIVE;
      stripMat.opacity = 0.22 + this.rng.range(0, 0.12);
      stripMat.update();
      const strip = new pc.Entity(`auroraStrip_${i}`);
      strip.addComponent("render", { type: "box" });
      strip.render.material = stripMat;
      strip.render.layers = [pc.LAYERID_SKYBOX];
      strip.render.castShadows = false;
      strip.render.receiveShadows = false;
      strip.setLocalScale(120, 0.025, 32);
      const xOff = this.rng.range(-35, 35);
      const zOff = this.rng.range(-95, -25);
      const yPos = this.rng.range(6, 26);
      strip.setLocalPosition(xOff, yPos, zOff);
      strip.setLocalEulerAngles(this.rng.range(55, 82), this.rng.range(-40, 40), this.rng.range(-8, 8));
      this.skyRoot.addChild(strip);
      this.auroraStrips.push({
        entity: strip,
        mat: stripMat,
        baseEmissive: be,
        baseOpacity: stripMat.opacity,
        phase: this.rng.range(0, Math.PI * 2),
        speed: this.rng.range(0.35, 0.95),
        amp: this.rng.range(1.2, 3.5),
        baseX: xOff,
        baseY: yPos,
        baseZ: zOff,
      });
    }

    this.skyStarEntries = [];
    for (let i = 0; i < SKY_STAR_COUNT; i += 1) {
      const sm = new pc.StandardMaterial();
      sm.diffuse.set(0, 0, 0);
      const pick = this.rng.range(0, 1);
      sm.emissive =
        pick < 0.34
          ? this.#colorFromHex(this.theme.palette.accentLightA ?? 0xff5bb7)
          : pick < 0.67
            ? this.#colorFromHex(this.theme.palette.accentLightB ?? 0x51d9ff)
            : this.#colorFromHex(this.theme.palette.particleColor ?? 0xffd9ee);
      const eb = this.rng.range(0.85, 2.4);
      sm.emissiveIntensity = eb;
      sm.useLighting = false;
      sm.depthWrite = false;
      sm.blendType = pc.BLEND_ADDITIVE;
      sm.opacity = 0.35 + this.rng.range(0, 0.45);
      sm.update();
      const star = new pc.Entity(`skyStar_${i}`);
      star.addComponent("render", { type: "box" });
      star.render.material = sm;
      star.render.layers = [pc.LAYERID_SKYBOX];
      star.render.castShadows = false;
      star.render.receiveShadows = false;
      const sc = this.rng.range(0.04, 0.14);
      star.setLocalScale(sc, sc, sc);
      const u = this.rng.range(0, 1);
      const v = this.rng.range(0.22, 0.88);
      const theta = u * Math.PI * 2;
      const phi = v * Math.PI * 0.72;
      const rad = 155 + this.rng.range(0, 35);
      star.setLocalPosition(
        Math.sin(phi) * Math.cos(theta) * rad,
        Math.cos(phi) * rad * 0.82 + this.rng.range(-2, 8),
        Math.sin(phi) * Math.sin(theta) * rad
      );
      this.skyRoot.addChild(star);
      this.skyStarEntries.push({ mat: sm, baseEmissive: eb, moodMul: 1 });
    }
  }

  #syncCinematicSkyToCamera(state) {
    if (!this.skyRoot) return;
    const p = state.position;
    const la = state.lookAt;
    const t = performance.now() * 0.00006;
    this.skyRoot.setPosition(p.x * 0.11 + la.x * 0.07, p.y * 0.14 + 4.2, p.z);
    this.skyRoot.setEulerAngles(
      Math.sin(t) * 3.2 + Math.sin(t * 0.31) * 1.1,
      t * 11.5 + Math.cos(t * 0.17) * 4,
      Math.cos(t * 0.43) * 1.8
    );
  }

  #tickCinematicSky(dt) {
    if (!this.skyRoot) return;
    this._skyPhase += dt;
    if (this.megaRing) {
      this.megaRing.rotateLocal(0, 11 * dt, 0);
    }
    if (this.auroraStrips?.length) {
      for (const s of this.auroraStrips) {
        const w = Math.sin(this._skyPhase * s.speed + s.phase) * s.amp;
        s.entity.setLocalPosition(s.baseX + w * 0.35, s.baseY, s.baseZ + w * 0.12);
        const op = s.baseOpacity + Math.sin(this._skyPhase * 1.4 + s.phase) * 0.06;
        s.mat.opacity = Math.max(0.08, Math.min(0.55, op));
        s.mat.update();
      }
    }
    if (this.skyStarEntries?.length) {
      let i = 0;
      for (const entry of this.skyStarEntries) {
        const base = entry.baseEmissive;
        const mood = entry.moodMul ?? 1;
        entry.mat.emissiveIntensity =
          base *
          mood *
          (0.72 + 0.42 * Math.sin(this._skyPhase * (2.1 + (i % 5) * 0.35) + i));
        entry.mat.update();
        i += 1;
      }
    }
  }

  #standardMaterial({
    color = 0xffffff,
    emissive,
    emissiveIntensity = 0,
    metalness = 0,
    gloss = 0.5,
    clearCoat = 0,
    clearCoatGloss = 0.85,
    opacity = 1,
    blendType = pc.BLEND_NONE,
  }) {
    const mat = new pc.StandardMaterial();
    mat.diffuse = this.#colorFromHex(color);
    if (emissive != null) {
      mat.emissive = this.#colorFromHex(emissive);
      mat.emissiveIntensity = emissiveIntensity;
    }
    mat.useMetalness = true;
    mat.metalness = metalness;
    mat.gloss = gloss;
    if (clearCoat > 0) {
      mat.clearCoat = clearCoat;
      mat.clearCoatGloss = clearCoatGloss;
    }
    if (opacity < 1 || blendType !== pc.BLEND_NONE) {
      mat.blendType = blendType;
      mat.opacity = opacity;
    }
    mat.update();
    return mat;
  }

  #colorFromHex(hex) {
    const r = ((hex >> 16) & 0xff) / 255;
    const g = ((hex >> 8) & 0xff) / 255;
    const b = (hex & 0xff) / 255;
    return new pc.Color(r, g, b);
  }

  #mixColors(a, b, t) {
    return new pc.Color(
      a.r + (b.r - a.r) * t,
      a.g + (b.g - a.g) * t,
      a.b + (b.b - a.b) * t
    );
  }
}
