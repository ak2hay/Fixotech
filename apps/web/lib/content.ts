const API = process.env.API_PROXY_URL || process.env.API_PUBLIC_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// Absolute origin that browsers and the Next image optimizer can reach for media and downloads.
export const MEDIA_ORIGIN = (process.env.NEXT_PUBLIC_MEDIA_ORIGIN || process.env.API_PROXY_URL || process.env.API_PUBLIC_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/$/, "");

export class ContentUnavailableError extends Error {}

/**
 * Returns null only when the API says the record does not exist (4xx). Server errors and network failures
 * throw at runtime so ISR keeps serving the last good page instead of caching an empty page or a 404.
 * During `next build` failures still resolve to null so a temporarily unreachable API cannot break the build.
 */
export async function load<T>(path: string, revalidate?: number): Promise<T | null> {
  let response: Response;
  try {
    response = await fetch(`${API}/api/v1${path}`, { ...(revalidate ? { next: { revalidate } } : { cache: "no-store" as const }), signal: AbortSignal.timeout(10_000) });
  } catch (error) {
    return unavailable(path, `network error: ${(error as Error).message}`);
  }
  if (response.status >= 500) return unavailable(path, `status ${response.status}`);
  if (!response.ok) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return unavailable(path, "invalid JSON");
  }
}

function unavailable(path: string, reason: string): null {
  if (process.env.NEXT_PHASE === "phase-production-build") return null;
  throw new ContentUnavailableError(`Content API unavailable for ${path} (${reason})`);
}

export function mediaUrl(key?: string | null) {
  if (!key) return null;
  return `${MEDIA_ORIGIN}/api/v1/public/${key.replace(/^\/+/, "")}`;
}

export function downloadUrl(documentId: string) {
  return `${MEDIA_ORIGIN}/api/v1/public/documents/${documentId}/download`;
}

export function formatBytes(bytes?: number | null) {
  if (!bytes) return "";
  return bytes > 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function formatDate(value?: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// Feature strings from the import are "Title|Description".
export function splitFeature(value: string) {
  const [title, ...rest] = value.split("|");
  return { title: title.trim(), text: rest.join("|").trim() };
}

export type ProductCard = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  heroImageKey?: string | null;
  imageKeys: string[];
  finish?: string | null;
  segments: string[];
  category?: { name: string; slug: string } | null;
  variantCount: number;
};

export type Variant = { id: string; articleNumber: string; name: string; attributes: Record<string, string> };
export type DocumentRef = { id: string; title: string; category: string; version: number; fileName?: string; sizeBytes?: number; variant?: string | null };

export type Product = {
  id: string;
  slug: string;
  name: string;
  sku: string;
  description?: string | null;
  technicalDescription?: string | null;
  material?: string | null;
  coating?: string | null;
  finish?: string | null;
  thread?: string | null;
  loadCapacity?: string | null;
  pipeSize?: string | null;
  lengthLabel?: string | null;
  applications?: string[];
  features?: string[];
  segments?: string[];
  imageKeys: string[];
  heroImageKey?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  category?: { name: string; slug: string; parent?: { name: string; slug: string } | null } | null;
  family?: { name: string; slug: string } | null;
  variants?: Variant[];
  documents?: DocumentRef[];
  related?: ProductCard[];
};

export type CategoryNode = { id: string; name: string; slug: string; imageKey?: string | null; description?: string | null; productCount: number; children: CategoryNode[] };

export type Solution = { slug: string; name: string; summary: string; body: string; features?: string[]; imageKey?: string | null; metaTitle?: string | null; metaDescription?: string | null };
export type Industry = { slug: string; name: string; group: string; summary: string; body: string; features?: string[]; imageKey?: string | null; heroImageKey?: string | null; metaTitle?: string | null; metaDescription?: string | null };
export type Study = { slug: string; title: string; location?: string; sector?: string; summary: string; body: string; year?: number };
export type ServiceArea = { slug: string; title: string; summary: string; iconKey?: string | null };
export type PostCard = { slug: string; title: string; excerpt?: string | null; imageKey?: string | null; publishedAt: string };
export type CmsBlock = { key: string; title: string; subtitle?: string | null; body?: string | null; data?: unknown };

export type SiteData = {
  brand: { logoKey?: string; logoWhiteKey?: string; faviconKey?: string } | null;
  contact: { company: string; address: string; phones: string[]; email: string; mapUrl?: string; social?: Record<string, string> } | null;
  catalogue: { id: string; title: string } | null;
  categories: Array<{ name: string; slug: string; imageKey?: string | null; productCount: number; children: Array<{ name: string; slug: string; productCount: number }> }>;
  segments: Array<{ slug: string; name: string; imageKey?: string | null }>;
  sectors: Array<{ slug: string; name: string; group: string; imageKey?: string | null }>;
};

export const FALLBACK_CONTACT = {
  company: "Fixotec Pipe Supports Pvt. Ltd.",
  address: "402, 4th Floor, Coral Plaza, 21st Road, Wagle Industrial Estate, Thane (W), Thane-400604",
  phones: ["+91 8692004400", "+91 22 65011065"],
  email: "info@in.fixotec.global",
};

/** Site chrome (header, footer, metadata) has fallbacks, so an outage degrades it instead of failing every page. */
export const loadSite = () => load<SiteData>("/public/site", 300).catch(() => null);

export function blockOf<T = unknown>(blocks: CmsBlock[] | undefined, key: string) {
  const block = blocks?.find((b) => b.key === key);
  return block ? { ...block, data: block.data as T } : null;
}
