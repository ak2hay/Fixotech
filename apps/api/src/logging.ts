import { randomUUID } from "crypto";
import type { IncomingMessage, ServerResponse } from "http";
import type { Params } from "nestjs-pino";
import { env } from "./env";

const REQUEST_ID = /^[A-Za-z0-9._-]{8,128}$/;

export const loggerParams: Params = {
  pinoHttp: {
    level: env.LOG_LEVEL,
    genReqId(req: IncomingMessage, res: ServerResponse) {
      const incoming = req.headers["x-request-id"];
      const id = typeof incoming === "string" && REQUEST_ID.test(incoming) ? incoming : randomUUID();
      res.setHeader("X-Request-Id", id);
      return id;
    },
    autoLogging: { ignore: (req) => (req.url || "").startsWith("/api/v1/health") },
    customLogLevel(_req, res, error) {
      if (error || res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    },
    redact: {
      paths: ["req.headers.authorization", "req.headers.cookie", "req.headers['x-fixotec-proxy-key']", "res.headers['set-cookie']"],
      censor: "[redacted]",
    },
    serializers: {
      req: (req: { id: string; method: string; url: string }) => ({ id: req.id, method: req.method, url: req.url }),
    },
    customProps: (req) => {
      const request = req as IncomingMessage & { ip?: string; user?: { id?: string } };
      return { ip: request.ip, userId: request.user?.id };
    },
  },
};
