import * as Sentry from "@sentry/node";
import { env } from "./env";

if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT || env.NODE_ENV,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
  });
}

export function reportError(error: unknown, context: Record<string, unknown> = {}) {
  if (!env.SENTRY_DSN) return;
  Sentry.withScope((scope) => {
    for (const [key, value] of Object.entries(context)) if (value !== undefined) scope.setExtra(key, value);
    if (typeof context.requestId === "string") scope.setTag("requestId", context.requestId);
    Sentry.captureException(error);
  });
}
