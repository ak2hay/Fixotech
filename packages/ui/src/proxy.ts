/**
 * Server-side proxy from a Next.js app to the Fixotec API (server only; never import from client code).
 *
 * The session token lives in an HttpOnly cookie that browser JavaScript cannot read. The proxy copies it into
 * the Authorization header, strips tokens from auth responses, and rejects cross-site writes.
 */

export const SESSION_COOKIE = "fx_session";

const FORWARD_HEADERS = ["accept", "accept-language", "content-type", "if-none-match", "if-modified-since", "range", "user-agent", "x-request-id"];
const STRIP_RESPONSE_HEADERS = ["content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive", "set-cookie", "x-powered-by"];
const TOKEN_ROUTES = new Set(["auth/login", "auth/mfa/verify", "auth/sso", "auth/password"]);
const MAX_BODY_BYTES = 25 * 1024 * 1024;
const TIMEOUT_MS = 60_000;
/** CAD/BIM uploads on local storage stream through the proxy instead of being buffered. */
const LARGE_UPLOAD_ROUTES = new Set(["documents/large"]);
const LARGE_BODY_BYTES = Number(process.env.PROXY_LARGE_UPLOAD_MB || 250) * 1024 * 1024;
/** File downloads and zip bundles can take minutes; the timeout also covers reading the body. */
const SLOW_ROUTE = /(^|\/)(download|bundle|files\.zip)$|^documents\/large$/;
const SLOW_TIMEOUT_MS = 30 * 60_000;

type ProxyOptions = { session?: boolean };

function apiBase() {
  const fallback = process.env.NODE_ENV === "production" ? "" : "http://localhost:4000";
  return (process.env.API_PROXY_URL || process.env.API_PUBLIC_URL || fallback).replace(/\/$/, "");
}

function readCookie(request: Request, name: string) {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return request.headers.get("x-real-ip")?.trim() || forwarded || undefined;
}

function sessionCookie(request: Request, value: string, expires?: Date) {
  const secure = new URL(request.url).protocol === "https:" || process.env.NODE_ENV === "production";
  const parts = [`${SESSION_COOKIE}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (secure) parts.push("Secure");
  if (expires) parts.push(`Expires=${expires.toUTCString()}`);
  if (!value) parts.push("Max-Age=0");
  return parts.join("; ");
}

/** Writes from another site are refused: the browser always sends Origin on cross-site POST/PATCH/DELETE. */
function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") !== "cross-site";
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function proxyApi(request: Request, path: string[], options: ProxyOptions = {}) {
  const api = apiBase();
  if (!api) return new Response("API_PROXY_URL is not set", { status: 502 });
  if (path.some((part) => part === ".." || part === "." || part.includes("\\"))) return new Response("Bad path", { status: 400 });
  const route = path.join("/");
  const write = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  if (write && !sameOrigin(request)) return Response.json({ message: "Cross-site request refused" }, { status: 403 });

  const target = new URL(`${api}/api/v1/${path.map((part) => encodeURIComponent(part)).join("/")}`);
  target.search = new URL(request.url).search;

  const headers = new Headers();
  for (const name of FORWARD_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const token = options.session ? readCookie(request, SESSION_COOKIE) : undefined;
  if (token) headers.set("authorization", `Bearer ${token}`);
  const ip = clientIp(request);
  if (ip && process.env.PROXY_SHARED_SECRET) {
    headers.set("x-fixotec-client-ip", ip);
    headers.set("x-fixotec-proxy-key", process.env.PROXY_SHARED_SECRET);
  }

  let body: ArrayBuffer | ReadableStream<Uint8Array> | undefined;
  const streamed = write && LARGE_UPLOAD_ROUTES.has(route);
  if (write) {
    const limit = streamed ? LARGE_BODY_BYTES : MAX_BODY_BYTES;
    const declared = Number(request.headers.get("content-length") || 0);
    if (declared > limit || (streamed && !declared)) return Response.json({ message: "Upload is too large" }, { status: 413 });
    if (streamed) {
      body = request.body || undefined;
    } else {
      body = await request.arrayBuffer();
      if (body.byteLength > limit) return Response.json({ message: "Upload is too large" }, { status: 413 });
    }
  }

  let response: Response;
  try {
    const init: RequestInit & { duplex?: "half" } = { method: request.method, headers, body, redirect: "manual", signal: AbortSignal.timeout(SLOW_ROUTE.test(route) ? SLOW_TIMEOUT_MS : TIMEOUT_MS), cache: "no-store" };
    if (streamed) init.duplex = "half";
    response = await fetch(target, init);
  } catch (error) {
    const timedOut = (error as Error).name === "TimeoutError";
    return Response.json({ message: timedOut ? "The server took too long to respond" : "The server is unreachable" }, { status: timedOut ? 504 : 502 });
  }

  const outgoing = new Headers(response.headers);
  for (const name of STRIP_RESPONSE_HEADERS) outgoing.delete(name);
  outgoing.set("cache-control", outgoing.get("cache-control") || "no-store");

  if (options.session && route === "auth/logout") {
    outgoing.append("set-cookie", sessionCookie(request, ""));
  }
  if (options.session && response.status === 401 && token) {
    outgoing.append("set-cookie", sessionCookie(request, ""));
  }
  if (options.session && TOKEN_ROUTES.has(route) && response.ok && (response.headers.get("content-type") || "").includes("application/json")) {
    const data = (await response.json()) as Record<string, unknown>;
    const { accessToken, ...rest } = data;
    if (typeof accessToken === "string") {
      const expires = typeof data.expiresAt === "string" ? new Date(data.expiresAt) : undefined;
      outgoing.append("set-cookie", sessionCookie(request, accessToken, expires));
      rest.signedIn = true;
    }
    outgoing.set("content-type", "application/json");
    return new Response(JSON.stringify(rest), { status: response.status, headers: outgoing });
  }
  return new Response(response.body, { status: response.status, headers: outgoing });
}
