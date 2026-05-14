import * as THREE from "three";

/**
 * Procedural map textures for patterned ball skins (CanvasTexture, UV-friendly).
 */

function makeTextureFromImageData(ctx, img) {
  ctx.putImageData(img, 0, 0);
  const canvas = ctx.canvas;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.needsUpdate = true;
  return tex;
}

function setPx(d, i, hex) {
  d[i] = (hex >> 16) & 255;
  d[i + 1] = (hex >> 8) & 255;
  d[i + 2] = hex & 255;
  d[i + 3] = 255;
}

function drawCircle(data, w, h, cx_, cy_, r, hex) {
  const x0 = Math.max(0, Math.floor(cx_ - r - 1));
  const x1 = Math.min(w - 1, Math.ceil(cx_ + r + 1));
  const y0 = Math.max(0, Math.floor(cy_ - r - 1));
  const y1 = Math.min(h - 1, Math.ceil(cy_ + r + 1));
  const r2 = r * r;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx_;
      const dy = y - cy_;
      if (dx * dx + dy * dy > r2) continue;
      const i = (y * w + x) * 4;
      setPx(data, i, hex);
    }
  }
}

/** @returns {THREE.CanvasTexture | null} */
export function createSkinPatternTexture(skin) {
  if (!skin?.pattern) return null;
  const fg = skin.color ?? 0xff5bb7;
  const bg = skin.accent ?? 0x1a0818;
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const img = ctx.createImageData(size, size);
  const d = img.data;
  const { pattern } = skin;

  if (pattern === "checker") {
    const cells = 16;
    const cell = size / cells;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const cx = Math.floor(x / cell);
        const cy = Math.floor(y / cell);
        const px = ((cx + cy) & 1) === 0 ? fg : bg;
        setPx(d, (y * size + x) * 4, px);
      }
    }
  } else if (pattern === "diagonalStripe") {
    const w = 28;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const p = ((((x + y) / w) | 0) & 1) === 0;
        setPx(d, (y * size + x) * 4, p ? fg : bg);
      }
    }
  } else if (pattern === "rings") {
    const cx = size * 0.5;
    const cy = size * 0.5;
    const step = 22;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const ring = (((dist / step) | 0) & 1) === 0;
        setPx(d, (y * size + x) * 4, ring ? fg : bg);
      }
    }
  } else if (pattern === "dots") {
    const step = Math.floor(size / 10);
    const rad = Math.floor(step * 0.38);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        setPx(d, (y * size + x) * 4, bg);
      }
    }
    const rows = [];
    for (let gy = step / 2; gy < size; gy += step) rows.push(gy);
    const cols = [];
    for (let gx = step / 2; gx < size; gx += step) cols.push(gx);
    for (let yi = 0; yi < rows.length; yi++) {
      const oy = yi % 2 === 1 ? step * 0.5 : 0;
      for (const cxx of cols) {
        drawCircle(d, size, size, cxx + oy, rows[yi], rad, fg);
      }
    }
  } else {
    return null;
  }

  return makeTextureFromImageData(ctx, img);
}

export function disposeTexture(tex) {
  if (!tex || typeof tex.dispose !== "function") return;
  tex.dispose();
}
