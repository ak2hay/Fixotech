import type { MetadataRoute } from "next";
import { load, type CategoryNode, type Industry, type PostCard, type ProductCard, type Solution } from "../lib/content";
import { DEMO_MODE } from "../lib/demo";

export const revalidate = 3600;

const STATIC = ["", "/products", "/segments", "/sectors", "/services", "/resources", "/news", "/about", "/careers", "/contact", "/request-quote"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (DEMO_MODE) return [];
  const base = (process.env.WEB_ORIGIN || "http://localhost:3000").replace(/\/$/, "");
  const [products, categories, segments, sectors, news] = await Promise.all([
    load<ProductCard[]>("/public/products", 3600),
    load<CategoryNode[]>("/public/categories", 3600),
    load<Solution[]>("/public/solutions", 3600),
    load<Industry[]>("/public/industries", 3600),
    load<PostCard[]>("/public/news?limit=500", 3600),
  ]);
  const flatten = (nodes: CategoryNode[]): CategoryNode[] => nodes.flatMap((n) => [n, ...flatten(n.children || [])]);
  const entry = (path: string, priority: number, changeFrequency: "daily" | "weekly" | "monthly" = "weekly", lastModified?: string) => ({ url: `${base}${path}`, priority, changeFrequency, ...(lastModified ? { lastModified } : {}) });

  return [
    ...STATIC.map((p) => entry(p, p === "" ? 1 : 0.8)),
    ...flatten(categories || []).map((c) => entry(`/products/category/${c.slug}`, 0.8)),
    ...(products || []).map((p) => entry(`/products/${p.slug}`, 0.7)),
    ...(segments || []).map((s) => entry(`/segments/${s.slug}`, 0.7)),
    ...(sectors || []).map((s) => entry(`/sectors/${s.slug}`, 0.7)),
    ...(news || []).map((n) => entry(`/news/${n.slug}`, 0.5, "monthly", n.publishedAt)),
  ];
}
