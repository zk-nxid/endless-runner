import { Game } from "./core/game.js";

function showFatal(message, err) {
  console.error(message, err);
  const detail =
    err && typeof err === "object" && "stack" in err && typeof err.stack === "string"
      ? err.stack
      : err != null
        ? String(err)
        : "";
  const pre = document.createElement("pre");
  pre.setAttribute("role", "alert");
  pre.style.cssText =
    "position:fixed;left:12px;right:12px;bottom:12px;max-height:42vh;overflow:auto;padding:14px;margin:0;background:#140818;color:#ffd6ea;border:1px solid rgba(255,91,183,0.85);border-radius:8px;font:12px/1.45 ui-monospace,monospace;z-index:99999;box-shadow:0 8px 32px rgba(0,0,0,0.55);";
  pre.textContent = detail ? `${message}\n\n${detail}` : message;
  document.body.appendChild(pre);
}

function run() {
  const worldCanvas = document.getElementById("world-canvas");
  const avatarCanvas = document.getElementById("game-canvas");
  if (!worldCanvas || !avatarCanvas) {
    throw new Error("Missing canvas elements (#world-canvas / #game-canvas).");
  }
  const game = new Game({ worldCanvas, avatarCanvas });
  game.start();
  void game.initCloudSave().catch((err) => {
    console.warn("Neon Runner: auth init failed", err);
  });
}

function start() {
  try {
    run();
  } catch (err) {
    showFatal("Neon Runner failed to start.", err);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
