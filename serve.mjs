import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8080);
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const server = createServer(async (req, res) => {
  const urlPath = req.url === "/" ? "/index.html" : req.url;
  const safePath = normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(scriptDir, safePath);

  try {
    const body = await readFile(filePath);
    const ext = extname(filePath);
    const shouldBypassCache = ext === ".html" || ext === ".js" || ext === ".css";
    res.writeHead(200, {
      "content-type": mimeTypes[ext] ?? "application/octet-stream",
      "cache-control": shouldBypassCache ? "no-cache, no-store, must-revalidate" : "public, max-age=300",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not Found");
  }
});

server.listen(port, () => {
  console.log(`Static server running at http://localhost:${port}`);
  console.log(`Alternate URL: http://127.0.0.1:${port}`);
  console.log(`Serving files from: ${scriptDir}`);
});

server.on("error", (error) => {
  console.error("Server failed to start:", error.message);
});
