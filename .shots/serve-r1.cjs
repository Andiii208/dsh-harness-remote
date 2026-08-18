// Static server for apps/mobile/dist-web-r1 (SPA fallback).
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "..", "apps", "mobile", "dist-web-r1");
const PORT = 8098;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".ttf": "font/ttf", ".woff": "font/woff", ".woff2": "font/woff2" };
http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  let p = path.join(ROOT, url.pathname === "/" ? "index.html" : url.pathname);
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(ROOT, "index.html");
  try {
    const body = fs.readFileSync(p);
    res.writeHead(200, { "content-type": MIME[path.extname(p)] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("nope");
  }
}).listen(PORT, () => console.log(`r1 static on http://127.0.0.1:${PORT}`));
