# Neon Runner (Three.js + PlayCanvas)

Browser-based neon endless runner. The 3D world (track, neon obstacles, cinematic sky, lights, fog) is rendered with **PlayCanvas Engine 2.x**, while the **player avatar** is rendered with **Three.js** on a transparent canvas overlay above. Both engines share an engine-agnostic camera state for perfect lockstep.

## Run Locally

Two ways to run depending on whether you have Node.js + npm installed.

### Option A - No build step (default)

The bundled `serve.mjs` static server still works. Engine packages are loaded via an import map in `index.html` from CDN, so bare specifiers like `import * as THREE from "three"` resolve at runtime in the browser.

1. Open a terminal in this directory.
2. Run:

```powershell
node serve.mjs
```

3. Open **[http://localhost:8080](http://localhost:8080)** (or [http://127.0.0.1:8080](http://127.0.0.1:8080) if `localhost` misbehaves).

### Option B - Vite dev server (recommended once Node + npm are installed)

```powershell
npm install
npm run dev
```

Then open **[http://localhost:8080](http://localhost:8080)** (port **8080** is set in `vite.config.js`).  
Use `npm run build` for a production bundle into `dist/`, and `npm run preview` to try the built files locally (same port rules as dev).

### If the browser says “connection failed”

1. **Keep the terminal open** — The site only runs while `npm run dev` or `node serve.mjs` is running. Closing the terminal stops the server.
2. **Use `http://`, not `https://`** — Local dev is not TLS.
3. **Try `http://127.0.0.1:8080`** first if `localhost` fails or spins forever (common on Windows).
4. **Wrong port** — Vite is set to **8080** with `strictPort: true`. If something else uses 8080, Vite will error at startup; either stop the other app or use another port:
   ```powershell
   $env:PORT="5174"; npm run dev
   ```
   Then open the URL shown in the terminal (it will include `:5174`).
5. **Phone / another PC** — Use the **Network** URL Vite prints (e.g. `http://192.168.x.x:8080`). Windows may ask to allow **Node.js** through the firewall the first time.

> When Vite is in use, it resolves `three` and `playcanvas` from `node_modules`; the import map in `index.html` is harmless (browser ignores it after Vite rewrites the imports).

## Architecture

- **PlayCanvas world** ([src/systems/playCanvasWorld.js](src/systems/playCanvasWorld.js)) - ground, lane lines, neon obstacles (low blocks / pillars / arches / tall towers), cinematic sky backdrop, particles, lights, fog. Manual render mode driven by the game loop.
- **Three.js avatar** ([src/core/game.js](src/core/game.js)) - just the player on a transparent canvas overlay.
- **CameraSystem** ([src/systems/cameraSystem.js](src/systems/cameraSystem.js)) - engine-agnostic state (`{ position, lookAt, fov, aspect }`) that both engines mirror each frame.

## Implemented Systems

- Fixed-step deterministic simulation loop (60 Hz) with render interpolation.
- Keyboard and mobile swipe input normalized into simulation commands.
- Lane-based smooth movement with deterministic forward progression.
- Camera follow rig with damping for clean tracking.
- UI state flow: `Menu -> Playing -> End -> Reset`.
- Deterministic obstacle spawning via seeded RNG.
- Difficulty ramp tied to elapsed simulation time.
- Mock integration adapters under `src/integration/` (leaderboard via `localStorage`, email capture, reward thresholds).

## Reskin / Reuse

- Tweak gameplay settings in `src/core/constants.js`.
- Switch presets or tune token groups in `src/core/theme.js` (palette, emissive, fog, uiMotion, geometry).
- Obstacle profiles live in `src/systems/playCanvasWorld.js` (`buildObstacleEntity`).

## Audio Notes

- Procedural soundtrack mixes:
  - 124 BPM kick / bass / arp lead loop
  - Mood-reactive lowpass filter on bass + lead
- Music starts on user interaction to comply with browser autoplay rules.
- Lane move and jump actions trigger short SFX; menu button hover plays a soft tick.
- Mood intensity modulates filter cutoff and music gain in real time.

## Performance Guardrails

- Manual render mode keeps both engines in lockstep with no double-frame waste.
- Particle counts are capped intentionally; raise cautiously for mobile.
- Pixel ratio is capped at `2` for stable frame pacing on mid-tier devices.

## Deployment Notes

- `npm run build` produces a static `dist/` for any static host.
- Without Vite: deploy `index.html`, `styles.css`, and `src/` as-is - engines load from CDN via the import map.
