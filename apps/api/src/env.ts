import { existsSync, readFileSync } from "fs";
import path from "path";
import { z } from "zod";

function apply(file: string) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim().replace(/^\uFEFF/, "");
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const candidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../../.env"),
  path.resolve(__dirname, "../../../.env"),
  path.resolve(__dirname, "../../../../.env"),
];
for (const file of candidates) apply(file);

const PLACEHOLDER_SECRETS = new Set(["replace-with-a-long-random-string", "fixotec-dev-only", "changeme", "secret"]);
const optionalUrl = z.preprocess((value) => (value === "" ? undefined : value), z.string().url().optional());
const optionalText = z.preprocess((value) => (value === "" ? undefined : value), z.string().optional());

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    REDIS_URL: optionalText,
    JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
    MFA_ENCRYPTION_KEY: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(32, "MFA_ENCRYPTION_KEY must be at least 32 characters").optional()),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    TRUST_PROXY: z.string().default("loopback, linklocal, uniquelocal"),
    PROXY_SHARED_SECRET: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(32, "PROXY_SHARED_SECRET must be at least 32 characters").optional()),
    WEB_ORIGIN: optionalText,
    PORTAL_ORIGIN: optionalText,
    ERP_ORIGIN: optionalText,
    API_PUBLIC_URL: optionalUrl,
    STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    STORAGE_ROOT: optionalText,
    S3_ENDPOINT: optionalUrl,
    S3_BUCKET: optionalText,
    S3_ACCESS_KEY: optionalText,
    S3_SECRET_KEY: optionalText,
    S3_REGION: z.string().default("auto"),
    GOOGLE_CLIENT_ID: optionalText,
    MICROSOFT_CLIENT_ID: optionalText,
    MICROSOFT_TENANT_ID: optionalText,
    MICROSOFT_ALLOWED_TENANTS: optionalText,
    SMTP_HOST: optionalText,
    SMTP_PORT: z.coerce.number().int().default(587),
    SMTP_USER: optionalText,
    SMTP_PASS: optionalText,
    SMTP_FROM: optionalText,
    AI_API_KEY: optionalText,
    AI_BASE_URL: optionalUrl,
    AI_MODEL: optionalText,
    ACCOUNTING_TARGET: z.enum(["TALLY", "ZOHO"]).default("TALLY"),
    TALLY_BASE_URL: optionalUrl,
    ZOHO_BOOKS_BASE_URL: optionalUrl,
    ZOHO_BOOKS_TOKEN: optionalText,
    /** Website visitors leave their contact details before downloading CAD/BIM files (creates a CAD_DOWNLOAD lead). */
    CAD_DOWNLOAD_GATE: z.preprocess((value) => (value === "" || value === undefined ? true : String(value).toLowerCase() !== "false"), z.boolean()),
    CAD_MAX_MB: z.coerce.number().int().min(25).max(2048).default(250),
    /** Shared secret the inbound-mail provider (SendGrid/Mailgun/Postmark parse webhook) sends as ?key= or X-Inbound-Key. */
    INBOUND_EMAIL_SECRET: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(24).optional()),
    WHATSAPP_TOKEN: optionalText,
    WHATSAPP_PHONE_NUMBER_ID: optionalText,
    WHATSAPP_VERIFY_TOKEN: optionalText,
    WHATSAPP_APP_SECRET: optionalText,
    WHATSAPP_API_VERSION: z.string().default("v21.0"),
    /** GST Suvidha Provider used for e-invoice (IRN) and e-way bills. SANDBOX returns deterministic fake IRNs for testing. */
    GSP_PROVIDER: z.enum(["NONE", "SANDBOX", "GENERIC"]).default("NONE"),
    GSP_BASE_URL: optionalUrl,
    GSP_CLIENT_ID: optionalText,
    GSP_CLIENT_SECRET: optionalText,
    GSP_USERNAME: optionalText,
    GSP_PASSWORD: optionalText,
    GSTIN: optionalText,
    RAZORPAY_KEY_ID: optionalText,
    RAZORPAY_KEY_SECRET: optionalText,
    RAZORPAY_WEBHOOK_SECRET: optionalText,
    /** Encrypts employee PAN, Aadhaar and bank account numbers at rest. Falls back to MFA_ENCRYPTION_KEY. */
    PII_ENCRYPTION_KEY: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(32, "PII_ENCRYPTION_KEY must be at least 32 characters").optional()),
    CAPTCHA_SECRET: optionalText,
    CAPTCHA_VERIFY_URL: optionalUrl,
    SENTRY_DSN: optionalUrl,
    SENTRY_ENVIRONMENT: optionalText,
    SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0),
    SWAGGER_ENABLED: z.preprocess((value) => (value === "" || value === undefined ? undefined : String(value).toLowerCase() === "true"), z.boolean().optional()),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    BODY_LIMIT: z.string().default("1mb"),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;
    if (PLACEHOLDER_SECRETS.has(env.JWT_SECRET.toLowerCase())) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["JWT_SECRET"], message: "JWT_SECRET is still the example value" });
    if (!env.REDIS_URL) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["REDIS_URL"], message: "REDIS_URL is required in production (rate limits and background jobs)" });
    if (!env.MFA_ENCRYPTION_KEY) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["MFA_ENCRYPTION_KEY"], message: "MFA_ENCRYPTION_KEY is required in production" });
    if (env.MICROSOFT_CLIENT_ID && (!env.MICROSOFT_TENANT_ID || env.MICROSOFT_TENANT_ID === "common") && !env.MICROSOFT_ALLOWED_TENANTS) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["MICROSOFT_TENANT_ID"], message: "Pin MICROSOFT_TENANT_ID or set MICROSOFT_ALLOWED_TENANTS" });
    }
    if (env.STORAGE_DRIVER === "s3" && (!env.S3_BUCKET || !env.S3_ACCESS_KEY || !env.S3_SECRET_KEY)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["S3_BUCKET"], message: "S3 storage needs S3_BUCKET, S3_ACCESS_KEY and S3_SECRET_KEY" });
    }
  });

export type Env = z.infer<typeof schema>;

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const problems = parsed.error.issues.map((issue) => `  - ${issue.path.join(".") || "env"}: ${issue.message}`).join("\n");
  console.error(`Invalid environment configuration:\n${problems}`);
  process.exit(1);
}

export const env: Env = parsed.data;
