import { Logger, OnApplicationShutdown } from "@nestjs/common";
import { ThrottlerStorage } from "@nestjs/throttler";
import Redis from "ioredis";

type ThrottlerRecord = { totalHits: number; timeToExpire: number; isBlocked: boolean; timeToBlockExpire: number };

const SCRIPT = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
local blocked = redis.call('PTTL', KEYS[2])
if blocked <= 0 and hits > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  blocked = tonumber(ARGV[3])
end
return { hits, ttl, blocked }
`;

/**
 * Shares rate-limit counters across API instances and restarts. If Redis is unreachable the
 * in-process fallback keeps limits in force rather than failing open.
 */
export class RedisThrottlerStorage implements ThrottlerStorage, OnApplicationShutdown {
  private readonly logger = new Logger("Throttler");
  private readonly redis?: Redis;
  private readonly memory = new Map<string, { hits: number; expiresAt: number; blockedUntil: number }>();

  constructor(url?: string) {
    if (!url) return;
    this.redis = new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: false });
    let down = false;
    this.redis.on("error", (error) => {
      if (down) return;
      down = true;
      this.logger.error(`Redis unavailable, using in-memory limits: ${error.message}`);
    });
    this.redis.on("ready", () => {
      if (down) this.logger.log("Redis reconnected; shared rate limits restored");
      down = false;
    });
  }

  async increment(key: string, ttl: number, limit: number, blockDuration: number, throttlerName: string): Promise<ThrottlerRecord> {
    const block = blockDuration > 0 ? blockDuration : ttl;
    if (this.redis && this.redis.status === "ready") {
      try {
        const [hits, remaining, blocked] = (await this.redis.eval(SCRIPT, 2, `throttle:${throttlerName}:${key}`, `throttle:${throttlerName}:${key}:block`, ttl, limit, block)) as [number, number, number];
        return { totalHits: hits, timeToExpire: Math.max(0, Math.ceil(remaining / 1000)), isBlocked: blocked > 0, timeToBlockExpire: Math.max(0, Math.ceil(blocked / 1000)) };
      } catch (error) {
        this.logger.warn(`Throttle lookup failed: ${(error as Error).message}`);
      }
    }
    return this.incrementMemory(`${throttlerName}:${key}`, ttl, limit, block);
  }

  private incrementMemory(key: string, ttl: number, limit: number, block: number): ThrottlerRecord {
    const now = Date.now();
    let entry = this.memory.get(key);
    if (!entry || entry.expiresAt <= now) {
      entry = { hits: 0, expiresAt: now + ttl, blockedUntil: entry?.blockedUntil ?? 0 };
      this.memory.set(key, entry);
    }
    entry.hits += 1;
    if (entry.blockedUntil <= now && entry.hits > limit) entry.blockedUntil = now + block;
    if (this.memory.size > 50_000) {
      for (const [name, value] of this.memory) if (value.expiresAt <= now && value.blockedUntil <= now) this.memory.delete(name);
    }
    return {
      totalHits: entry.hits,
      timeToExpire: Math.ceil((entry.expiresAt - now) / 1000),
      isBlocked: entry.blockedUntil > now,
      timeToBlockExpire: Math.max(0, Math.ceil((entry.blockedUntil - now) / 1000)),
    };
  }

  async onApplicationShutdown() {
    await this.redis?.quit().catch(() => undefined);
  }
}
