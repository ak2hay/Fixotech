/**
 * E2E helpers. Run against a seeded API: `pnpm setup && pnpm --filter @fixotec/api dev`, then `pnpm test:e2e`.
 * API_E2E_URL defaults to http://localhost:4000; E2E_PASSWORD defaults to the seed password.
 */
export const API = (process.env.API_E2E_URL || process.env.API_PUBLIC_URL || "http://localhost:4000").replace(/\/$/, "");
const PASSWORD = process.env.E2E_PASSWORD || process.env.SEED_ADMIN_PASSWORD || "ChangeMe!234";

export const USERS = {
  admin: process.env.SEED_ADMIN_EMAIL || "admin@demo.fixotec.test",
  customer: "customer@apexmep.example",
  distributor: "distributor@westline.example",
  consultant: "consultant@northstar.example",
} as const;

export type Result<T = any> = { status: number; body: T };

export async function call<T = any>(path: string, options: { method?: string; body?: unknown; token?: string; headers?: Record<string, string> } = {}): Promise<Result<T>> {
  const headers: Record<string, string> = { ...(options.headers || {}) };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  const response = await fetch(`${API}/api/v1${path}`, { method: options.method || "GET", headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  const text = await response.text();
  let body: any = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* binary or plain text */
  }
  return { status: response.status, body };
}

const tokens = new Map<string, string>();

export async function login(who: keyof typeof USERS) {
  const cached = tokens.get(who);
  if (cached) return cached;
  const result = await call<{ accessToken?: string; mfaRequired?: boolean }>("/auth/login", { method: "POST", body: { email: USERS[who], password: PASSWORD } });
  if (result.status !== 200 && result.status !== 201) throw new Error(`login ${who} failed: ${result.status} ${JSON.stringify(result.body)}`);
  if (!result.body.accessToken) throw new Error(`login ${who} needs MFA; use a test account without MFA`);
  tokens.set(who, result.body.accessToken);
  return result.body.accessToken;
}

export function itemsOf<T = any>(body: unknown): T[] {
  if (Array.isArray(body)) return body as T[];
  const items = (body as { items?: unknown } | null)?.items;
  return Array.isArray(items) ? (items as T[]) : [];
}

/** Recursively collects every key in a JSON payload. */
export function keysIn(value: unknown, found = new Set<string>()) {
  if (Array.isArray(value)) value.forEach((item) => keysIn(item, found));
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      found.add(key);
      keysIn(item, found);
    }
  }
  return found;
}
