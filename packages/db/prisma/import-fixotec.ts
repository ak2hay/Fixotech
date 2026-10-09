// Loads the in.fixotec.global snapshot (storage/import/fixotec, written by scripts/import-fixotec/crawl.mjs)
// into the database and storage. Every write is keyed by slug, article number or storage key, so re-runs are safe.
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "fs";
import path from "path";
import type { PrismaClient } from "@prisma/client";

type Block = { level: number; heading: string; text: string; images: string[] };
type Manifest = Record<string, { file: string | null; sha256?: string; bytes?: number; mime?: string }>;
type SourceCategory = { id: number; parent: number; name: string; slug: string; image?: { src?: string } | null };
type SourceVariation = { variationId: number; sku: string; description: string; attributes: Record<string, string>; image: string | null; active: boolean };
type SourceProduct = {
  id: number;
  url: string;
  slug: string;
  name: string;
  shortDescription: string;
  descriptionText: string;
  sections: Record<string, string[]>;
  categories: Array<{ slug: string; name: string }>;
  attributes: Record<string, string[]>;
  gallery: string[];
  variations: SourceVariation[];
  pdfs: string[];
};
type SourceMedia = { id: number; title: string; mime: string; url: string; date: string };
type SourcePost = { id: number; slug: string; url: string; date: string; title: string; excerpt: string; html: string; featuredMedia: number | null };

export const DEMO_PRODUCT_SKUS = ["FXR", "SRS", "ROD", "CON", "ANC", "HNG"];
const AUDIENCES = ["PUBLIC", "CUSTOMER", "DISTRIBUTOR", "CONSULTANT"];
const CATALOGUE_URL = "https://in.fixotec.global/wp-content/uploads/2023/02/Fixotec-Catalog.pdf";
const LOGO_URL = "https://in.fixotec.global/wp-content/uploads/2023/01/Fixotec.png";

const SEGMENT_TAGS: Record<string, string> = {
  "hvac-featured": "hvac",
  "hvac-accessories": "hvac",
  "plumbing-feature": "plumbing",
  "electrical-feature": "electrical",
  "fire-fighting-feature": "fire-fighting",
  "fire-fighting-accessories": "fire-fighting",
  "multiple-service-feature": "multiple-services",
  "multiple-services-accessories": "multiple-services",
};

const SEGMENTS = [
  { slug: "hvac", page: "hvac", name: "HVAC" },
  { slug: "plumbing", page: "plumbing", name: "Plumbing" },
  { slug: "electrical", page: "electrical", name: "Electrical" },
  { slug: "fire-fighting", page: "fire-fighting", name: "Fire Fighting" },
  { slug: "multiple-services", page: "multiple-services", name: "Multiple Services" },
];

const SECTORS = [
  { slug: "high-rise-buildings", page: "high-rise-buildings-sector", name: "High-Rise Buildings", group: "BUILDINGS", tile: "High-Rise-Buildings2-2" },
  { slug: "hotels", page: "hotels-sector", name: "Hotels", group: "BUILDINGS", tile: "Hotels-2" },
  { slug: "hospitals", page: "hospitals-sector", name: "Hospitals", group: "BUILDINGS", tile: "Hospitals-2" },
  { slug: "data-centers", page: "data-center-sector", name: "Data Centers", group: "BUILDINGS", tile: "Data-Center-2" },
  { slug: "advanced-manufacturing", page: "advance-manufacturing-sector", name: "Advanced Manufacturing", group: "INDUSTRIES", tile: "manufacturing-landscape-1-2" },
  { slug: "automotive-manufacturing", page: "automotive-manufacturing-sector", name: "Automotive Manufacturing", group: "INDUSTRIES", tile: "automotive-landscape-1-2" },
  { slug: "light-industries", page: "light-industries-sector", name: "Light Industries", group: "INDUSTRIES", tile: "light-industries-1-2" },
  { slug: "heavy-industries", page: "heavy-industries-sector", name: "Heavy Industries", group: "INDUSTRIES", tile: "heavy-industries-1-2" },
];

const BANNER_LINKS = ["/products/category/ground-mounting-systems", "/products/category/fixing-fastening-systems", "/products/category/pipe-clamps", "/products/category/fxt-heavy-rail-profiles"];

