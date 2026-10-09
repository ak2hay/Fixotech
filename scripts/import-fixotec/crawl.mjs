#!/usr/bin/env node
// Crawls in.fixotec.global into storage/import/fixotec (JSON + downloaded binaries).
// Re-runnable: files already recorded in manifest.json with a matching hash are skipped.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "https://in.fixotec.global";
const UA = "Mozilla/5.0 (compatible; FixotecOneImporter/1.0; +https://in.fixotec.global)";
const CONCURRENCY = 4;
const DELAY_MS = 250;
const MAX_IMAGE_WIDTH = 1600;

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(root, "storage", "import", "fixotec");
const FILES = join(OUT, "files");
const args = new Set(process.argv.slice(2));
const skipDownloads = args.has("--no-download");
const isCli = Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli && !args.has("--i-have-permission")) {
  console.error(`Refusing to crawl ${BASE}: pass --i-have-permission once Fixotec has approved copying their site content.`);
  process.exit(1);
}
if (isCli) {
  mkdirSync(FILES, { recursive: true });
  mkdirSync(join(OUT, "html"), { recursive: true });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function request(url, { binary = false, tries = 4 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: binary ? "*/*" : "text/html,application/json,*/*" }, redirect: "follow" });
      if (res.status === 404) return { status: 404, body: null, headers: res.headers };
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = binary ? Buffer.from(await res.arrayBuffer()) : await res.text();
      return { status: res.status, body, headers: res.headers };
    } catch (error) {
      lastError = error;
      await sleep(DELAY_MS * attempt * 4);
    }
  }
  throw new Error(`${url}: ${lastError?.message}`);
}

async function getJson(url) {
  const res = await request(url);
  if (!res.body) return { data: null, headers: res.headers };
  return { data: JSON.parse(res.body), headers: res.headers };
}

async function wpPaged(path, fields) {
  const items = [];
  for (let page = 1; ; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const url = `${BASE}${path}${sep}per_page=100&page=${page}${fields ? `&_fields=${fields}` : ""}`;
    const res = await request(url);
    if (res.status === 404 || !res.body) break;
    const batch = JSON.parse(res.body);
    if (!Array.isArray(batch) || !batch.length) break;
    items.push(...batch);
    const totalPages = Number(res.headers.get("x-wp-totalpages") || 1);
    if (page >= totalPages) break;
    await sleep(DELAY_MS);
  }
  return items;
}

const save = (name, data) => writeFileSync(join(OUT, name), JSON.stringify(data, null, 2));

// ---------- HTML helpers ----------
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…", deg: "°", times: "×", frac12: "½", frac14: "¼", frac34: "¾" };
export function decode(text = "") {
  return String(text)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z0-9]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}
export function stripTags(html = "") {
  return decode(
    String(html)
      .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|li|h[1-6]|div|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t\f\v\u00a0]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}
