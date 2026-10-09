// Splits a saved page body into heading-led blocks: { level, heading, text, images }.
// Images attach to whichever heading is closer, since the source theme places icons before their titles.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { UPLOAD_IMG, absUpload, stripTags } from "./crawl.mjs";

export function blocks(html) {
  const marks = [{ index: 0, end: 0, level: 0, heading: "" }];
  const re = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m;
  while ((m = re.exec(html))) marks.push({ index: m.index, end: re.lastIndex, level: Number(m[1]), heading: stripTags(m[2]) });
  const out = marks.map((mark, i) => ({
    level: mark.level,
    heading: mark.heading,
    text: stripTags(html.slice(mark.end, marks[i + 1]?.index ?? html.length)),
    images: []
  }));
  for (const im of html.matchAll(new RegExp(UPLOAD_IMG.source, "gi"))) {
    const url = absUpload(im[1] || im[2]);
    const pos = im.index;
    let prev = 0;
    while (prev + 1 < marks.length && marks[prev + 1].index <= pos) prev++;
    const next = prev + 1 < marks.length ? prev + 1 : -1;
    const target = next > 0 && marks[next].index - pos < pos - marks[prev].end ? next : prev;
    if (!out[target].images.includes(url)) out[target].images.push(url);
  }
  return out.filter((b) => b.heading || b.text || b.images.length);
}

export function writeBlocks(outDir) {
  const dir = join(outDir, "html");
  const result = { pages: {}, banners: [] };
  for (const name of readdirSync(dir)) {
    const match = name.match(/^page-(.+)\.html$/);
    if (!match) continue;
    const html = readFileSync(join(dir, name), "utf8");
    result.pages[match[1]] = blocks(html);
    if (match[1] === "home") result.banners = bannerSlides(html);
  }
  writeFileSync(join(outDir, "blocks.json"), JSON.stringify(result, null, 2));
  return result;
}

// Home slider: images grouped per "Banner Image N" slide.
export function bannerSlides(html) {
  const parts = html.split(/data-title="Banner Image \d+"/).slice(1);
  return parts.map((part) => [...new Set([...part.matchAll(new RegExp(UPLOAD_IMG.source, "gi"))].map((x) => absUpload(x[1] || x[2])))]);
}
