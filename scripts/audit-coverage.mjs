#!/usr/bin/env node
/** Lists API mutation handlers that never write an audit entry. Exits 1 when any are found. */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "apps/api/src");
/** Handlers that are read-only, per-user housekeeping, or delegate to a helper that writes the audit entry. */
const ALLOW = new Set([
  "auth.ts POST login",
  "auth.ts POST mfa/verify",
  "auth.ts POST sso",
  "commercial.ts POST sales-orders",
  "insight.ts POST assistant/query",
  "insight.ts POST public/configure",
  "plant.ts POST production/jobs/:id/pause",
  "plant.ts POST production/jobs/:id/issue",
  "platform.ts POST notifications/scan",
  "platform.ts POST notifications/:id/read",
  "platform.ts POST notifications/read-all",
  "platform.ts POST approvals/:id/decide",
]);
const missing = [];
for (const file of readdirSync(dir).filter((name) => name.endsWith(".ts"))) {
  const source = readFileSync(join(dir, file), "utf8");
  const matches = [...source.matchAll(/@(Post|Patch|Put|Delete)\(([^)]*)\)/g)];
  matches.forEach((match, index) => {
    const start = match.index;
    const rest = source.slice(start, index + 1 < matches.length ? matches[index + 1].index : source.length);
    const end = rest.indexOf("\n  }\n");
    const body = end > 0 ? rest.slice(0, end) : rest;
    const label = `${file} ${match[1].toUpperCase()} ${match[2].replace(/["'`]/g, "")}`;
    if (!/audit\.log\(|this\.log\(|logAudit\(/.test(body) && !ALLOW.has(label)) missing.push(label);
  });
}
for (const line of missing) console.log(line);
console.log(`${missing.length} mutation handler(s) without audit logging`);
process.exit(missing.length ? 1 : 0);
