import { redirectToLogin } from "@fixotec/ui";

/** Calls go to this app's own /api/v1 proxy, which attaches the HttpOnly session cookie. */
export const API_URL = "";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/v1${path}`, { ...options, headers, credentials: "same-origin" });
  } catch {
    throw new ApiError("Network error. Check your connection and try again.", 0);
  }
  const text = await response.text();
  const data = text ? safeJson(text) : null;
  if (response.status === 401 && !path.startsWith("/auth/login") && !path.startsWith("/auth/mfa")) {
    redirectToLogin(path === "/auth/me" ? "signin" : "expired");
  }
  if (!response.ok) throw new ApiError(messageOf(data, response.status), response.status);
  return data as T;
}

function messageOf(data: { message?: unknown } | null, status: number) {
  const message = data?.message as string | { formErrors?: string[]; fieldErrors?: Record<string, string[]> } | undefined;
  if (typeof message === "string") return message;
  if (message && typeof message === "object") {
    const parts = [...(message.formErrors || []), ...Object.entries(message.fieldErrors || {}).map(([field, errors]) => `${field}: ${errors.join(", ")}`)];
    if (parts.length) return parts.join(" ");
  }
  if (status === 403) return "You do not have permission to do that.";
  if (status === 404) return "Not found.";
  if (status === 429) return "Too many requests. Please wait a moment.";
  if (status >= 500) return "The server had a problem. Please try again.";
  return "Request failed";
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function rowsOf<T = Record<string, unknown>>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === "object" && Array.isArray((payload as { items?: unknown }).items)) {
    return (payload as { items: T[] }).items;
  }
  return [];
}

export function mediaUrl(path?: string | null) {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  const clean = path.startsWith("/public/") ? path : `/public/media/${path.replace(/^\/?(media\/)?/, "")}`;
  return `${API_URL}/api/v1${clean}`;
}

export async function download(path: string, filename: string) {
  const response = await fetch(`${API_URL}/api/v1${path}`, { credentials: "same-origin" });
  if (response.status === 401) redirectToLogin("expired");
  if (!response.ok) throw new ApiError("Download failed", response.status);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Lets the browser stream a large file (CAD/BIM model, zip bundle) straight to disk. */
export function downloadDirect(path: string) {
  const anchor = document.createElement("a");
  anchor.href = `${API_URL}/api/v1${path}`;
  anchor.download = "";
  anchor.rel = "noopener";
  anchor.click();
}

export async function blobUrl(path: string) {
  const response = await fetch(`${API_URL}/api/v1${path}`, { credentials: "same-origin" });
  if (!response.ok) throw new ApiError("Preview unavailable", response.status);
  return URL.createObjectURL(await response.blob());
}
