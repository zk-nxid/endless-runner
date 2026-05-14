import { DEFAULT_SKIN_ID, SKIN_CATALOG, getSkin } from "../core/skins.js";
import {
  DEFAULT_TRAIL_ID,
  TRAIL_CATALOG,
  getTrail,
} from "../core/trails.js";

const COINS_KEY = "nr.coins";
const OWNED_KEY = "nr.skinsOwned";
const EQUIPPED_KEY = "nr.skinEquipped";
const OWNED_TRAILS_KEY = "nr.trailsOwned";
const EQUIPPED_TRAIL_KEY = "nr.trailEquipped";

function safeRead(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw;
  } catch {
    return fallback;
  }
}

function safeWrite(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore quota / privacy mode failures
  }
}

export class ShopAdapter {
  constructor() {
    const coinsRaw = Number(safeRead(COINS_KEY, "0"));
    this.coins = Number.isFinite(coinsRaw) ? Math.max(0, Math.floor(coinsRaw)) : 0;

    let owned;
    try {
      const parsed = JSON.parse(safeRead(OWNED_KEY, "null"));
      owned = Array.isArray(parsed) ? parsed : null;
    } catch {
      owned = null;
    }
    const validIds = new Set(SKIN_CATALOG.map((s) => s.id));
    this.owned = new Set(
      (owned ?? [DEFAULT_SKIN_ID]).filter((id) => validIds.has(id))
    );
    this.owned.add(DEFAULT_SKIN_ID);

    const equippedRaw = safeRead(EQUIPPED_KEY, DEFAULT_SKIN_ID);
    this.equipped = this.owned.has(equippedRaw) ? equippedRaw : DEFAULT_SKIN_ID;

    let trailsOwnedList;
    try {
      const parsed = JSON.parse(safeRead(OWNED_TRAILS_KEY, "null"));
      trailsOwnedList = Array.isArray(parsed) ? parsed : null;
    } catch {
      trailsOwnedList = null;
    }
    const validTrailIds = new Set(TRAIL_CATALOG.map((t) => t.id));
    this.trailsOwned = new Set(
      (trailsOwnedList ?? [DEFAULT_TRAIL_ID]).filter(
        (id) => typeof id === "string" && validTrailIds.has(id)
      )
    );
    this.trailsOwned.add(DEFAULT_TRAIL_ID);

    const trailEqRaw = safeRead(EQUIPPED_TRAIL_KEY, DEFAULT_TRAIL_ID);
    this.trailEquipped = this.trailsOwned.has(trailEqRaw)
      ? trailEqRaw
      : DEFAULT_TRAIL_ID;

    this.#persist();
  }

  #persist() {
    safeWrite(COINS_KEY, String(this.coins));
    safeWrite(OWNED_KEY, JSON.stringify(Array.from(this.owned)));
    safeWrite(EQUIPPED_KEY, this.equipped);
    safeWrite(OWNED_TRAILS_KEY, JSON.stringify(Array.from(this.trailsOwned)));
    safeWrite(EQUIPPED_TRAIL_KEY, this.trailEquipped);
  }

  getCoins() {
    return this.coins;
  }

  addCoins(amount) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    this.coins += Math.floor(amount);
    this.#persist();
  }

  spendCoins(amount) {
    if (this.coins < amount) return false;
    this.coins -= amount;
    this.#persist();
    return true;
  }

  getOwned() {
    return Array.from(this.owned);
  }

  isOwned(id) {
    return this.owned.has(id);
  }

  buy(id) {
    const skin = getSkin(id);
    if (!skin) return { ok: false, reason: "unknown" };
    if (this.owned.has(id)) return { ok: false, reason: "already-owned" };
    if (this.coins < skin.cost) return { ok: false, reason: "insufficient" };
    this.coins -= skin.cost;
    this.owned.add(id);
    this.equipped = id;
    this.#persist();
    return { ok: true };
  }

  getEquipped() {
    return this.equipped;
  }

  equip(id) {
    if (!this.owned.has(id)) return false;
    this.equipped = id;
    this.#persist();
    return true;
  }

  getOwnedTrails() {
    return Array.from(this.trailsOwned);
  }

  isTrailOwned(id) {
    return this.trailsOwned.has(id);
  }

  buyTrail(id) {
    const trail = getTrail(id);
    if (!trail) return { ok: false, reason: "unknown" };
    if (trail.id === DEFAULT_TRAIL_ID) return { ok: false, reason: "already-owned" };
    if (this.trailsOwned.has(id)) return { ok: false, reason: "already-owned" };
    if (this.coins < trail.cost) return { ok: false, reason: "insufficient" };
    this.coins -= trail.cost;
    this.trailsOwned.add(id);
    this.trailEquipped = id;
    this.#persist();
    return { ok: true };
  }

  getEquippedTrail() {
    return this.trailEquipped;
  }

  equipTrail(id) {
    if (!this.trailsOwned.has(id)) return false;
    this.trailEquipped = id;
    this.#persist();
    return true;
  }

  /**
   * Replace progress from a saved snapshot; validates against catalogs,
   * always keeps defaults owned, persists to localStorage.
   */
  loadSnapshot({
    coins,
    ownedIds,
    equippedId,
    trailsOwnedIds,
    trailEquippedId,
  }) {
    const validIds = new Set(SKIN_CATALOG.map((s) => s.id));
    const coinsN = Number.isFinite(coins) ? Math.max(0, Math.floor(coins)) : 0;
    const list = Array.isArray(ownedIds) ? ownedIds : [];
    this.coins = coinsN;
    this.owned = new Set(list.filter((id) => typeof id === "string" && validIds.has(id)));
    this.owned.add(DEFAULT_SKIN_ID);
    const eq =
      typeof equippedId === "string" && validIds.has(equippedId) && this.owned.has(equippedId)
        ? equippedId
        : DEFAULT_SKIN_ID;
    this.equipped = eq;

    const validTrailIds = new Set(TRAIL_CATALOG.map((t) => t.id));
    const tlist = Array.isArray(trailsOwnedIds) ? trailsOwnedIds : [];
    this.trailsOwned = new Set(
      tlist.filter((id) => typeof id === "string" && validTrailIds.has(id))
    );
    this.trailsOwned.add(DEFAULT_TRAIL_ID);
    const teq =
      typeof trailEquippedId === "string" &&
      validTrailIds.has(trailEquippedId) &&
      this.trailsOwned.has(trailEquippedId)
        ? trailEquippedId
        : DEFAULT_TRAIL_ID;
    this.trailEquipped = teq;

    this.#persist();
  }
}
