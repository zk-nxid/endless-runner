// Catalog of player ball skins. Solid skins share SKIN_COST; patterned skins cost more.

export const SKIN_COST = 50;
export const PATTERN_SKIN_COST = 75;
export const DEFAULT_SKIN_ID = "pink";

export const SKIN_CATALOG = [
  { id: "pink", label: "Neon Pink", color: 0xff5bb7, cost: 0 },
  { id: "black", label: "Void", color: 0x141420, cost: SKIN_COST },
  { id: "blue", label: "Cobalt", color: 0x4a7dff, cost: SKIN_COST },
  { id: "red", label: "Crimson", color: 0xff3f5a, cost: SKIN_COST },
  { id: "green", label: "Acid", color: 0x4dff8c, cost: SKIN_COST },

  {
    id: "pattern_checker",
    label: "Grid Check",
    color: 0xff5ecb,
    accent: 0x2b1a52,
    pattern: "checker",
    cost: PATTERN_SKIN_COST,
  },
  {
    id: "pattern_stripe",
    label: "Velocity Stripe",
    color: 0x5eecff,
    accent: 0x140c28,
    pattern: "diagonalStripe",
    cost: PATTERN_SKIN_COST,
  },
  {
    id: "pattern_dots",
    label: "Spot Matrix",
    color: 0xffe873,
    accent: 0x400850,
    pattern: "dots",
    cost: PATTERN_SKIN_COST,
  },
  {
    id: "pattern_rings",
    label: "Pulse Rings",
    color: 0xb78cff,
    accent: 0x0c0618,
    pattern: "rings",
    cost: PATTERN_SKIN_COST,
  },
];

export function getSkin(id) {
  return SKIN_CATALOG.find((s) => s.id === id) ?? SKIN_CATALOG[0];
}
