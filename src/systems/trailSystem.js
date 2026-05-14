import * as THREE from "three";
import { DEFAULT_TRAIL_ID, getTrail } from "../core/trails.js";

/** LineBasicMaterial multiplies `color` by vertex colors — keep white so palette reads correctly. */
const MATERIAL_WHITE = 0xffffff;

/** Never sample sparser than this (world units); keeps the ribbon continuous at speed. */
const MAX_SAMPLE_SPACING = 0.036;

/** Screen-space diameter hint for soft dots (tiny — ball ~0.65 radius; bloom enlarges glow). */
const DEFAULT_POINT_SIZE_PX = 2.4;

/** One shared radial gradient; keeps particles round instead of GL squares. */
let softDotTexture = null;

function getSoftDotTexture() {
  if (softDotTexture) return softDotTexture;
  const d = 64;
  const c = document.createElement("canvas");
  c.width = d;
  c.height = d;
  const ctx = c.getContext("2d");
  const cx = d / 2;
  const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx * 0.98);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.42, "rgba(255,255,255,0.45)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, d, d);
  softDotTexture = new THREE.CanvasTexture(c);
  softDotTexture.colorSpace = THREE.SRGBColorSpace;
  return softDotTexture;
}

/**
 * Neon ribbon: classic `THREE.Line` + matching `THREE.Points` (same geometry attributes).
 * Avoids Line2 resolution/world quirks; fixes first-frame sampling so the path starts immediately.
 */
export class TrailSystem {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    /** @type {string} */
    this.equippedId = DEFAULT_TRAIL_ID;

    /** @type {THREE.Line | null} */
    this.line = null;
    /** @type {THREE.LineBasicMaterial | null} */
    this.lineMaterial = null;

    /** @type {THREE.Points | null} */
    this.points = null;
    /** @type {THREE.PointsMaterial | null} */
    this.pointsMaterial = null;

    /** @type {THREE.BufferGeometry | null} */
    this.geometry = null;

    /** @type {THREE.Vector3[]} */
    this._points = [];
    /** @type {THREE.Vector3 | null} */
    this._lastSample = null;
    this._maxPoints = 48;
    this._sampleSpacing = 0.08;

    this._scratch = new THREE.Vector3();
    this._runActive = false;

    this._cA = new THREE.Color();
    this._cB = new THREE.Color();
    this._cMix = new THREE.Color();
  }

  setEquippedTrailId(id) {
    const next = typeof id === "string" ? id : DEFAULT_TRAIL_ID;
    if (next !== this.equippedId) {
      this.equippedId = next;
      this.clearPath();
    }
    this.#ensureMeshesForTrail();
  }

  clearPath() {
    this._points.length = 0;
    this._lastSample = null;
    this.#syncGeometry();
  }

  setRunActive(active) {
    if (!active) {
      this._runActive = false;
      this.clearPath();
      if (this.line) this.line.visible = false;
      if (this.points) this.points.visible = false;
      return;
    }
    this._runActive = true;
  }

  pushSample(x, y, z) {
    if (!this._runActive) return;
    const trail = getTrail(this.equippedId);
    if (trail.id === DEFAULT_TRAIL_ID) {
      if (this.line) this.line.visible = false;
      if (this.points) this.points.visible = false;
      return;
    }

    this._maxPoints = trail.maxPoints ?? 48;
    const catalogSpacing = trail.sampleSpacing ?? 0.07;
    this._sampleSpacing = Math.min(catalogSpacing, MAX_SAMPLE_SPACING);

    const v = this._scratch.set(x, y, z);
    const spacingSq = this._sampleSpacing * this._sampleSpacing;

    const isFirst = !this._lastSample;
    if (!isFirst && this._lastSample.distanceToSquared(v) < spacingSq) {
      return;
    }

    if (!this._lastSample) {
      this._lastSample = new THREE.Vector3(x, y, z);
    } else {
      this._lastSample.copy(v);
    }

    this._points.push(new THREE.Vector3(x, y, z));
    while (this._points.length > this._maxPoints) {
      this._points.shift();
    }

    this.#ensureMeshesForTrail();
    if (this.line) this.line.visible = this._points.length >= 2;
    if (this.points) this.points.visible = this._points.length >= 1;

    this.#syncGeometry();
  }

  dispose() {
    this.#disposeMeshes();
    this._points.length = 0;
    this._lastSample = null;
  }

  #disposeMeshes() {
    if (this.line) {
      this.scene.remove(this.line);
      this.line = null;
    }
    if (this.points) {
      this.scene.remove(this.points);
      this.points = null;
    }
    this.lineMaterial?.dispose();
    this.pointsMaterial?.dispose();
    // shared `softDotTexture` — do not dispose here
    this.lineMaterial = null;
    this.pointsMaterial = null;
    this.geometry?.dispose();
    this.geometry = null;
  }

  #ensureMeshesForTrail() {
    const trail = getTrail(this.equippedId);
    if (trail.id === DEFAULT_TRAIL_ID) {
      if (this.line) this.line.visible = false;
      if (this.points) this.points.visible = false;
      return;
    }

    if (this.geometry && this.line && this.points && this.lineMaterial && this.pointsMaterial) {
      this.pointsMaterial.size = trail.pointSizePx ?? DEFAULT_POINT_SIZE_PX;
      return;
    }

    this.#disposeMeshes();

    this.geometry = new THREE.BufferGeometry();

    this.lineMaterial = new THREE.LineBasicMaterial({
      color: MATERIAL_WHITE,
      vertexColors: true,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    });

    this.pointsMaterial = new THREE.PointsMaterial({
      map: getSoftDotTexture(),
      color: MATERIAL_WHITE,
      vertexColors: true,
      size: trail.pointSizePx ?? DEFAULT_POINT_SIZE_PX,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.11,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    });

    this.line = new THREE.Line(this.geometry, this.lineMaterial);
    this.line.frustumCulled = false;
    this.line.renderOrder = 4;

    this.points = new THREE.Points(this.geometry, this.pointsMaterial);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;

    this.scene.add(this.line);
    this.scene.add(this.points);
  }

  #syncGeometry() {
    const trail = getTrail(this.equippedId);
    if (trail.id === DEFAULT_TRAIL_ID || this._points.length === 0) {
      if (this.line) this.line.visible = false;
      if (this.points) this.points.visible = false;
      return;
    }

    this.#ensureMeshesForTrail();
    if (!this.geometry || !this.line || !this.points) return;

    const n = this._points.length;
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);

    this._cA.setHex(trail.primaryColor);
    if (trail.secondaryColor != null) {
      this._cB.setHex(trail.secondaryColor);
    } else {
      this._cB.copy(this._cA);
    }

    for (let i = 0; i < n; i += 1) {
      const p = this._points[i];
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;

      const mixAmt = 0.5 + 0.5 * Math.sin(i * 0.35);
      this._cMix.copy(this._cA).lerp(this._cB, mixAmt);

      const along = n <= 1 ? 1 : i / (n - 1);
      const tailFade = 0.12 + 0.55 * along;

      colors[i * 3] = this._cMix.r * tailFade;
      colors[i * 3 + 1] = this._cMix.g * tailFade;
      colors[i * 3 + 2] = this._cMix.b * tailFade;
    }

    this.geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    this.geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    this.geometry.setDrawRange(0, n);
    this.geometry.computeBoundingSphere();

    this.line.visible = n >= 2;
    this.points.visible = n >= 1;
  }
}
