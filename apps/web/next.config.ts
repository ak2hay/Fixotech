import type { NextConfig } from "next";

type RemotePattern = { protocol: "http" | "https"; hostname: string; port?: string; pathname: string };

const dev = process.env.NODE_ENV !== "production";
const mediaOrigins = [
  process.env.NEXT_PUBLIC_MEDIA_ORIGIN,
  process.env.API_PROXY_URL,
  process.env.API_PUBLIC_URL,
  process.env.NEXT_PUBLIC_API_URL,
  ...(dev ? ["http://localhost:4000", "http://localhost:4001"] : []),
];

const remotePatterns: RemotePattern[] = [];
for (const origin of mediaOrigins) {
  if (!origin) continue;
  try {
    const url = new URL(origin);
    const pattern: RemotePattern = { protocol: url.protocol.replace(":", "") as "http" | "https", hostname: url.hostname, pathname: "/api/v1/public/media/**" };
    if (url.port) pattern.port = url.port;
    if (!remotePatterns.some((p) => p.hostname === pattern.hostname && p.port === pattern.port && p.protocol === pattern.protocol)) remotePatterns.push(pattern);
  } catch {
    // ignore malformed env values
  }
}

const apiOrigins = [...new Set(remotePatterns.map((p) => `${p.protocol}://${p.hostname}${p.port ? `:${p.port}` : ""}`))].join(" ");
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${apiOrigins}`,
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigins} https://challenges.cloudflare.com${dev ? " ws:" : ""}`,
  "frame-src https://challenges.cloudflare.com https://www.google.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(dev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(process.env.NEXT_PUBLIC_DEMO_MODE !== "false" ? [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] : []),
];

const sectorRedirects: Array<[string, string]> = [
  ["high-rise-buildings-sector", "high-rise-buildings"],
  ["hotels-sector", "hotels"],
  ["hospitals-sector", "hospitals"],
  ["data-center-sector", "data-centers"],
  ["advance-manufacturing-sector", "advanced-manufacturing"],
  ["automotive-manufacturing-sector", "automotive-manufacturing"],
  ["light-industries-sector", "light-industries"],
  ["heavy-industries-sector", "heavy-industries"],
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: { remotePatterns, formats: ["image/avif", "image/webp"], minimumCacheTTL: 60 * 60 * 24 * 30 },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    return [
      ...sectorRedirects.map(([from, to]) => ({ source: `/${from}`, destination: `/sectors/${to}`, permanent: true })),
      { source: "/product-category/fxt-heavy-rail-pro%ef%ac%81le-accessories/:rest*", destination: "/products/category/fxt-heavy-rail-profile-accessories", permanent: true },
      { source: "/product-category/:a/:b", destination: "/products/category/:b", permanent: true },
      { source: "/product-category/:a", destination: "/products/category/:a", permanent: true },
      { source: "/product/:slug", destination: "/products/:slug", permanent: true },
      { source: "/products/:a((?!category)[^/]+)/:b/:slug", destination: "/products/:slug", permanent: true },
      { source: "/products/:a((?!category)[^/]+)/:slug", destination: "/products/:slug", permanent: true },
      { source: "/our-products", destination: "/products", permanent: true },
      { source: "/installation-systems-hvac-support-systems", destination: "/products", permanent: true },
      { source: "/about-us", destination: "/about", permanent: true },
      { source: "/contact-us", destination: "/contact", permanent: true },
      { source: "/career", destination: "/careers", permanent: true },
      { source: "/linkedin-post/:slug", destination: "/news", permanent: true },
      { source: "/solutions", destination: "/segments", permanent: true },
      { source: "/solutions/:slug", destination: "/segments/:slug", permanent: true },
      { source: "/engineering", destination: "/services", permanent: true },
      { source: "/services-2", destination: "/services", permanent: true },
      { source: "/industries", destination: "/sectors", permanent: true },
      { source: "/industries/:slug", destination: "/sectors/:slug", permanent: true },
    ];
  },
};
export default nextConfig;
