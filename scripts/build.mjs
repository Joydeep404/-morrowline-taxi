import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const output = resolve(root, "dist");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const entry of ["index.html", "taxi.css", "src", "README.md"]) {
  await cp(resolve(root, entry), resolve(output, entry), { recursive: true });
}
console.log(`Built offline-ready static game at ${output}`);
