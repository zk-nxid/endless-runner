export const GAME_STATES = {
  MENU: "menu",
  PLAYING: "playing",
  END: "end",
};

/** Display name used in menus, HUD copy, docs, and error strings. */
export const GAME_TITLE = "ORBS Runner";

/** Persisted via localStorage alongside other `nr.*` keys */
export const HIGH_SCORE_STORAGE_KEY = "nr.highScore";

export const CONFIG = {
  laneCount: 3,
  laneWidth: 2.2,
  playerRadius: 0.45,
  playerHalfHeight: 0.6,
  playerBaseY: 0.6,
  fixedDeltaSeconds: 1 / 60,
  maxSubSteps: 8,
  baseForwardSpeed: 10,
  speedRampPerSecond: 0.18,
  speedRampAcceleration: 0.014,
  obstaclePoolSize: 40,
  spawnMinDistance: 12,
  spawnMaxDistance: 24,
  camera: {
    followHeight: 5.1,
    followDistance: 9.2,
    damping: 9,
    fov: 61,
  },
  mood: {
    speedWeight: 0.045,
    stateTransitionBoost: 0.22,
    falloffPerSecond: 0.55,
  },
  /**
   * Periodically shift all world Z by +worldZRebaseSnap once body.z passes this
   * (player runs in -Z). Avoids float32 precision loss and black sky/glitches
   * on long runs (very high score).
   */
  worldZRebaseThreshold: -2000,
  worldZRebaseSnap: 2200,
  jump: {
    velocity: 8.6,
    gravity: 24,
  },
  boost: {
    durationSeconds: 2.4,
    speedMultiplier: 0.5,
  },
};

CONFIG.runwayStripWidth =
  (CONFIG.laneCount - 1) * CONFIG.laneWidth + CONFIG.laneWidth * 0.38;