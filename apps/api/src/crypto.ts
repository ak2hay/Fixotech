import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "crypto";
import { env } from "./env";

const PREFIX = "v1:";

function key() {
  if (env.MFA_ENCRYPTION_KEY) return createHash("sha256").update(env.MFA_ENCRYPTION_KEY).digest();
  return Buffer.from(hkdfSync("sha256", env.JWT_SECRET, "fixotec", "mfa-secret", 32));
}

/** AES-256-GCM; output is `v1:<iv>:<tag>:<ciphertext>` in base64url. */
export function seal(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${PREFIX}${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${data.toString("base64url")}`;
}

/** Employee PAN, Aadhaar and bank account numbers. Kept on a separate key so MFA secrets and PII can be rotated independently. */
function piiKey() {
  if (env.PII_ENCRYPTION_KEY) return createHash("sha256").update(env.PII_ENCRYPTION_KEY).digest();
  return Buffer.from(hkdfSync("sha256", env.MFA_ENCRYPTION_KEY || env.JWT_SECRET, "fixotec", "employee-pii", 32));
}

const PII_PREFIX = "p1:";

export function sealPii(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", piiKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${PII_PREFIX}${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${data.toString("base64url")}`;
}

export function unsealPii(value: string) {
  if (!value.startsWith(PII_PREFIX)) throw new Error("Not a sealed PII value");
  const [iv, tag, data] = value.slice(PII_PREFIX.length).split(":");
  const decipher = createDecipheriv("aes-256-gcm", piiKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

/** Keyed hash used for uniqueness checks on encrypted identifiers (same PAN on two employees). */
export function piiHash(kind: string, value: string) {
  return createHmac("sha256", piiKey()).update(`${kind}:${value.replace(/\s/g, "").toUpperCase()}`).digest("hex");
}

/** Values written before encryption was introduced have no prefix and are returned as-is. */
export function unseal(value: string) {
  if (!value.startsWith(PREFIX)) return value;
  const [iv, tag, data] = value.slice(PREFIX.length).split(":");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

export function isSealed(value: string) {
  return value.startsWith(PREFIX);
}

/** Recovery codes are high-entropy, so a fast keyed hash is sufficient. */
export function hashCode(code: string) {
  return createHash("sha256").update(`${env.JWT_SECRET}:${code.toUpperCase()}`).digest("hex");
}

export function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function recoveryCodes(count = 10) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: count }, () => {
    const bytes = randomBytes(8);
    const chars = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
    return `${chars.slice(0, 4)}-${chars.slice(4)}`;
  });
}
