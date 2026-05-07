import { randomUUID } from "node:crypto";

import { Redis } from "ioredis";

import type { AuthRateLimiter, CreateRedisQueueClientInput, IngestionRateLimitResult } from "./types.js";

const DEFAULT_WINDOW_MS = 60_000;
const RATE_LIMITER_TTL_BUFFER_MS = 1_000;

function normalizeNowMs(now: string | undefined): number {
  if (now === undefined) {
    return Date.now();
  }

  const parsed = new Date(now).getTime();
  return Number.isFinite(parsed) ? Math.trunc(parsed) : Date.now();
}

function normalizeRetryAfterMs(value: number | null, fallbackMs: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return fallbackMs;
  }

  return Math.trunc(value);
}

export function createRedisAuthRateLimiter(input: CreateRedisQueueClientInput): AuthRateLimiter & { close(): Promise<void> } {
  const redis = new Redis(input.redisUrl);
  const windowMs = DEFAULT_WINDOW_MS;
  const ttlMs = windowMs + RATE_LIMITER_TTL_BUFFER_MS;
  const script = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local ttl_ms = tonumber(ARGV[4])
local member = ARGV[5]
local window_start = now - window_ms

redis.call("ZREMRANGEBYSCORE", key, 0, window_start)

local current = tonumber(redis.call("ZCARD", key))
if current >= limit then
  local earliest = redis.call("ZRANGE", key, 0, 0, "WITHSCORES")
  local retry = ttl_ms
  if earliest[2] ~= nil then
    retry = tonumber(earliest[2]) + window_ms - now
  end
  if retry < 1 then
    retry = 1
  end
  redis.call("PEXPIRE", key, ttl_ms)
  return {0, current, retry}
end

redis.call("ZADD", key, now, member)
redis.call("PEXPIRE", key, ttl_ms)

local used = tonumber(redis.call("ZCARD", key))
return {1, used, 0}
`;

  return {
    async claimRequest(request): Promise<IngestionRateLimitResult> {
      const normalizedLimit = Math.max(1, Math.trunc(request.limit));
      const nowMs = normalizeNowMs(request.now);
      const bucket = request.bucket?.trim() || "default";
      const subject = request.subject?.trim() || request.ip;
      const key = `request-rate:${bucket}:${subject}`;
      const result = (await redis.eval(script, 1, key, nowMs, windowMs, normalizedLimit, ttlMs, `${nowMs}:${randomUUID()}`)) as
        | [number, number, number]
        | null;
      const allowed = Number(result?.[0] ?? 0) === 1;
      const used = Number(result?.[1] ?? 0);
      const retryAfterMs = normalizeRetryAfterMs(Number(result?.[2] ?? ttlMs), ttlMs);

      return {
        allowed,
        limit: normalizedLimit,
        remaining: Math.max(0, normalizedLimit - used),
        retry_after_ms: allowed ? 0 : retryAfterMs
      };
    },

    async close(): Promise<void> {
      await redis.quit();
    }
  };
}