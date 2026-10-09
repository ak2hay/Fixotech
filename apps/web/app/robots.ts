import type { MetadataRoute } from "next";
import { DEMO_MODE } from "../lib/demo";

export default function robots(): MetadataRoute.Robots {
  if (DEMO_MODE) return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", allow: "/" }, sitemap: `${process.env.WEB_ORIGIN || "http://localhost:3000"}/sitemap.xml` };
}