export function findRepoRoot(start = process.cwd()) {
  let current = start;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(path.join(current, "pnpm-workspace.yaml"))) return current;
    current = path.resolve(current, "..");
  }
  return path.resolve(__dirname, "../../..");
}

const clean = (value: string) =>
  value
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
const slugify = (value: string) =>
  clean(decodeURIComponent(value))
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
const norm = (value: string) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
const unique = <T,>(list: T[]) => [...new Set(list.filter(Boolean))] as T[];
const lines = (text: string) => text.split("\n").map((l) => clean(l.replace(/^[•\-–]\s*/, ""))).filter(Boolean);

function decodeEntities(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export async function importFixotec(prisma: PrismaClient, options: { root?: string; log?: (msg: string) => void } = {}) {
  const root = options.root || findRepoRoot();
  const log = options.log || ((msg: string) => console.log(msg));
  const dataDir = path.join(root, "storage", "import", "fixotec");
  const storageRoot = path.join(root, "storage");
  if (!existsSync(path.join(dataDir, "products.json"))) {
    log(`No Fixotec snapshot at ${dataDir}; run scripts/import-fixotec/crawl.mjs first.`);
    return null;
  }
  const read = <T,>(name: string, fallback: T): T => (existsSync(path.join(dataDir, name)) ? JSON.parse(readFileSync(path.join(dataDir, name), "utf8")) : fallback);
  const manifest = read<Manifest>("manifest.json", {});
  const categories = read<SourceCategory[]>("categories.json", []);
  const products = read<SourceProduct[]>("products.json", []);
  const media = read<SourceMedia[]>("media.json", []);
  const posts = read<SourcePost[]>("posts.json", []);
  const { pages, banners } = read<{ pages: Record<string, Block[]>; banners: string[][] }>("blocks.json", { pages: {}, banners: [] });

  const report = {
    startedAt: new Date().toISOString(),
    categories: 0,
    products: 0,
    variants: 0,
    variantsRetired: 0,
    segments: 0,
    sectors: 0,
    services: 0,
    posts: 0,
    postsPublished: 0,
    documents: 0,
    documentsLinked: 0,
    duplicatePdfsSkipped: 0,
    filesCopied: 0,
    productsWithoutImages: [] as string[],
    productsWithoutDatasheet: [] as string[],
    unmatchedPdfs: [] as string[],
    missingFiles: [] as string[],
    demoProductsHidden: [] as string[],
  };

  const stripSize = (url: string) => url.replace(/-\d+x\d+(?=\.(png|jpe?g|webp|gif)$)/i, "");
  const entryFor = (url?: string | null) => {
    if (!url) return null;
    const candidates = [url, stripSize(url), url.replace(/^http:/, "https:")];
    for (const candidate of candidates) if (manifest[candidate]?.file) return manifest[candidate];
    return null;
  };

  // Copies a downloaded file into storage/<media|documents>/fixotec/... and returns the storage key.
  const store = (url?: string | null) => {
    const entry = entryFor(url);
    if (!entry?.file) {
      if (url) report.missingFiles.push(url);
      return null;
    }
    const rel = entry.file.replace(/^uploads\//, "");
    const isPdf = /\.pdf$/i.test(rel);
    const key = `${isPdf ? "documents" : "media"}/fixotec/${rel}`;
    const source = path.join(dataDir, "files", entry.file);
    const target = path.join(storageRoot, key);
    if (!existsSync(source)) {
      report.missingFiles.push(url || rel);
      return null;
    }
    if (!existsSync(target) || statSync(target).size !== statSync(source).size) {
      mkdirSync(path.dirname(target), { recursive: true });
      copyFileSync(source, target);
      report.filesCopied += 1;
    }
    return key;
  };
  const storeAll = (urls: Array<string | null | undefined>) => unique(urls.map((u) => store(u)).filter((k): k is string => Boolean(k)));

  // ---------- retire the demo catalogue from the public site ----------
  for (const sku of DEMO_PRODUCT_SKUS) {
    const demo = await prisma.product.findUnique({ where: { sku } });
    if (!demo) continue;
    await prisma.product.update({
      where: { id: demo.id },
      data: { published: false, slug: demo.slug.startsWith("erp-") ? demo.slug : `erp-${demo.slug}` },
    });
    report.demoProductsHidden.push(sku);
  }

  // ---------- categories ----------
  const tagSlugs = new Set(Object.keys(SEGMENT_TAGS));
  const sourceById = new Map(categories.map((c) => [c.id, c]));
  const catSlug = (c: SourceCategory) => slugify(c.slug);
  const homeOrder = (pages.home || []).filter((b) => b.level === 2).map((b) => norm(b.heading));
  const categoryIds = new Map<string, string>();
  const realCategories = categories.filter((c) => !tagSlugs.has(catSlug(c)));
  const ordered = [...realCategories.filter((c) => !c.parent), ...realCategories.filter((c) => c.parent)];
  for (const c of ordered) {
    const slug = catSlug(c);
    const parentSource = c.parent ? sourceById.get(c.parent) : undefined;
    const parentId = parentSource ? categoryIds.get(catSlug(parentSource)) || null : null;
    const name = clean(decodeEntities(c.name)).replace(/Pro\?le/g, "Profile");
    const orderIndex = homeOrder.indexOf(norm(name));
    const imageKey = store(c.image?.src);
    const data = { name, parentId, imageKey, sortOrder: orderIndex >= 0 ? orderIndex : 50 };
    const row = await prisma.productCategory.upsert({ where: { slug }, update: data, create: { slug, ...data } });
    categoryIds.set(slug, row.id);
    report.categories += 1;
  }

  // ---------- documents (datasheets + catalogue), deduplicated by file hash ----------
  const pdfMedia = media.filter((m) => m.mime === "application/pdf");
  if (!pdfMedia.some((m) => m.url === CATALOGUE_URL)) pdfMedia.push({ id: 0, title: "Fixotec Catalogue", mime: "application/pdf", url: CATALOGUE_URL, date: "2023-02-01" });
  const pdfProduct = new Map<string, string>();
  const productBySlug = new Map<string, string>();

  // ---------- products ----------
  const families = new Map<string, string>();
  for (const p of products) {
    const slug = slugify(p.slug);
    const cats = p.categories.map((c) => ({ ...c, slug: slugify(c.slug) }));
    const segments = unique(cats.map((c) => SEGMENT_TAGS[c.slug]).filter(Boolean));
    const real = cats.filter((c) => !tagSlugs.has(c.slug) && categoryIds.has(c.slug));
    const child = real.find((c) => {
      const source = categories.find((s) => catSlug(s) === c.slug);
      return source?.parent && real.some((r) => { const parent = sourceById.get(source.parent); return parent && catSlug(parent) === r.slug; });
    });
    const primary = child || real.find((c) => categories.find((s) => catSlug(s) === c.slug)?.parent) || real[0];
    const topSource = (() => {
      let source = categories.find((s) => catSlug(s) === primary?.slug);
      while (source?.parent && sourceById.get(source.parent)) source = sourceById.get(source.parent);
      return source;
    })();
    let familyId: string | null = null;
    if (topSource) {
      const familySlug = catSlug(topSource);
      if (!families.has(familySlug)) {
        const name = clean(decodeEntities(topSource.name)).replace(/Pro\?le/g, "Profile");
        const family = await prisma.productFamily.upsert({ where: { slug: familySlug }, update: { name }, create: { slug: familySlug, name } });
        families.set(familySlug, family.id);
      }
      familyId = families.get(familySlug) || null;
    }

    const name = clean(p.name);
    const imageKeys = storeAll([...p.gallery, ...p.variations.map((v) => v.image)]);
    if (!imageKeys.length) report.productsWithoutImages.push(slug);
    const attr = (label: string) => (p.attributes[label] || []).map(clean);
    const finish = attr("Surface Finish").join(", ") || null;
    const range = (values: string[]) => (values.length > 1 ? `${values[0]} – ${values[values.length - 1]}` : values[0] || null);
    const applications = (p.sections["Application"] || []).map(clean);
    const features = (p.sections["Features & Benefits"] || []).map(clean);
    const description = clean(p.shortDescription) || applications[0] || name;
    const technical = clean(p.descriptionText || "");
    const data = {
      name,
      familyId,
      categoryId: primary ? categoryIds.get(primary.slug) || null : null,
      description,
      technicalDescription: technical.length > 20 ? technical : null,
      applications,
      features,
      segments,
      finish,
      coating: finish,
      thread: attr("Thread").join(", ") || null,
      pipeSize: range(attr("Pipe size (inch)").length ? attr("Pipe size (inch)") : attr("Outer Diameter")),
      lengthLabel: range(attr("Length (mm)")),
      imageKeys,
      heroImageKey: imageKeys[0] || null,
      sourceUrl: p.url,
      published: true,
      metaTitle: `${name} | Fixotec Pipe Supports`,
      metaDescription: `${name}: ${description}. German-engineered MEP support system by Fixotec.`.slice(0, 300),
    };
    const sku = `FX-${slug.toUpperCase()}`.slice(0, 60);
    const product = await prisma.product.upsert({
      where: { slug },
      update: data,
      create: { ...data, slug, sku, hsn: "73089090", supplyMode: "MAKE", manufacturingMethod: "Fabricated" },
    });
    productBySlug.set(slug, product.id);
    report.products += 1;
    for (const url of p.pdfs) pdfProduct.set(url, product.id);

    const variations = p.variations.length
      ? p.variations
      : [{ variationId: p.id, sku: "", description: name, attributes: {}, image: p.gallery[0] || null, active: true }];
    const keep: string[] = [];
    for (const v of variations) {
      const articleNumber = clean(v.sku) || `FX-${v.variationId}`;
      keep.push(articleNumber);
      const attrs = Object.fromEntries(Object.entries(v.attributes).map(([k, val]) => [clean(k), clean(String(val))]));
      const variantName = clean(v.description) || [name, ...Object.values(attrs)].join(" ");
      await prisma.productVariant.upsert({
        where: { articleNumber },
        update: { productId: product.id, name: variantName, attributes: attrs, active: v.active !== false },
        create: {
          productId: product.id,
          articleNumber,
          sku: articleNumber,
          name: variantName,
          attributes: attrs,
          purchaseCost: 0,
          manufacturingCost: 0,
          standardPrice: 0,
        },
      });
      report.variants += 1;
    }
    const retired = await prisma.productVariant.updateMany({
      where: { productId: product.id, articleNumber: { notIn: keep, startsWith: "FX-" }, active: true },
      data: { active: false },
    });
    report.variantsRetired += retired.count;
  }

  const productNames = (await prisma.product.findMany({ where: { published: true }, select: { id: true, name: true, slug: true } })).map((p) => ({ ...p, key: norm(p.name) }));
  const sizeCodeFamilies: Array<[RegExp, string]> = [
    [/^FXT \d+ \d+/i, "fxt-heavy-rail-profiles"],
    [/^FXC \d+ \d+/i, "fxc-mounting-channels"],
    [/^FXR \d+ \d+/i, "fxr-mounting-rails"],
  ];
  // Size-coded sheets map to their profile family; otherwise drop trailing words until a product name matches.
  const matchPdf = (title: string): string | null => {
    const bare = title.replace(/\b(datasheet|data sheet|tds|technical data)\b/gi, "").replace(/\s+/g, " ").trim();
    for (const [pattern, slug] of sizeCodeFamilies) if (pattern.test(bare) && productBySlug.has(slug)) return productBySlug.get(slug) || null;
    const words = bare.split(" ");
    for (let n = words.length; n >= 1; n -= 1) {
      const key = norm(words.slice(0, n).join(" "));
      const exact = productNames.find((p) => p.key === key);
      if (exact) return exact.id;
      if (n === 1) break;
      const partial = productNames.filter((p) => key.startsWith(p.key) || p.key.startsWith(key)).sort((a, b) => a.key.length - b.key.length)[0];
      if (partial) return partial.id;
    }
    return null;
  };
  const seenHashes = new Set<string>();
  let catalogueDocumentId: string | null = null;
  for (const m of pdfMedia) {
    const entry = entryFor(m.url);
    if (!entry?.file) {
      report.missingFiles.push(m.url);
      continue;
    }
    if (entry.sha256 && seenHashes.has(entry.sha256)) {
      report.duplicatePdfsSkipped += 1;
      continue;
    }
    if (entry.sha256) seenHashes.add(entry.sha256);
    const key = store(m.url);
    if (!key) continue;
    const isCatalogue = m.url === CATALOGUE_URL;
    const title = clean(decodeEntities(m.title || path.basename(m.url, ".pdf")).replace(/[-_]+/g, " ")).replace(/\s+/g, " ").trim();
    let productId = pdfProduct.get(m.url) || null;
    if (!productId && !isCatalogue) productId = matchPdf(title);
    if (productId) report.documentsLinked += 1;
    else if (!isCatalogue) report.unmatchedPdfs.push(m.url.split("/uploads/")[1] || m.url);
    const fileName = path.basename(entry.file);
    const docData = {
      title: isCatalogue ? "Fixotec Product Catalogue" : title,
      category: isCatalogue ? "CATALOGUE" : "DATASHEET",
      entityType: productId ? "product" : null,
      entityId: productId,
      audiences: AUDIENCES,
    };
    const existing = await prisma.documentVersion.findFirst({ where: { storageKey: key }, select: { documentId: true } });
    let documentId: string;
    if (existing) {
      await prisma.document.update({ where: { id: existing.documentId }, data: docData });
      documentId = existing.documentId;
    } else {
      const created = await prisma.document.create({
        data: {
          ...docData,
          versions: {
            create: {
              version: 1,
              status: "APPROVED",
              fileName,
              mimeType: "application/pdf",
              sizeBytes: entry.bytes || statSync(path.join(storageRoot, key)).size,
              storageKey: key,
              notes: `Imported from ${m.url}`,
            },
          },
        },
      });
      documentId = created.id;
    }
    if (isCatalogue) catalogueDocumentId = documentId;
    report.documents += 1;
  }
  const withDocs = new Set((await prisma.document.findMany({ where: { entityType: "product", category: "DATASHEET" }, select: { entityId: true } })).map((d) => d.entityId));
  report.productsWithoutDatasheet = [...productBySlug.entries()].filter(([, id]) => !withDocs.has(id)).map(([slug]) => slug);

  // ---------- segments ----------
  const textOf = (page: string) => pages[page] || [];
  const featureLine = (b: Block) => (b.text ? `${b.heading}|${lines(b.text).join(" ")}` : b.heading);
  for (const [index, seg] of SEGMENTS.entries()) {
    const blocks = textOf(seg.page);
    const intro = blocks.find((b) => b.level === 1) || blocks.find((b) => b.level === 2);
    const range = blocks.find((b) => /top .*(solution|range)/i.test(b.heading));
    const featureStart = blocks.findIndex((b) => /^features & benefits$/i.test(b.heading));
    const features = featureStart >= 0 ? blocks.slice(featureStart + 1).filter((b) => b.level === 5).map((b) => b.heading) : [];
    const why = (() => {
      const start = blocks.findIndex((b) => /why industries trust/i.test(b.heading));
      return start >= 0 ? blocks.slice(start + 1).filter((b) => b.level === 4).map(featureLine) : [];
    })();
    const paragraphs = intro ? lines(intro.text) : [];
    const segmentProducts = await prisma.product.findMany({ where: { published: true, segments: { has: seg.slug } }, select: { heroImageKey: true }, take: 1 });
    const data = {
      name: seg.name,
      summary: paragraphs[0] || `${seg.name} support systems by Fixotec.`,
      body: [...paragraphs.slice(1), range ? lines(range.text).join(" ") : ""].filter(Boolean).join("\n\n"),
      applications: [seg.name],
      features: unique([...features, ...why]),
      imageKey: segmentProducts[0]?.heroImageKey || null,
      metaTitle: intro ? `${intro.heading} | Fixotec` : `${seg.name} | Fixotec`,
      metaDescription: (paragraphs[0] || "").slice(0, 300) || null,
      published: true,
      sortOrder: index,
    };
    await prisma.solution.upsert({ where: { slug: seg.slug }, update: data, create: { slug: seg.slug, ...data } });
    report.segments += 1;
  }
  await prisma.solution.updateMany({ where: { slug: { notIn: SEGMENTS.map((s) => s.slug) } }, data: { published: false } });

  // ---------- sectors ----------
  const homeImages = (pages.home || []).flatMap((b) => b.images);
  for (const [index, sector] of SECTORS.entries()) {
    const blocks = textOf(sector.page);
    const intro = blocks.find((b) => b.level === 1);
    const introIndex = intro ? blocks.indexOf(intro) : 0;
    const benefitHeading = blocks.findIndex((b, i) => i > introIndex && b.level === 2 && blocks[i + 1]?.level === 4);
    const areas = blocks.filter((b, i) => b.level === 2 && i > introIndex && (benefitHeading < 0 || i < benefitHeading));
    const benefits = benefitHeading >= 0 ? blocks.slice(benefitHeading + 1).filter((b) => b.level === 4) : [];
    const closing = blocks.filter((b, i) => b.level === 2 && benefitHeading >= 0 && i > benefitHeading).pop();
    const allImages = blocks.flatMap((b) => b.images);
    const landscape = allImages.find((u) => /landscape/i.test(u)) || allImages[0];
    const tile = homeImages.find((u) => u.includes(sector.tile));
    const paragraphs = intro ? lines(intro.text) : [];
    const benefitLines = benefits.map((b) => lines(b.text));
    const outro = benefitLines.flatMap((l) => l.slice(1));
    const body = [
      ...areas.map((a) => `## ${a.heading}\n${lines(a.text).join(" ")}`),
      benefitHeading >= 0 ? `# ${blocks[benefitHeading].heading}\n${lines(blocks[benefitHeading].text).join(" ")}` : "",
      closing || outro.length ? `# ${closing?.heading || "Partner with Fixotec"}\n${[...(closing ? lines(closing.text) : []), ...outro].join(" ")}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    const data = {
      name: sector.name,
      group: sector.group,
      summary: paragraphs[0] || `${sector.name} support systems by Fixotec.`,
      body,
      features: benefits.map((b, i) => (benefitLines[i].length ? `${b.heading}|${benefitLines[i][0]}` : b.heading)),
      imageKey: store(tile) || store(landscape),
      heroImageKey: store(landscape) || store(tile),
      metaTitle: intro ? `${intro.heading} | Fixotec` : `${sector.name} | Fixotec`,
      metaDescription: (paragraphs[0] || "").slice(0, 300) || null,
      published: true,
      sortOrder: index,
    };
    await prisma.industry.upsert({ where: { slug: sector.slug }, update: data, create: { slug: sector.slug, ...data } });
    report.sectors += 1;
  }
  await prisma.industry.updateMany({ where: { slug: { notIn: SECTORS.map((s) => s.slug) } }, data: { published: false } });

  // ---------- service areas ----------
  const serviceBlocks = textOf("services");
  const services = serviceBlocks.filter((b) => b.level === 4);
  for (const [index, s] of services.entries()) {
    const slug = slugify(s.heading);
    const data = { title: s.heading, summary: lines(s.text).join(" "), iconKey: store(s.images[0]), sortOrder: index, published: true };
    await prisma.serviceArea.upsert({ where: { slug }, update: data, create: { slug, ...data } });
    report.services += 1;
  }

  // ---------- news ----------
  const mediaById = new Map(media.map((m) => [m.id, m]));
  const rewriteBody = (html: string) =>
    decodeEntities(
      html
        .replace(/<(script|style|iframe|noscript)[\s\S]*?<\/\1>/gi, "")
        .replace(/\s(srcset|sizes|data-[a-z-]+|style|class|id|loading|decoding)="[^"]*"/gi, "")
        .replace(/https?:\/\/in\.fixotec\.global\/wp-content\/uploads\/[^"'\s)]+/gi, (url) => {
          const key = store(url);
          return key ? `media://${key}` : "";
        })
        .replace(/<img[^>]*src=""[^>]*>/gi, "")
        .replace(/<p>\s*(&nbsp;)?\s*<\/p>/gi, "")
    ).trim();
  for (const post of posts) {
    const slug = slugify(post.slug);
    const featured = post.featuredMedia ? mediaById.get(post.featuredMedia)?.url : null;
    const body = rewriteBody(post.html);
    const firstImage = body.match(/media:\/\/(media\/[^"'\s)]+)/)?.[1] || null;
    const imageKey = store(featured) || firstImage;
    const hasContent = body.replace(/<[^>]+>/g, "").trim().length > 40;
    const data = {
      title: clean(decodeEntities(post.title)),
      excerpt: clean(decodeEntities(post.excerpt)).replace(/\s*\[(…|\.\.\.|&hellip;)\]\s*$/, "…").slice(0, 400) || null,
      body,
      imageKey,
      publishedAt: new Date(post.date),
      sourceUrl: post.url,
      published: hasContent,
    };
    await prisma.post.upsert({ where: { slug }, update: data, create: { slug, ...data } });
    report.posts += 1;
    if (hasContent) report.postsPublished += 1;
  }

  // ---------- CMS blocks ----------
  const cms = async (key: string, value: { title: string; subtitle?: string | null; body?: string | null; data?: unknown }) => {
    const payload = { title: value.title, subtitle: value.subtitle ?? null, body: value.body ?? null, data: (value.data ?? null) as never, published: true };
    await prisma.cmsBlock.upsert({ where: { key }, update: payload, create: { key, ...payload } });
  };
  const home = pages.home || [];
  const bannerTitles = home.filter((b) => b.level === 1 && !/features & benefits|german-engineered/i.test(b.heading));
  const bannerData = bannerTitles.slice(0, 4).map((b, i) => {
    const after = home[home.indexOf(b) + 1];
    const features = after && /features & benefits/i.test(after.heading) ? unique(lines(after.text).filter((l) => l.length > 3 && !/^banner image/i.test(l))) : [];
    const slideImages = (banners[i] || []).filter((u) => !/Banner-vector/i.test(u));
    const mainImage = slideImages.find((u) => /\.webp$/i.test(u)) || slideImages[0];
    return {
      title: b.heading,
      subtitle: lines(b.text).filter((l) => !/^know more$/i.test(l))[0] || "",
      features: features.slice(0, 4),
      imageKey: store(mainImage),
      href: BANNER_LINKS[i] || "/products",
    };
  });
  await cms("banners", { title: "Home banners", data: bannerData });
  const installation = textOf("installation-systems-hvac-support-systems");
  await cms("hero", {
    title: "German-engineered installation & support systems",
    subtitle: "Modular MEP supports, pipe clamps and BIM services for HVAC, plumbing, electrical and fire-fighting installations.",
    body: lines(installation.find((b) => b.level === 1)?.text || "").join(" ") || null,
  });
  const milestoneBlock = home.find((b) => /our milestones/i.test(b.heading));
  const milestoneLines = milestoneBlock ? lines(milestoneBlock.text).map((l) => l.replace(/\s+\+/, "+").replace(/\s+%/, "%")) : [];
  const milestones: Array<{ value: string; label: string }> = [];
  for (let i = 0; i + 1 < milestoneLines.length; i += 2) milestones.push({ value: milestoneLines[i], label: milestoneLines[i + 1] });
  await cms("milestones", { title: "Our milestones", data: milestones.length ? milestones : [{ value: "2021", label: "Established" }, { value: "100+", label: "Projects Completed" }, { value: "30+", label: "Countries Served" }, { value: "100%", label: "Quality Assurance" }] });
  await cms("contact", {
    title: "Fixotec Pipe Supports Pvt. Ltd.",
    data: {
      company: "Fixotec Pipe Supports Pvt. Ltd.",
      address: "402, 4th Floor, Coral Plaza, 21st Road, Wagle Industrial Estate, Thane (W), Thane-400604",
      phones: ["+91 8692004400", "+91 22 65011065"],
      email: "info@in.fixotec.global",
      mapUrl: "https://www.google.com/maps/search/?api=1&query=Coral+Plaza+Wagle+Industrial+Estate+Thane",
      social: {
        linkedin: "https://www.linkedin.com/company/fixotec-pipe-supports-india",
        instagram: "https://www.instagram.com/fixotec_india/",
        youtube: "https://www.youtube.com/channel/UCw5YeHNOPcEuQdaeBId219A",
        twitter: "https://twitter.com/fixotec_india",
      },
    },
  });
  const aboutBlocks = textOf("about-us");
  const about = aboutBlocks.filter((b) => b.level === 2);
  const spareAboutImages = aboutBlocks.filter((b) => b.level !== 2).flatMap((b) => b.images);
  await cms("about", {
    title: "About Fixotec",
    subtitle: "German-engineered modular support systems for the MEP industry.",
    data: about.map((b) => {
      const [title, ...rest] = lines(b.text);
      const image = b.images[0] || (b.heading === about[0]?.heading ? spareAboutImages.shift() : undefined);
      return { heading: b.heading, title: title || b.heading, text: rest.join("\n\n"), imageKey: store(image) };
    }),
  });
  const career = textOf("career");
  const openingsStart = career.findIndex((b) => /current job openings/i.test(b.heading));
  const openings = unique(
    career
      .slice(openingsStart + 1)
      .filter((b) => b.level === 2 && /full[- ]?time|part[- ]?time|contract/i.test(b.text))
      .map((b) => JSON.stringify({ title: b.heading, location: lines(b.text)[0] || "", type: lines(b.text)[1] || "Full-time" }))
  ).map((s) => JSON.parse(s));
  await cms("careers", {
    title: career[0]?.heading || "Building Careers, Shaping Futures.",
    body: lines(career[0]?.text || "").join(" "),
    data: {
      values: career.filter((b) => b.level === 4).map((b) => ({ title: b.heading, text: lines(b.text).join(" ") })),
      openings,
      email: "info@in.fixotec.global",
    },
  });
  const servicesIntro = serviceBlocks.find((b) => b.level === 2);
  await cms("services", { title: servicesIntro?.heading.replace(/\s*\.\.\.$/, "") || "Our design and technical teams provide support", body: lines(servicesIntro?.text || "").join(" ") });
  const why = textOf("hvac");
  const whyStart = why.findIndex((b) => /why industries trust/i.test(b.heading));
  await cms("trust", {
    title: "Why industries trust Fixotec",
    data: whyStart >= 0 ? why.slice(whyStart + 1).filter((b) => b.level === 4).map((b) => b.heading) : ["German Engineered Products", "Future-Ready Solutions", "Quality Control", "Experienced Experts", "Technical Support"],
  });
  await cms("why", {
    title: "Why industries trust Fixotec",
    data: whyStart >= 0 ? why.slice(whyStart + 1).filter((b) => b.level === 4).map((b) => ({ title: b.heading, text: lines(b.text).join(" ") })) : [],
  });
  const favicon = Object.keys(manifest).find((u) => /cropped-Fixotec-Favicon-01\.png$/i.test(u)) || Object.keys(manifest).find((u) => /Favicon/i.test(u) && /\.png$/i.test(u));
  const logoWhite = Object.keys(manifest).find((u) => /Fixotec[-_]?White.*\.png$/i.test(u));
  await cms("brand", {
    title: "Fixotec",
    subtitle: "German-Engineered Installation Systems & Support Systems",
    data: { logoKey: store(LOGO_URL), logoWhiteKey: store(logoWhite), faviconKey: store(favicon), accent: "#E21F26" },
  });
  await cms("catalogue", {
    title: "Fixotec Product Catalogue",
    subtitle: "Complete range of modular support systems, pipe clamps, channels and fixings.",
    data: { documentId: catalogueDocumentId },
  });

  report.missingFiles = unique(report.missingFiles);
  const finished = { ...report, finishedAt: new Date().toISOString() };
  writeFileSync(path.join(dataDir, "import-report.json"), JSON.stringify(finished, null, 2));
  log(
    `Fixotec import: ${report.categories} categories, ${report.products} products, ${report.variants} variants, ${report.documents} documents (${report.documentsLinked} linked, ${report.duplicatePdfsSkipped} duplicates skipped), ${report.segments} segments, ${report.sectors} sectors, ${report.services} services, ${report.posts} posts (${report.postsPublished} published). Unmatched PDFs: ${report.unmatchedPdfs.length}. Products without images: ${report.productsWithoutImages.length}. Missing files: ${report.missingFiles.length}.`
  );
  return finished;
}

export function runCli() {
  return (async () => {
    const root = findRepoRoot();
    const envFile = path.join(root, ".env");
    if (existsSync(envFile)) {
      for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
        const trimmed = line.trim();
        const idx = trimmed.indexOf("=");
        if (!trimmed || trimmed.startsWith("#") || idx < 0) continue;
        const key = trimmed.slice(0, idx).trim().replace(/^\uFEFF/, "");
        if (!process.env[key]) process.env[key] = trimmed.slice(idx + 1).trim();
      }
    }
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    try {
      await importFixotec(prisma, { root });
    } finally {
      await prisma.$disconnect();
    }
  })().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

// Run directly: npx tsx prisma/import-fixotec.ts
if (require.main === module) void runCli();