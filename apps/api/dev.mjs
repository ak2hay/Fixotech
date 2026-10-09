import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
let server = null;

function boot() {
  if (server && !server.killed) server.kill();
  server = spawn(process.execPath, ["dist/main.js"], { cwd: root, stdio: "inherit", env: process.env });
}

const compiler = spawn("pnpm", ["exec", "tsc", "-p", "tsconfig.json", "--watch", "--preserveWatchOutput"], {
  cwd: root,
  shell: true,
  stdio: ["ignore", "pipe", "pipe"],
});

function watch(stream) {
  let buffer = "";
  stream.on("data", (chunk) => {
    const text = chunk.toString();
    process.stdout.write(text);
    buffer += text;
    if (buffer.includes("Found 0 errors")) {
      buffer = "";
      boot();
    }
    if (buffer.length > 8000) buffer = buffer.slice(-2000);
  });
}

watch(compiler.stdout);
watch(compiler.stderr);
compiler.on("exit", (code) => {
  if (server) server.kill();
  process.exit(code ?? 1);
});
