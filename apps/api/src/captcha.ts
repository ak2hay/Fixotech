import { BadRequestException } from "@nestjs/common";
import { env } from "./env";

/** Cloudflare Turnstile (or a compatible verifier). Skipped when no secret is configured. */
export async function verifyCaptcha(token: string | undefined, ip: string | undefined) {
  if (!env.CAPTCHA_SECRET) return;
  if (!token) throw new BadRequestException("Complete the verification challenge");
  const url = env.CAPTCHA_VERIFY_URL || "https://challenges.cloudflare.com/turnstile/v0/siteverify";
  const form = new URLSearchParams({ secret: env.CAPTCHA_SECRET, response: token });
  if (ip) form.set("remoteip", ip);
  const response = await fetch(url, { method: "POST", body: form, signal: AbortSignal.timeout(8000) }).catch(() => null);
  const verdict = response?.ok ? ((await response.json().catch(() => null)) as { success?: boolean } | null) : null;
  if (!verdict?.success) throw new BadRequestException("Verification failed. Please try again.");
}
