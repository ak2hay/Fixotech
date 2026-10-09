import { env } from "./env";
import { reportError } from "./instrument";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { isIP } from "net";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { safeEqual } from "./crypto";
import { AllExceptionsFilter } from "./filters";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true, rawBody: true });
  const logger = app.get(Logger);
  app.useLogger(logger);
  app.set("trust proxy", env.TRUST_PROXY.split(",").map((value) => value.trim()).filter(Boolean));
  app.disable("x-powered-by");
  app.use(trustedProxyClientIp);
  app.useBodyParser("json", { limit: env.BODY_LIMIT });
  app.useBodyParser("urlencoded", { extended: false, limit: env.BODY_LIMIT });
  app.setGlobalPrefix("api/v1");
  app.useGlobalFilters(new AllExceptionsFilter());
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  const origins = [env.WEB_ORIGIN, env.PORTAL_ORIGIN, env.ERP_ORIGIN]
    .flatMap((value) => (value || "").split(","))
    .map((value) => value.trim())
    .filter(Boolean);
  app.enableCors({
    origin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
      if (!origin || origins.some((pattern) => originMatches(pattern, origin))) callback(null, true);
      else callback(null, false);
    },
    credentials: true,
  });
  if (env.SWAGGER_ENABLED ?? env.NODE_ENV !== "production") {
    const config = new DocumentBuilder().setTitle("Fixotec API").setVersion("1").addBearerAuth().build();
    SwaggerModule.setup("api/docs", app, () => SwaggerModule.createDocument(app, config));
  }
  app.enableShutdownHooks();
  await app.listen(env.API_PORT);
  logger.log(`Fixotec API listening on ${env.API_PORT}`, "Bootstrap");
}

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection", reason);
  reportError(reason, { source: "unhandledRejection" });
});

/**
 * The Next.js proxies on Vercel call the API server-to-server, so every visitor would otherwise share
 * Vercel's egress IP. They forward the visitor IP with a shared secret; without the secret the header is ignored.
 */
function trustedProxyClientIp(req: { headers: Record<string, string | string[] | undefined> }, _res: unknown, next: () => void) {
  const key = req.headers["x-fixotec-proxy-key"];
  const ip = req.headers["x-fixotec-client-ip"];
  delete req.headers["x-fixotec-proxy-key"];
  delete req.headers["x-fixotec-client-ip"];
  if (env.PROXY_SHARED_SECRET && typeof key === "string" && typeof ip === "string" && safeEqual(key, env.PROXY_SHARED_SECRET) && isIP(ip.trim())) {
    Object.defineProperty(req, "ip", { value: ip.trim(), configurable: true });
    Object.defineProperty(req, "ips", { value: [ip.trim()], configurable: true });
  }
  next();
}

function originMatches(pattern: string, origin: string) {
  if (pattern === origin) return true;
  if (!pattern.includes("*")) return false;
  const expression = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, "[^./]*")}$`);
  return expression.test(origin);
}

bootstrap().catch((error) => {
  console.error("Fixotec API failed to start", error);
  reportError(error, { source: "bootstrap" });
  process.exit(1);
});
