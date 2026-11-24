import { copyFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dest = path.join(root, "public", "ifc");

let pkg;
try {
  pkg = path.dirname(require.resolve("web-ifc/package.json"));
} catch {
  process.exit(0);
}

mkdirSync(dest, { recursive: true });
for (const name of readdirSync(pkg)) {
  if (name.endsWith(".wasm")) copyFileSync(path.join(pkg, name), path.join(dest, name));
}
if (!existsSync(path.join(dest, "web-ifc.wasm")) && existsSync(path.join(pkg, "web-ifc.wasm"))) {
  copyFileSync(path.join(pkg, "web-ifc.wasm"), path.join(dest, "web-ifc.wasm"));
}
