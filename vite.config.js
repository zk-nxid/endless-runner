import { defineConfig } from "vite";
import dns from "node:dns";

// Prefer IPv4 for `localhost` on Windows (avoids long hangs / failed connects when IPv6 ::1 misbehaves).
dns.setDefaultResultOrder("ipv4first");

const DEV_PORT = Number(process.env.PORT || 8080);

export default defineConfig({
  // Relative URLs so the built site works from subpaths (e.g. GitHub Pages `…/repo/`)
  // and avoids `/assets/…` 404s when the app is not hosted at the domain root.
  base: "./",
  server: {
    port: DEV_PORT,
    strictPort: true,
    // Listen on all local interfaces so localhost / 127.0.0.1 / LAN IP all work.
    host: true,
    open: false,
  },
  preview: {
    port: DEV_PORT,
    strictPort: true,
    host: true,
  },
  build: {
    target: "es2020",
    outDir: "dist",
    sourcemap: true,
  },
});
