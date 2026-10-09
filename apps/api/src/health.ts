import { Controller, Get, Logger, OnApplicationShutdown, ServiceUnavailableException } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import Redis from "ioredis";
import { env } from "./env";
import { Public } from "./http";
import { PrismaService } from "./prisma.service";

type Check = { ok: boolean; ms: number; error?: string };

async function timed(probe: () => Promise<unknown>, timeoutMs = 2000): Promise<Check> {
  const started = Date.now();
  try {
    await Promise.race([probe(), new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs))]);
    return { ok: true, ms: Date.now() - started };
  } catch (error) {
    return { ok: false, ms: Date.now() - started, error: (error as Error).message.slice(0, 200) };
  }
}

/** Liveness says the process is up; readiness says it can serve traffic (database and, when configured, Redis). */
@Public()
@SkipThrottle()
@Controller("health")
export class HealthController implements OnApplicationShutdown {
  private readonly logger = new Logger("Health");
  private readonly redis?: Redis;

  constructor(private readonly prisma: PrismaService) {
    if (!env.REDIS_URL) return;
    this.redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false, connectionName: "fixotec-health" });
    this.redis.on("error", () => undefined);
  }

  @Get()
  live() {
    return { ok: true, service: "fixotec-one", uptime: Math.round(process.uptime()) };
  }

  @Get("ready")
  async ready() {
    const checks: Record<string, Check> = {
      database: await timed(() => this.prisma.$queryRaw`SELECT 1`),
    };
    if (this.redis) {
      checks.redis = this.redis.status === "ready" ? await timed(() => this.redis!.ping()) : { ok: false, ms: 0, error: `redis ${this.redis.status}` };
    }
    const ok = Object.values(checks).every((check) => check.ok);
    const body = { ok, checks: Object.fromEntries(Object.entries(checks).map(([name, check]) => [name, { ok: check.ok, ms: check.ms }])) };
    if (!ok) {
      this.logger.error({ msg: "Readiness check failed", checks });
      throw new ServiceUnavailableException(body);
    }
    return body;
  }

  async onApplicationShutdown() {
    await this.redis?.quit().catch(() => undefined);
  }
}
