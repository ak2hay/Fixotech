#!/usr/bin/env node
/** Lists top-level findMany calls in the API without a `take` limit. */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "apps/api/src");
for (const file of readdirSync(dir).filter((name) => name.endsWith(".ts"))) {
  const source = readFileSync(join(dir, file), "utf8");
  for (const match of source.matchAll(/\.(\w+)\.findMany\(/g)) {
    let depth = 0;
    let end = match.index + match[0].length - 1;
    for (; end < source.length; end++) {
      if (source[end] === "(") depth++;
      else if (source[end] === ")" && --depth === 0) break;
    }
    const call = source.slice(match.index, end + 1);
    if (!/\btake:/.test(call) && !/\bid: \{ in:/.test(call)) {
      const line = source.slice(0, match.index).split("\n").length;
      console.log(`${file}:${line} ${match[1]}`);
    }
  }
}