const attr = (tag, name) => {
  const m = tag.match(new RegExp(`${name}=(["'])([\\s\\S]*?)\\1`, "i"));
  return m ? decode(m[2]) : undefined;
};
const uniq = (list) => [...new Set(list.filter(Boolean))];
const slugOf = (url) => decodeURIComponent(new URL(url).pathname.replace(/\/$/, "").split("/").pop() || "");
const isUpload = (url) => /\/wp-content\/uploads\//.test(url);
export const UPLOAD_IMG = /(?:src|data-src|data-lazy-src|href|data-bg|data-srcset)="((?:https?:)?\/\/in\.fixotec\.global\/wp-content\/uploads\/[^"\s]+?\.(?:png|jpe?g|webp|gif|svg)|\/wp-content\/uploads\/[^"\s]+?\.(?:png|jpe?g|webp|gif|svg))"|url\(['"]?((?:https?:)?\/\/in\.fixotec\.global\/wp-content\/uploads\/[^'")]+|\/wp-content\/uploads\/[^'")]+)['"]?\)/gi;
export function absUpload(raw) {
  const url = decode(raw).trim();
  const abs = url.startsWith("//") ? `https:${url}` : url.startsWith("/") ? `${BASE}${url}` : url;
  return abs.replace(/^http:/, "https:").replace(/-\d+x\d+(?=\.(png|jpe?g|webp|gif)$)/i, "");
}
const cleanUpload = (url) => url.replace(/-\d+x\d+(?=\.(png|jpe?g|webp|gif)$)/i, "");

function sectionBetween(html, startMarker, endMarkers) {
  const start = html.indexOf(startMarker);
  if (start < 0) return "";
  let end = html.length;
  for (const marker of endMarkers) {
    const idx = html.indexOf(marker, start + startMarker.length);
    if (idx > 0 && idx < end) end = idx;
  }
  return html.slice(start, end);
}

function listAfterHeading(html) {
  // Returns { "Application": [...], "Features & Benefits": [...] } from <h4>Heading</h4><ul><li>..</li></ul>
  const out = {};
  const re = /<h[2-5][^>]*>([\s\S]*?)<\/h[2-5]>\s*(?:<p>\s*<\/p>\s*)?<ul[^>]*>([\s\S]*?)<\/ul>/gi;
  let m;
  while ((m = re.exec(html))) {
    const heading = stripTags(m[1]);
    const items = [...m[2].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((x) => stripTags(x[1])).filter(Boolean);
    if (heading && items.length) out[heading] = items;
  }
  return out;
}

export function parseProduct(url, html) {
  const id = Number(html.match(/data-product_id="(\d+)"/)?.[1] || html.match(/name="product_id" value="(\d+)"/)?.[1] || 0) || null;
  const name = stripTags(html.match(/<h1[^>]*class="[^"]*product_title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "");
  const shortDescription = stripTags(html.match(/<div class="woocommerce-product-details__short-description">([\s\S]*?)<\/div>/i)?.[1] || "");

  const metaBlock = html.match(/<span class="posted_in">([\s\S]*?)<\/span>/i)?.[1] || "";
  const categories = [...metaBlock.matchAll(/href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => ({ slug: slugOf(m[1]), name: stripTags(m[2]), url: m[1] }));
  const sku = stripTags(html.match(/<span class="sku">([\s\S]*?)<\/span>/i)?.[1] || "");

  const galleryBlock = sectionBetween(html, '<div class="product_image_wrapper', ["<h1"]) || sectionBetween(html, '<div class="woocommerce-product-gallery', ["<h1"]);
  const gallery = uniq([...galleryBlock.matchAll(/data-large_image="([^"]+)"/g)].map((m) => decode(m[1])));
  if (!gallery.length) gallery.push(...uniq([...galleryBlock.matchAll(/data-src="([^"]+)"/g)].map((m) => cleanUpload(decode(m[1])))));

  const descriptionHtml = sectionBetween(html, '<div id="tab-description"', ['<div id="tab-additional_information"', '<section class="related']);
  const sections = listAfterHeading(descriptionHtml);
  const descriptionText = stripTags(descriptionHtml.replace(/<h[2-5][^>]*>[\s\S]*?<\/h[2-5]>\s*<ul[^>]*>[\s\S]*?<\/ul>/gi, " "));

  const attrTable = sectionBetween(html, '<table class="woocommerce-product-attributes shop_attributes', ["</table>"]);
  const attributes = {};
  for (const m of attrTable.matchAll(/<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/gi)) {
    attributes[stripTags(m[1])] = stripTags(m[2]).split(/\s*,\s*/).filter(Boolean);
  }

  // Attribute key -> label, and option slug -> display text, from the variations form.
  const attributeLabels = {};
  const optionLabels = {};
  for (const m of html.matchAll(/<label for="(pa_[^"]+|[^"]+)">([\s\S]*?)<\/label>\s*<\/th>\s*<td class="value">\s*<select[^>]*name="attribute_([^"]+)"[^>]*>([\s\S]*?)<\/select>/gi)) {
    const key = m[3];
    attributeLabels[key] = stripTags(m[2]);
    optionLabels[key] = {};
    for (const o of m[4].matchAll(/<option value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/gi)) if (o[1]) optionLabels[key][o[1]] = stripTags(o[2]);
  }

  let variationsRaw = [];
  let variationsLazy = false;
  const vm = html.match(/data-product_variations="([^"]*)"/);
  if (vm) {
    const decoded = decode(vm[1]);
    if (decoded === "false") variationsLazy = true;
    else {
      try {
        variationsRaw = JSON.parse(decoded);
      } catch {
        variationsRaw = [];
      }
    }
  }
  const variations = variationsRaw.map((v) => {
    const attrs = {};
    for (const [rawKey, value] of Object.entries(v.attributes || {})) {
      const key = rawKey.replace(/^attribute_/, "");
      attrs[attributeLabels[key] || key.replace(/^pa_/, "")] = optionLabels[key]?.[value] ?? value;
    }
    return {
      variationId: v.variation_id,
      sku: v.sku || "",
      description: stripTags(v.variation_description || ""),
      attributes: attrs,
      image: v.image?.full_src || v.image?.url || null,
      weight: v.weight || "",
      dimensions: v.dimensions || {},
      active: v.variation_is_active !== false
    };
  });

  const pdfs = uniq([...html.matchAll(/https?:\/\/in\.fixotec\.global\/wp-content\/uploads\/[^"'\s<>]+?\.pdf/gi)].map((m) => decode(m[0])));
  const breadcrumb = [...(html.match(/<nav class="woocommerce-breadcrumb"[\s\S]*?<\/nav>/i)?.[0] || "").matchAll(/<a href="([^"]+)">([\s\S]*?)<\/a>/g)].map((m) => stripTags(m[2]));

  return {
    id,
    url,
    slug: slugOf(url),
    name,
    sku: sku === "N/A" ? "" : sku,
    shortDescription,
    descriptionText,
    sections,
    categories,
    breadcrumb,
    attributes,
    gallery,
    variations,
    variationsLazy,
    pdfs
  };
}

function mainContent(html) {
  const start = html.search(/<div id="Content"|<main/i);
  const end = html.search(/<footer|<div id="Footer"/i);
  return html.slice(start >= 0 ? start : 0, end > start ? end : html.length);
}

export function parsePage(url, html) {
  const content = mainContent(html);
  const images = uniq([...content.matchAll(UPLOAD_IMG)].map((m) => absUpload(m[1] || m[2])));
  const headings = [...content.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => ({ level: Number(m[1]), text: stripTags(m[2]) })).filter((h) => h.text);
  const paragraphs = [...content.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => stripTags(m[1])).filter((t) => t.length > 2);
  const lists = listAfterHeading(content);
  const links = uniq([...content.matchAll(/href="(https:\/\/in\.fixotec\.global\/[^"#]+)"/gi)].map((m) => decode(m[1])));
  const pdfs = links.filter((l) => /\.pdf$/i.test(l));
  const title = stripTags(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "");
  const description = attr(html.match(/<meta name="description"[^>]*>/i)?.[0] || "", "content") || "";
  const ogImage = attr(html.match(/<meta property="og:image"[^>]*>/i)?.[0] || "", "content") || "";
  return { url, slug: slugOf(url) || "home", title, description, ogImage, headings, paragraphs, lists, images, links, pdfs, text: stripTags(content).slice(0, 20000) };
}

// ---------- downloads ----------
const manifestPath = join(OUT, "manifest.json");
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};

function localNameFor(url) {
  const u = new URL(url);
  const rel = decodeURIComponent(u.pathname).replace(/^\/wp-content\/uploads\//, "uploads/").replace(/^\//, "");
  return rel.replace(/[^a-zA-Z0-9/._-]+/g, "-");
}

async function download(url) {
  const rel = localNameFor(url);
  const file = join(FILES, rel);
  const known = manifest[url];
  if (known && existsSync(file)) {
    const hash = createHash("sha256").update(readFileSync(file)).digest("hex");
    if (hash === known.sha256) return { url, skipped: true };
  }
  const res = await request(url, { binary: true });
  if (!res.body) {
    manifest[url] = { file: null, status: 404 };
    return { url, missing: true };
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, res.body);
  manifest[url] = {
    file: rel,
    sha256: createHash("sha256").update(res.body).digest("hex"),
    bytes: res.body.length,
    mime: res.headers.get("content-type")?.split(";")[0] || "application/octet-stream"
  };
  return { url, downloaded: true };
}

async function pool(items, worker, concurrency = CONCURRENCY) {
  const results = [];
  let next = 0;
  let done = 0;
  async function run() {
    while (next < items.length) {
      const item = items[next++];
      try {
        results.push(await worker(item));
      } catch (error) {
        results.push({ item, error: String(error.message || error) });
      }
      done++;
      if (done % 25 === 0) {
        log(`  ${done}/${items.length}`);
        writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      }
      await sleep(DELAY_MS);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

// ---------- main ----------
const reuseCached = args.has("--products");
async function stage(name, file, fn) {
  const path = join(OUT, file);
  if (reuseCached && existsSync(path)) {
    log(`${name} (cached)`);
    return JSON.parse(readFileSync(path, "utf8"));
  }
  log(name);
  const data = await fn();
  save(file, data);
  return data;
}

async function main() {
  const sitemaps = await stage("sitemaps", "sitemaps.json", async () => {
    const index = (await request(`${BASE}/sitemap_index.xml`)).body || "";
    const sitemapUrls = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decode(m[1]));
    const out = {};
    for (const sm of sitemapUrls) {
      const xml = (await request(sm)).body || "";
      out[sm] = [...xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>/g)].map((m) => decode(m[1]));
      await sleep(DELAY_MS);
    }
    return out;
  });
  const productUrls = uniq(Object.entries(sitemaps).filter(([k]) => /product-sitemap/.test(k)).flatMap(([, v]) => v)).filter((u) => new URL(u).pathname.split("/").filter(Boolean).length > 1);

  const categories = await stage("categories", "categories.json", async () => (await getJson(`${BASE}/wp-json/wc/store/v1/products/categories?per_page=100`)).data || []);

  const mediaSlim = await stage("media library", "media.json", async () => (await wpPaged("/wp-json/wp/v2/media", "id,slug,date,title,alt_text,mime_type,source_url,post,media_details")).map((m) => ({
    id: m.id,
    slug: m.slug,
    date: m.date,
    title: stripTags(m.title?.rendered || ""),
    alt: m.alt_text || "",
    mime: m.mime_type,
    url: m.source_url,
    parent: m.post || null,
    width: m.media_details?.width || null,
    height: m.media_details?.height || null,
    sizes: Object.fromEntries(Object.entries(m.media_details?.sizes || {}).map(([k, s]) => [k, { url: s.source_url, width: s.width, height: s.height }]))
  })));
  log(`  ${mediaSlim.length} media, ${mediaSlim.filter((m) => m.mime === "application/pdf").length} PDFs`);

  const pagesParsed = await stage("pages", "pages.json", async () => {
    const pages = await wpPaged("/wp-json/wp/v2/pages", "id,slug,link,parent,title,excerpt,content,featured_media,date,modified");
    const out = [];
    for (const p of pages) {
      if (p.slug === "demo") continue;
      const res = await request(p.link);
      if (!res.body) continue;
      const parsed = parsePage(p.link, res.body);
      out.push({ id: p.id, parent: p.parent, wpSlug: p.slug, featuredMedia: p.featured_media || null, wpTitle: stripTags(p.title?.rendered || ""), ...parsed });
      writeFileSync(join(OUT, "html", `page-${p.slug}.html`), mainContent(res.body));
      await sleep(DELAY_MS);
    }
    return out;
  });

  const postsSlim = await stage("posts", "posts.json", async () => (await wpPaged("/wp-json/wp/v2/posts", "id,slug,link,date,title,excerpt,content,featured_media,categories")).map((p) => ({
    id: p.id,
    slug: p.slug,
    url: p.link,
    date: p.date,
    title: stripTags(p.title?.rendered || ""),
    excerpt: stripTags(p.excerpt?.rendered || ""),
    html: p.content?.rendered || "",
    text: stripTags(p.content?.rendered || ""),
    featuredMedia: p.featured_media || null,
    images: uniq([...(p.content?.rendered || "").matchAll(/src="(https:\/\/in\.fixotec\.global\/wp-content\/uploads\/[^"]+)"/gi)].map((m) => cleanUpload(decode(m[1]))))
  })));

  log(`products (${productUrls.length})`);
  const products = [];
  await pool(productUrls, async (url) => {
    const res = await request(url);
    if (!res.body) return;
    products.push(parseProduct(url, res.body));
  });
  products.sort((a, b) => a.url.localeCompare(b.url));
  save("products.json", products);
  log(`  parsed ${products.length}, ${products.reduce((n, p) => n + p.variations.length, 0)} variations, ${products.filter((p) => p.variationsLazy).length} lazy`);

  // ---------- choose what to download ----------
  const byUrl = new Map(mediaSlim.map((m) => [m.url, m]));
  const byId = new Map(mediaSlim.map((m) => [m.id, m]));
  const sized = (url) => {
    const m = byUrl.get(url);
    if (!m || !m.width || m.width <= MAX_IMAGE_WIDTH) return url;
    const options = Object.values(m.sizes).filter((s) => s.width <= MAX_IMAGE_WIDTH && s.width >= 600 && Math.abs(s.width / s.height - m.width / m.height) < 0.05);
    options.sort((a, b) => b.width - a.width);
    return options[0]?.url || url;
  };

  const wanted = new Map(); // original url -> download url
  const want = (url) => {
    if (!url || !isUpload(url)) return;
    if (!wanted.has(url)) wanted.set(url, /\.(png|jpe?g|webp|gif)$/i.test(url) ? sized(url) : url);
  };
  want(`${BASE}/wp-content/uploads/2023/01/Fixotec.png`);
  want(`${BASE}/wp-content/uploads/2023/02/Fixotec-Catalog.pdf`);
  for (const m of mediaSlim) {
    if (m.mime === "application/pdf") want(m.url);
    if (/fixotec[-_ ]?(white|logo)|favicon/i.test(m.slug + m.url)) want(m.url);
  }
  for (const c of categories || []) want(c.image?.src);
  for (const p of products) {
    p.gallery.forEach(want);
    p.variations.forEach((v) => want(v.image));
    p.pdfs.forEach(want);
  }
  for (const p of pagesParsed) {
    p.images.forEach(want);
    p.pdfs.forEach(want);
    if (p.ogImage) want(p.ogImage);
    if (p.featuredMedia) want(byId.get(p.featuredMedia)?.url);
  }
  for (const p of postsSlim) {
    if (p.featuredMedia) want(byId.get(p.featuredMedia)?.url);
    p.images.forEach(want);
  }
  const plan = [...wanted.entries()].map(([original, fetchUrl]) => ({ original, fetchUrl }));
  save("download-plan.json", plan);
  log(`downloads planned: ${plan.length}`);

  if (!skipDownloads) {
    const results = await pool(plan, async ({ original, fetchUrl }) => {
      const r = await download(fetchUrl);
      if (fetchUrl !== original && manifest[fetchUrl]) manifest[original] = { ...manifest[fetchUrl], resizedFrom: original, fetchedAs: fetchUrl };
      return r;
    });
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    const failed = results.filter((r) => r?.error);
    log(`downloaded ${results.filter((r) => r?.downloaded).length}, skipped ${results.filter((r) => r?.skipped).length}, missing ${results.filter((r) => r?.missing).length}, failed ${failed.length}`);
    if (failed.length) save("download-errors.json", failed);
  }

  const { writeBlocks } = await import("./blocks.mjs");
  writeBlocks(OUT);

  save("crawl-summary.json", {
    crawledAt: new Date().toISOString(),
    products: products.length,
    variations: products.reduce((n, p) => n + p.variations.length, 0),
    categories: (categories || []).length,
    pages: pagesParsed.length,
    posts: postsSlim.length,
    media: mediaSlim.length,
    pdfs: mediaSlim.filter((m) => m.mime === "application/pdf").length,
    downloads: Object.values(manifest).filter((m) => m.file).length,
    bytes: Object.values(manifest).filter((m) => m.file && !m.resizedFrom).reduce((n, m) => n + (m.bytes || 0), 0)
  });
  log("done");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    process.exit(1);
  });
}
