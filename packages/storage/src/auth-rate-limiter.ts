import { createHash, randomUUID } from "node:crypto";

import { Redis } from "ioredis";

import type {
  CreateRedisQueueClientInput,
  IngestionRateLimitResult,
  OpenAiCoordinationService
} from "./types.js";

const DEFAULT_WINDOW_MS = 60_000;
const RATE_LIMITER_TTL_BUFFER_MS = 1_000;
const CONCURRENCY_TTL_BUFFER_MS = 5_000;

function coordinationKey(namespace: string, bucket: string, subject: string): string {
  if (!/^[a-z0-9-]{1,80}$/.test(bucket)) {
    throw new Error("auth_coordination_bucket_invalid");
  }
  const digest = createHash("sha256").update(`${bucket}:${subject}`, "utf8").digest("hex");
  return `${namespace}:${bucket}:${digest}`;
}

function openAiCimdCacheKey(url: string): string {
  const digest = createHash("sha256").update(url, "utf8").digest("hex");
  return `openai-cimd:${digest}`;
}

function openAiClientAssertionKey(issuer: string, jti: string): string {
  const digest = createHash("sha256").update(`${issuer}:${jti}`, "utf8").digest("hex");
  return `openai-client-assertion:${digest}`;
}

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

export function createRedisAuthRateLimiter(
  input: CreateRedisQueueClientInput
): OpenAiCoordinationService & { close(): Promise<void> } {
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
  const acquireConcurrencyScript = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local expires_at = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local ttl_ms = tonumber(ARGV[4])
local lease_id = ARGV[5]

redis.call("ZREMRANGEBYSCORE", key, 0, now)
local current = tonumber(redis.call("ZCARD", key))
if current >= limit then
  local earliest = redis.call("ZRANGE", key, 0, 0, "WITHSCORES")
  local retry = ttl_ms
  if earliest[2] ~= nil then
    retry = tonumber(earliest[2]) - now
  end
  if retry < 1 then
    retry = 1
  end
  redis.call("PEXPIRE", key, ttl_ms)
  return {0, retry}
end

redis.call("ZADD", key, expires_at, lease_id)
redis.call("PEXPIRE", key, ttl_ms)
return {1, 0}
`;

  return {
    async checkAvailability(): Promise<void> {
      const response = await redis.ping();
      if (response !== "PONG") {
        throw new Error("auth_rate_limiter_unavailable");
      }
    },

    async claimRequest(request): Promise<IngestionRateLimitResult> {
      const normalizedLimit = Math.max(1, Math.trunc(request.limit));
      const nowMs = normalizeNowMs(request.now);
      const bucket = request.bucket?.trim() || "default";
      const subject = request.subject?.trim() || request.ip;
      const key = `request-rate:${bucket}:${subject}`;
      const result = (await redis.eval(
        script,
        1,
        key,
        nowMs,
        windowMs,
        normalizedLimit,
        ttlMs,
        `${nowMs}:${randomUUID()}`
      )) as [number, number, number] | null;
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

    async acquireConcurrency(request): Promise<{
      acquired: boolean;
      lease_id: string;
      retry_after_ms: number;
    }> {
      const limit = Math.trunc(request.limit);
      const leaseMs = Math.trunc(request.leaseMs);
      if (limit < 1 || leaseMs < 1 || leaseMs > 10 * 60_000) {
        throw new Error("auth_coordination_concurrency_input_invalid");
      }
      const nowMs = Date.now();
      const leaseId = randomUUID();
      const ttlMs = leaseMs + CONCURRENCY_TTL_BUFFER_MS;
      const key = coordinationKey("openai-concurrency", request.bucket, request.subject);
      const result = (await redis.eval(
        acquireConcurrencyScript,
        1,
        key,
        nowMs,
        nowMs + leaseMs,
        limit,
        ttlMs,
        leaseId
      )) as [number, number] | null;
      const acquired = Number(result?.[0] ?? 0) === 1;
      return {
        acquired,
        lease_id: acquired ? leaseId : "",
        retry_after_ms: acquired ? 0 : normalizeRetryAfterMs(Number(result?.[1] ?? ttlMs), ttlMs)
      };
    },

    async releaseConcurrency(request): Promise<void> {
      if (request.leaseId.length === 0) {
        throw new Error("auth_coordination_lease_invalid");
      }
      await redis.zrem(
        coordinationKey("openai-concurrency", request.bucket, request.subject),
        request.leaseId
      );
    },

    async getOpenAiCimdResponse(url): Promise<string | undefined> {
      return (await redis.get(openAiCimdCacheKey(url))) ?? undefined;
    },

    async setOpenAiCimdResponse(url, response, ttlMs): Promise<void> {
      const normalizedTtlMs = Math.trunc(ttlMs);
      if (normalizedTtlMs < 1 || normalizedTtlMs > 10 * 60_000) {
        throw new Error("openai_cimd_cache_ttl_invalid");
      }
      const result = await redis.set(openAiCimdCacheKey(url), response, "PX", normalizedTtlMs);
      if (result !== "OK") {
        throw new Error("openai_cimd_cache_write_failed");
      }
    },

    async claimOpenAiClientAssertionJti(request): Promise<boolean> {
      if (
        request.issuer.length === 0 ||
        request.jti.length === 0 ||
        request.jti.length > 512 ||
        !Number.isInteger(request.expiresAt)
      ) {
        throw new Error("openai_client_assertion_claim_invalid");
      }
      const ttlMs = request.expiresAt * 1_000 - Date.now();
      if (ttlMs < 1 || ttlMs > 10 * 60_000) {
        throw new Error("openai_client_assertion_expiry_invalid");
      }
      return (
        (await redis.set(
          openAiClientAssertionKey(request.issuer, request.jti),
          "claimed",
          "PX",
          Math.ceil(ttlMs),
          "NX"
        )) === "OK"
      );
    },

    async close(): Promise<void> {
      await redis.quit();
    }
  };
}
