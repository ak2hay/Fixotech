const FORWARD_HEADERS = ["accept", "accept-language", "content-type", "if-none-match", "user-agent"];
const STRIP_RESPONSE_HEADERS = ["content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive", "set-cookie", "x-powered-by"];
const MAX_BODY_BYTES = 1024 * 1024;

/** The public site only needs anonymous endpoints, so no credentials are forwarded. */
export async function proxyApi(request: Request, path: string[]) {
  const fallback = process.env.NODE_ENV === "production" ? "" : "http://localhost:4000";
  const api = (process.env.API_PROXY_URL || process.env.API_PUBLIC_URL || fallback).replace(/\/$/, "");
  if (!api) return new Response("API_PROXY_URL is not set", { status: 502 });
  if (path[0] !== "public" || path.some((part) => part === ".." || part === "." || part.includes("\\"))) return new Response("Not found", { status: 404 });
  const target = new URL(`${api}/api/v1/${path.map((part) => encodeURIComponent(part)).join("/")}`);
  target.search = new URL(request.url).search;
  const headers = new Headers();
  for (const name of FORWARD_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const ip = request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (ip && process.env.PROXY_SHARED_SECRET) {
    headers.set("x-fixotec-client-ip", ip);
    headers.set("x-fixotec-proxy-key", process.env.PROXY_SHARED_SECRET);
  }
  const write = request.method !== "GET" && request.method !== "HEAD";
  let body: ArrayBuffer | undefined;
  if (write) {
    body = await request.arrayBuffer();
    if (body.byteLength > MAX_BODY_BYTES) return Response.json({ message: "Request is too large" }, { status: 413 });
  }
  let response: Response;
  try {
    response = await fetch(target, { method: request.method, headers, body, redirect: "manual", signal: AbortSignal.timeout(30_000) });
  } catch {
    return Response.json({ message: "The server is unreachable" }, { status: 502 });
  }
  const outgoing = new Headers(response.headers);
  for (const name of STRIP_RESPONSE_HEADERS) outgoing.delete(name);
  return new Response(response.body, { status: response.status, headers: outgoing });
}
