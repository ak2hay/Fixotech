import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const N = 1 << 15;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const MAX_MEM = 128 * N * R * 2;

/** Format: scrypt$N$r$p$saltHex$hashHex. Legacy `salt:hash` (N=16384, r=8, p=1) is still verified. */
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LENGTH, { N, r: R, p: P, maxmem: MAX_MEM }).toString("hex");
  return `scrypt$${N}$${R}$${P}$${salt}$${hash}`;
}

function parse(stored: string) {
  if (stored.startsWith("scrypt$")) {
    const [, n, r, p, salt, hash] = stored.split("$");
    const params = { N: Number(n), r: Number(r), p: Number(p) };
    if (!salt || !hash || !Number.isInteger(params.N) || params.N > 1 << 20 || params.r > 32 || params.p > 16) return null;
    return { salt, hash, ...params };
  }
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return null;
  return { salt, hash, N: 16384, r: 8, p: 1 };
}

export function verifyPassword(password: string, stored: string) {
  const parsed = parse(stored);
  if (!parsed) return false;
  const actual = Buffer.from(parsed.hash, "hex");
  const expected = scryptSync(password, parsed.salt, actual.length || KEY_LENGTH, { N: parsed.N, r: parsed.r, p: parsed.p, maxmem: 128 * parsed.N * parsed.r * 2 });
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/** True when the stored hash uses weaker parameters than the current defaults and should be re-hashed on next login. */
export function needsRehash(stored: string) {
  const parsed = parse(stored);
  return !parsed || parsed.N < N || parsed.r < R || parsed.p < P;
}

const DUMMY_HASH = hashPassword(randomBytes(16).toString("hex"));

/** Burns the same CPU time as a real check so unknown emails can't be detected by response timing. */
export function dummyVerify(password: string) {
  verifyPassword(password, DUMMY_HASH);
  return false;
}
