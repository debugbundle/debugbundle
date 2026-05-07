import { Redis } from "ioredis";

import type { CreateRedisQueueClientInput, IngestionRateLimiter, IngestionRateLimitResult } from "./types.js";

const DEFAULT_WINDOW_MS = 60_000;
const RATE_LIMITER_TTL_BUFFER_MS = 1_000;

function normalizeWindowMs(): number {
  return DEFAULT_WINDOW_MS;
}

function normalizeRetryAfterMs(value: number | null, fallbackMs: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return fallbackMs;
  }

  return Math.trunc(value);
}

export function createRedisIngestionRateLimiter(
  input: CreateRedisQueueClientInput
): IngestionRateLimiter & { close(): Promise<void> } {
  const redis = new Redis(input.redisUrl);
  const windowMs = normalizeWindowMs();
  const script = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local cost = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])
local current = tonumber(redis.call("GET", key) or "0")

if (current + cost) > limit then
  local retry = redis.call("PTTL", key)
  if retry < 0 then
    retry = ttl
  end
  return {0, current, retry}
end

current = redis.call("INCRBY", key, cost)
if current == cost then
  redis.call("PEXPIRE", key, ttl)
end

local retry = redis.call("PTTL", key)
if retry < 0 then
  retry = ttl
end

return {1, current, retry}
`;

  return {
    async claimEvents(request): Promise<IngestionRateLimitResult> {
      const normalizedCost = Math.max(0, Math.trunc(request.event_count));
      const normalizedLimit = Math.max(1, Math.trunc(request.limit));

      if (normalizedCost === 0) {
        return {
          allowed: true,
          limit: normalizedLimit,
          remaining: normalizedLimit,
          retry_after_ms: 0
        };
      }

      const key = `ingestion-rate:${request.project_id}:${request.token_hash}`;
      const result = (await redis.eval(script, 1, key, normalizedLimit, normalizedCost, windowMs)) as [number, number, number] | null;
      const allowed = Number(result?.[0] ?? 0) === 1;
      const used = Number(result?.[1] ?? 0);
      const retryAfterMs = normalizeRetryAfterMs(Number(result?.[2] ?? windowMs), windowMs + RATE_LIMITER_TTL_BUFFER_MS);

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