const THEMES = {
  retroNeon: {
    palette: {
      sceneBackground: 0x050510,
      fogColor: 0x0e101f,
      groundColor: 0x14101c,
      laneLightColor: 0xff5bb7,
      laneGhostColor: 0x51d9ff,
      playerColor: 0xfff1c7,
      playerEmissive: 0xad4b8f,
      obstacleBaseColor: 0x7fcbff,
      obstacleAccentColor: 0xff7db6,
      particleColor: 0xffd9ee,
      accentLightA: 0xff5bb7,
      accentLightB: 0x51d9ff,
      // Soft "light" palette targets (used during 15s palette fade)
      lightSceneBackground: 0xc0cad6,
      lightFogColor: 0xc2cad6,
      lightGroundColor: 0xd6c8a4,
      lightObstacleBase: 0xc8a878,
      lightObstacleAccent: 0xb8d8a8,
      lightAmbient: 0xd0c0a0,
      // Dedicated boost pad colors (kept stable across palette fade)
      boostBaseColor: 0xfff066,
      boostAccentColor: 0xffaa1f,
      boostGlowColor: 0xfff8b0,
    },
    emissive: {
      playerBase: 0.33,
      obstacleBase: 0.2,
      laneBase: 0.16,
      pulseBoost: 0.44,
    },
    fog: {
      near: 26,
      far: 220,
      pulseFarOffset: 0,
    },
    uiMotion: {
      panelDriftSeconds: 7.5,
      pulseSeconds: 5.5,
      fadeSeconds: 0.32,
      hudOpacityBase: 0.7,
      hudOpacityBoost: 0.24,
    },
    geometry: {
      obstacleScaleMin: 0.9,
      obstacleScaleMax: 1.35,
      laneGhostCount: 3,
    },
  },
  dreamcore: {
    palette: {
      sceneBackground: 0x050816,
      fogColor: 0x0e1428,
      groundColor: 0x1a2138,
      laneLightColor: 0x7c8cff,
      laneGhostColor: 0xbab7ff,
      playerColor: 0xd7ffe8,
      playerEmissive: 0x406e77,
      obstacleBaseColor: 0xc6c1ff,
      obstacleAccentColor: 0x87ffe0,
      particleColor: 0xe5dcff,
    },
    emissive: {
      playerBase: 0.4,
      obstacleBase: 0.22,
      laneBase: 0.18,
      pulseBoost: 0.5,
    },
    fog: {
      near: 24,
      far: 148,
      pulseFarOffset: -10,
    },
    uiMotion: {
      panelDriftSeconds: 8,
      pulseSeconds: 6,
      fadeSeconds: 0.4,
      hudOpacityBase: 0.66,
      hudOpacityBoost: 0.28,
    },
    geometry: {
      obstacleScaleMin: 0.85,
      obstacleScaleMax: 1.45,
      laneGhostCount: 3,
    },
  },
  brutalist: {
    palette: {
      sceneBackground: 0x080810,
      fogColor: 0x14141f,
      groundColor: 0x23232a,
      laneLightColor: 0xfefefe,
      laneGhostColor: 0xa6a6b0,
      playerColor: 0xd7ffe8,
      playerEmissive: 0x33574f,
      obstacleBaseColor: 0xff6767,
      obstacleAccentColor: 0xfff07d,
      particleColor: 0xf3f3f7,
    },
    emissive: { playerBase: 0.24, obstacleBase: 0.16, laneBase: 0.1, pulseBoost: 0.34 },
    fog: { near: 30, far: 132, pulseFarOffset: -5 },
    uiMotion: { panelDriftSeconds: 7, pulseSeconds: 5, fadeSeconds: 0.25, hudOpacityBase: 0.74, hudOpacityBoost: 0.2 },
    geometry: { obstacleScaleMin: 0.9, obstacleScaleMax: 1.2, laneGhostCount: 2 },
  },
  retroTerminal: {
    palette: {
      sceneBackground: 0x03080e,
      fogColor: 0x0c1a18,
      groundColor: 0x173126,
      laneLightColor: 0x5eff8d,
      laneGhostColor: 0x92ffc0,
      playerColor: 0xb4ffd0,
      playerEmissive: 0x15542f,
      obstacleBaseColor: 0xb8ff7c,
      obstacleAccentColor: 0x5eff8d,
      particleColor: 0xd0ffe1,
    },
    emissive: { playerBase: 0.3, obstacleBase: 0.2, laneBase: 0.16, pulseBoost: 0.28 },
    fog: { near: 26, far: 138, pulseFarOffset: -8 },
    uiMotion: { panelDriftSeconds: 6, pulseSeconds: 4, fadeSeconds: 0.22, hudOpacityBase: 0.7, hudOpacityBoost: 0.2 },
    geometry: { obstacleScaleMin: 0.85, obstacleScaleMax: 1.35, laneGhostCount: 3 },
  },
};

export const ACTIVE_THEME = "retroNeon";

export function getTheme(name = ACTIVE_THEME) {
  return THEMES[name] ?? THEMES.retroNeon;
}
