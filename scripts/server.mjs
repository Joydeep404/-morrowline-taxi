import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)), process.argv.includes("--dist") ? "dist" : ".");
if (!existsSync(resolve(root, "index.html"))) {
  console.error("No built site found. Run `npm run build` first, or start the development server without --dist.");
  process.exitCode = 1;
} else {
  const mime = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".svg": "image/svg+xml"
  };
  const port = Number(process.env.PORT || 4173);
  const server = createServer((request, response) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    } catch {
      response.writeHead(400).end("Bad request");
      return;
    }
    const requested = resolve(root, `.${pathname}`);
    if (requested !== root && !requested.startsWith(`${root}${sep}`)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    let target = requested;
    if (!existsSync(target) || !statSync(target).isFile()) {
      target = resolve(root, "index.html");
    }
    response.writeHead(200, {
      "Content-Type": mime[extname(target)] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin"
    });
    createReadStream(target).pipe(response);
  });
  server.listen(port, "0.0.0.0", () => console.log(`Morrowline ready at http://localhost:${port}`));
}
