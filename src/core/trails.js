/** Cosmetic motion trails (shop). Default is invisible; paid trails share TRAIL_COST. */

export const TRAIL_COST = 75;
export const DEFAULT_TRAIL_ID = "none";

export const TRAIL_CATALOG = [
  {
    id: "none",
    label: "Off",
    primaryColor: 0x888888,
    secondaryColor: null,
    cost: 0,
    sampleSpacing: 0.12,
    maxPoints: 48,
  },
  {
    id: "trail_cyan",
    label: "Ion Stream",
    primaryColor: 0x5eecff,
    secondaryColor: 0x4a7dff,
    cost: TRAIL_COST,
    sampleSpacing: 0.055,
    maxPoints: 58,
  },
  {
    id: "trail_magenta",
    label: "Plasma Wake",
    primaryColor: 0xff5bb7,
    secondaryColor: 0xb78cff,
    cost: TRAIL_COST,
    sampleSpacing: 0.052,
    maxPoints: 62,
  },
  {
    id: "trail_gold",
    label: "Solar Flare",
    primaryColor: 0xffe873,
    secondaryColor: 0xff8c42,
    cost: TRAIL_COST,
    sampleSpacing: 0.06,
    maxPoints: 54,
  },
  {
    id: "trail_green",
    label: "Acid Burn",
    primaryColor: 0x4dff8c,
    secondaryColor: 0x00c985,
    cost: TRAIL_COST,
    sampleSpacing: 0.055,
    maxPoints: 56,
  },
  {
    id: "trail_crimson",
    label: "Ruby Rush",
    primaryColor: 0xff3366,
    secondaryColor: 0xff0044,
    cost: TRAIL_COST,
    sampleSpacing: 0.056,
    maxPoints: 56,
  },
  {
    id: "trail_violet",
    label: "Void Violet",
    primaryColor: 0xb366ff,
    secondaryColor: 0x6b2fff,
    cost: TRAIL_COST,
    sampleSpacing: 0.054,
    maxPoints: 60,
  },
  {
    id: "trail_arctic",
    label: "Arctic Beam",
    primaryColor: 0xe8ffff,
    secondaryColor: 0x88ddff,
    cost: TRAIL_COST,
    sampleSpacing: 0.058,
    maxPoints: 52,
  },
  {
    id: "trail_lava",
    label: "Molten Core",
    primaryColor: 0xff6600,
    secondaryColor: 0xff3300,
    cost: TRAIL_COST,
    sampleSpacing: 0.057,
    maxPoints: 55,
  },
  {
    id: "trail_lime",
    label: "Toxic Lime",
    primaryColor: 0xccff00,
    secondaryColor: 0x88ff44,
    cost: TRAIL_COST,
    sampleSpacing: 0.055,
    maxPoints: 56,
  },
  {
    id: "trail_coral",
    label: "Reef Pulse",
    primaryColor: 0xff7ab8,
    secondaryColor: 0xffb347,
    cost: TRAIL_COST,
    sampleSpacing: 0.054,
    maxPoints: 58,
  },
  {
    id: "trail_mono",
    label: "Ghost Wire",
    primaryColor: 0xffffff,
    secondaryColor: 0xaabbcc,
    cost: TRAIL_COST,
    sampleSpacing: 0.056,
    maxPoints: 54,
  },
];

export function getTrail(id) {
  return TRAIL_CATALOG.find((t) => t.id === id) ?? TRAIL_CATALOG[0];
}
