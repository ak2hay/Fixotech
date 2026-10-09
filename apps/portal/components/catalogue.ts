import { mediaUrl } from "../lib/api";

export type Variant = { id: string; articleNumber: string; name: string; sellPrice?: number | string; attributes?: Record<string, unknown> | null; active?: boolean };
export type Product = {
  id: string;
  sku: string;
  name: string;
  slug: string;
  description?: string | null;
  technicalDescription?: string | null;
  applications?: string[];
  material?: string | null;
  finish?: string | null;
  coating?: string | null;
  loadCapacity?: string | null;
  pipeSize?: string | null;
  leadTimeDays?: number;
  moq?: number | string;
  packSize?: string | null;
  supplyMode?: string;
  heroImageKey?: string | null;
  imageKeys?: string[];
  family?: { name: string } | null;
  category?: { name: string } | null;
  variants: Variant[];
};

export function productImage(product: Pick<Product, "heroImageKey" | "imageKeys">) {
  return mediaUrl(product.heroImageKey || product.imageKeys?.[0]);
}

export function fromPrice(product: Product) {
  const prices = product.variants.map((variant) => Number(variant.sellPrice)).filter((value) => value > 0);
  return prices.length ? Math.min(...prices) : null;
}

export function attributeText(attributes?: Record<string, unknown> | null) {
  if (!attributes || typeof attributes !== "object") return "";
  return Object.entries(attributes)
    .filter(([, value]) => value !== null && value !== "" && typeof value !== "object")
    .map(([key, value]) => `${key}: ${value}`)
    .join(" · ");
}
