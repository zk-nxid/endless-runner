export const GAME_STATES = {
  MENU: "menu",
  PLAYING: "playing",
  END: "end",
};

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
    followHeight: 4.8,
    followDistance: 8.5,
    damping: 10,
    fov: 67,
  },
  mood: {
    speedWeight: 0.045,
    stateTransitionBoost: 0.22,
    falloffPerSecond: 0.55,
  },
  jump: {
    velocity: 8.6,
    gravity: 24,
  },
  boost: {
    durationSeconds: 2.4,
    speedMultiplier: 0.5,
  },
};
