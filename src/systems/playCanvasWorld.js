import * as pc from "playcanvas";
import { CONFIG } from "../core/constants.js";

export const OBSTACLE_PROFILES = [
  { type: "luggage", colliderHeight: 1.2, unjumpable: false },
  { type: "keycardPillar", colliderHeight: 1.35, unjumpable: false },
  { type: "neonArch", colliderHeight: 1.15, unjumpable: false },
  { type: "tower", colliderHeight: 3.4, unjumpable: true },
  { type: "speedPad", colliderHeight: 0.02, unjumpable: false, isBoost: true },
];

const SKYLINE_COUNT = 16;
const SKYLINE_SPACING = 26;
const SKYLINE_LOOP_DISTANCE = SKYLINE_COUNT * SKYLINE_SPACING;

const VOID_RAIN_COUNT = 40;

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
    this.app.start();
    this.app.on("update", (dt) => {
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

    const skylineOpacity = 0.28 + intensity * 0.32;
    this.skylineBodyMaterial.opacity = skylineOpacity;
    this.skylineBodyMaterial.update();
    this.skylineCrownMaterial.opacity = 0.2 + intensity * 0.4;
    this.skylineCrownMaterial.update();
    this.skylineWindowMaterial.opacity = 0.32 + intensity * 0.46;
    this.skylineWindowMaterial.update();

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
      const baseOpacity = 0.1 + intensity * 0.12 + paletteShift * 0.05;
      const emissiveInt = 0.52 + intensity * 0.34 + paletteShift * 0.14;
      this.voidRain.forEach((entry) => {
        entry.material.opacity = Math.min(0.28, baseOpacity);
        entry.material.emissiveIntensity = emissiveInt;
        entry.material.update();
      });
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
    this.skylineTowers.forEach((entry) => {
      if (entry.entity.getPosition().z > bodyZ + 12) {
        const p = entry.entity.getPosition();
        entry.entity.setPosition(p.x, p.y, p.z - SKYLINE_LOOP_DISTANCE);
      }
      const p = entry.entity.getPosition();
      const sway = Math.sin(bodyZ * 0.03 + entry.swayPhase) * 0.06;
      entry.entity.setEulerAngles(0, entry.baseYaw, sway * 57.2957795);
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
    ambient.r *= 0.55;
    ambient.g *= 0.55;
    ambient.b *= 0.55;
    this.app.scene.ambientLight = ambient;

    if (typeof pc.TONEMAP_ACES !== "undefined") {
      this.app.scene.toneMapping = pc.TONEMAP_ACES;
    } else if (typeof pc.TONEMAP_FILMIC !== "undefined") {
      this.app.scene.toneMapping = pc.TONEMAP_FILMIC;
    }
    if (this.app.scene.exposure !== undefined) {
      this.app.scene.exposure = 0.95;
    }
    if (this.app.scene.skyboxIntensity !== undefined) {
      this.app.scene.skyboxIntensity = 0.9;
    }
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
    this.dirLight.addComponent("light", {
      type: "directional",
      color: this.#colorFromHex(this.theme.palette.accentLightB ?? 0xc2d4ff),
      intensity: 1.15,
    });
    this.dirLight.setEulerAngles(55, 30, 0);
    this.app.root.addChild(this.dirLight);
  }

  #buildStaticWorld() {
    const groundMat = this.#standardMaterial({
      color: this.theme.palette.groundColor,
      metalness: 0.12,
      gloss: 0.08,
    });
    this.groundMaterial = groundMat;
    this.ground = new pc.Entity("ground");
    this.ground.addComponent("render", { type: "plane" });
    this.ground.render.material = groundMat;
    this.ground.setLocalScale(30, 1, 700);
    this.ground.setPosition(0, 0, this.trackCenterOffsetZ);
    this.app.root.addChild(this.ground);

    this.#buildLaneLights();
    this.#buildSkyline();
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

  #buildSkyline() {
    this.skylineTowers = [];
    this.skylineBodyMaterial = this.#standardMaterial({
      color: 0x2c1f38,
      emissive: 0x2c1f38,
      emissiveIntensity: 0.05,
      opacity: 0.6,
      blendType: pc.BLEND_NORMAL,
    });
    this.skylineCrownMaterial = this.#standardMaterial({
      color: 0x000000,
      emissive: this.theme.palette.accentLightA ?? this.theme.palette.laneLightColor,
      emissiveIntensity: 1.0,
      opacity: 0.45,
      blendType: pc.BLEND_NORMAL,
    });
    this.skylineWindowMaterial = this.#standardMaterial({
      color: 0x000000,
      emissive: this.theme.palette.accentLightB ?? this.theme.palette.laneGhostColor,
      emissiveIntensity: 1.0,
      opacity: 0.55,
      blendType: pc.BLEND_NORMAL,
    });
    this.skylineTrimMaterial = this.#standardMaterial({
      color: 0x000000,
      emissive: this.theme.palette.accentLightA ?? this.theme.palette.laneLightColor,
      emissiveIntensity: 0.7,
      opacity: 0.55,
      blendType: pc.BLEND_NORMAL,
    });

    for (let i = 0; i < SKYLINE_COUNT; i += 1) {
      const width = this.rng.range(1.7, 3.3);
      const height = this.rng.range(2.8, 6.5);
      const side = i % 2 === 0 ? -1 : 1;
      const xOffset = side * this.rng.range(6.2, 11.2);
      const yOffset = this.rng.range(2.6, 5.8);
      const z = -40 - i * SKYLINE_SPACING;
      const baseYaw = side > 0 ? -11 : 11;
      const swayPhase = this.rng.range(0, Math.PI * 2);

      const tower = new pc.Entity("skylineTower");
      tower.setPosition(xOffset, yOffset, z);
      tower.setEulerAngles(0, baseYaw, 0);

      const body = new pc.Entity("body");
      body.addComponent("render", { type: "box" });
      body.render.material = this.skylineBodyMaterial;
      body.setLocalScale(width, height, 0.2);
      tower.addChild(body);

      const crown = new pc.Entity("crown");
      crown.addComponent("render", { type: "box" });
      crown.render.material = this.skylineCrownMaterial;
      crown.setLocalScale(width * 0.72, 0.26, 0.16);
      crown.setLocalPosition(0, height * 0.5 + 0.16, 0);
      tower.addChild(crown);

      // Neon edge trim strips - vertical glow on tower corners
      for (const xSign of [-1, 1]) {
        const trim = new pc.Entity("trim");
        trim.addComponent("render", { type: "box" });
        trim.render.material = this.skylineTrimMaterial;
        trim.setLocalScale(0.04, height * 0.95, 0.04);
        trim.setLocalPosition(xSign * (width * 0.5 - 0.02), 0, 0.13);
        tower.addChild(trim);
      }
      const topTrim = new pc.Entity("topTrim");
      topTrim.addComponent("render", { type: "box" });
      topTrim.render.material = this.skylineTrimMaterial;
      topTrim.setLocalScale(width * 0.92, 0.05, 0.04);
      topTrim.setLocalPosition(0, height * 0.5 - 0.04, 0.13);
      tower.addChild(topTrim);

      const windowRows = 3;
      const windowCols = 2;
      for (let row = 0; row < windowRows; row += 1) {
        for (let col = 0; col < windowCols; col += 1) {
          const w = new pc.Entity("window");
          w.addComponent("render", { type: "box" });
          w.render.material = this.skylineWindowMaterial;
          w.setLocalScale(0.2, 0.26, 0.04);
          w.setLocalPosition(
            -0.35 + col * 0.7,
            -height * 0.3 + row * (height / (windowRows + 1)),
            0.13
          );
          tower.addChild(w);
        }
      }

      this.app.root.addChild(tower);
      this.skylineTowers.push({ entity: tower, baseYaw, swayPhase });
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

  #buildVoidRain() {
    this.voidRain = [];
    const palette = this.theme.palette;
    const colors = [
      palette.accentLightA ?? 0xff5bb7,
      palette.accentLightB ?? 0x51d9ff,
      palette.particleColor ?? 0xffd9ee,
    ];
    const bodyZ = this._trackBodyZ;
    for (let i = 0; i < VOID_RAIN_COUNT; i += 1) {
      const colorHex = colors[i % colors.length];
      const mat = this.#standardMaterial({
        color: 0x000000,
        emissive: colorHex,
        emissiveIntensity: 0.65,
        opacity: 0.14,
        blendType: pc.BLEND_ADDITIVE,
      });
      const streak = new pc.Entity("voidRainStreak");
      streak.addComponent("render", { type: "box" });
      streak.render.material = mat;
      const w = this.rng.range(0.04, 0.09);
      const h = this.rng.range(0.55, 1.35);
      const d = this.rng.range(0.04, 0.08);
      streak.setLocalScale(w, h, d);
      const x = this.rng.range(-34, 34);
      const z = bodyZ - this.rng.range(40, 200);
      const y = this.rng.range(18, 46);
      streak.setPosition(x, y, z);
      this.app.root.addChild(streak);
      this.voidRain.push({
        entity: streak,
        material: mat,
        fallSpeed: this.rng.range(2.2, 5.8),
        phase: this.rng.range(0, Math.PI * 2),
      });
    }
  }

  #tickVoidRain(dt) {
    if (!this.voidRain?.length) return;
    const bodyZ = this._trackBodyZ;
    const t = performance.now() * 0.001;
    const behindZ = bodyZ + 14;
    const floorY = -2;
    for (const entry of this.voidRain) {
      const e = entry.entity;
      const p = e.getPosition();
      let y = p.y - entry.fallSpeed * dt;
      let x = p.x + Math.sin(t * 0.35 + entry.phase) * 0.022 * dt;
      let z = p.z;
      if (y < floorY || z > behindZ) {
        y = this.rng.range(20, 48);
        x = this.rng.range(-36, 36);
        z = bodyZ - this.rng.range(45, 200);
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
        metalness: isBoost ? 0.1 : 0.34,
        gloss: isBoost ? 0.85 : 0.48,
      });
      const accentMat = this.#standardMaterial({
        color: accentHex,
        emissive: accentHex,
        emissiveIntensity: isBoost ? 0.85 : this.theme.emissive.obstacleBase * 0.85,
        metalness: isBoost ? 0.1 : 0.38,
        gloss: isBoost ? 0.9 : 0.58,
      });
      const glowMat = this.#standardMaterial({
        color: glowHex,
        emissive: glowHex,
        emissiveIntensity: isBoost ? 1.0 : this.theme.emissive.obstacleBase * 1.15,
        metalness: 0.22,
        gloss: isBoost ? 0.95 : 0.7,
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

  #standardMaterial({ color = 0xffffff, emissive, emissiveIntensity = 0, metalness = 0, gloss = 0.5, opacity = 1, blendType = pc.BLEND_NONE }) {
    const mat = new pc.StandardMaterial();
    mat.diffuse = this.#colorFromHex(color);
    if (emissive != null) {
      mat.emissive = this.#colorFromHex(emissive);
      mat.emissiveIntensity = emissiveIntensity;
    }
    mat.useMetalness = true;
    mat.metalness = metalness;
    mat.gloss = gloss;
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
