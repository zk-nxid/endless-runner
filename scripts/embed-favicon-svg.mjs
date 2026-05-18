/**
 * Writes public/favicon.svg wrapping public/branding/orbs-favicon-source.png (embedded as data URL).
 * Centers art on a square viewBox with ~10% safe padding at intrinsic pixel size (no resampling).
 * Transparent areas stay transparent — they adopt the tab / browser background.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const source = path.join(root, "public", "branding", "orbs-favicon-source.png");
const outSvg = path.join(root, "public", "favicon.svg");
const outPng = path.join(root, "public", "site-icon.png");

if (!fs.existsSync(source)) {
  console.error("Missing:", source);
  process.exit(1);
}

const buf = fs.readFileSync(source);
if (buf[0] !== 0x89 || buf[1] !== 0x50) {
  console.error("Not a PNG:", source);
  process.exit(1);
}
const w = buf.readUInt32BE(16);
const h = buf.readUInt32BE(20);

/** Padding around art; viewBox is square, sized to fit the PNG at 1:1 (no resampling / no clipping). */
const pad = 0.1;
const side = Math.max(w, h);
const VIEW = Math.max(32, Math.ceil(side * (1 + 2 * pad)));
const nw = w;
const nh = h;
const ox = Math.floor((VIEW - nw) / 2);
const oy = Math.floor((VIEW - nh) / 2);

const b64 = buf.toString("base64");
const dataUrl = `data:image/png;base64,${b64}`;

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW} ${VIEW}" role="img" aria-label="ORBS">
  <title>ORBS</title>
  <!-- Your artwork — embedded PNG, no resampling; transparent areas use the tab background. -->
  <image
    href="${dataUrl}"
    xlink:href="${dataUrl}"
    x="${ox}"
    y="${oy}"
    width="${nw}"
    height="${nh}"
    preserveAspectRatio="xMidYMid meet"
    style="image-rendering:pixelated;image-rendering:-moz-crisp-edges;image-rendering:crisp-edges"
  />
</svg>
`;

fs.writeFileSync(outSvg, svg, "utf8");
fs.copyFileSync(source, outPng);

const kb = (svg.length / 1024).toFixed(1);
console.log(
  "Wrote",
  outSvg,
  "(" + kb + " KB),",
  outPng,
  "(copy),",
  "source",
  `${w}x${h}`,
  "viewBox",
  `${VIEW}x${VIEW}`,
  "offset",
  ox,
  oy
);
