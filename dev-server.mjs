// Zero-dependency live-reload dev server.
// Run: node dev-server.mjs   →   open http://localhost:3000
import { createServer } from "node:http";
import { readFile, watch } from "node:fs";
import { extname, join, normalize } from "node:path";

const ROOT = process.cwd();
const PORT = process.env.PORT || 3000;
const clients = new Set();

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".json": "application/json",
};

// Script injected into every HTML page: listens for reload events.
const LIVE_RELOAD = `
<script>
  new EventSource("/__reload").onmessage = () => location.reload();
</script>`;

const server = createServer((req, res) => {
  // Server-sent events channel for reload signals.
  if (req.url === "/__reload") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write("\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  const filePath = join(ROOT, normalize(urlPath).replace(/^(\.\.[/\\])+/, ""));

  readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404 Not Found");
      return;
    }
    const ext = extname(filePath);
    let body = data;
    if (ext === ".html") body = data.toString() + LIVE_RELOAD;
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(body);
  });
});

// Watch the project and tell every open browser to reload on change.
let timer;
watch(ROOT, { recursive: true }, (_event, file) => {
  if (!file || file.startsWith(".git") || file === "dev-server.mjs") return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    for (const c of clients) c.write("data: reload\n\n");
  }, 80);
});

server.listen(PORT, () => {
  console.log(`\n  Live server running → http://localhost:${PORT}\n  Edit index.html / styles.css and the browser reloads automatically.\n`);
});
