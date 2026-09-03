import { beforeEach, describe, expect, it, vi } from "vitest";

let redisEvalMock = vi.fn();
let redisGetMock = vi.fn();
let redisPingMock = vi.fn();
let redisQuitMock = vi.fn();
let redisSetMock = vi.fn();
let redisZremMock = vi.fn();

vi.mock("ioredis", () => {
  class Redis {
    eval = redisEvalMock;
    get = redisGetMock;
    ping = redisPingMock;
    quit = redisQuitMock;
    set = redisSetMock;
    zrem = redisZremMock;

    constructor() {}
  }

  return { Redis };
});

import { createRedisAuthRateLimiter } from "../../../packages/storage/src/auth-rate-limiter.js";

describe("OpenAI Redis coordination adapter", () => {
  beforeEach(() => {
    redisEvalMock = vi.fn().mockResolvedValue([1, 0]);
    redisGetMock = vi.fn().mockResolvedValue(null);
    redisPingMock = vi.fn().mockResolvedValue("PONG");
    redisQuitMock = vi.fn().mockResolvedValue("OK");
    redisSetMock = vi.fn().mockResolvedValue("OK");
    redisZremMock = vi.fn().mockResolvedValue(1);
  });

  it("fails closed when the coordinator is not ready", async () => {
    const limiter = createRedisAuthRateLimiter({ redisUrl: "redis://redis:6379" });

    await expect(limiter.checkAvailability()).resolves.toBeUndefined();
    expect(redisPingMock).toHaveBeenCalledOnce();

    redisPingMock.mockResolvedValueOnce("LOADING");
    await expect(limiter.checkAvailability()).rejects.toThrow("auth_rate_limiter_unavailable");
    await limiter.close();
  });

  it("coordinates concurrency leases and CIMD cache entries", async () => {
    const limiter = createRedisAuthRateLimiter({ redisUrl: "redis://redis:6379" });

    await expect(
      limiter.acquireConcurrency({
        bucket: "openai-mcp-global-concurrency",
        subject: "global",
        limit: 2,
        leaseMs: 60_000
      })
    ).resolves.toMatchObject({ acquired: true, retry_after_ms: 0 });

    const leaseId = (
      await limiter.acquireConcurrency({
        bucket: "openai-mcp-grant-concurrency",
        subject: "grant_hash",
        limit: 2,
        leaseMs: 60_000
      })
    ).lease_id;
    await limiter.releaseConcurrency({
      bucket: "openai-mcp-grant-concurrency",
      subject: "grant_hash",
      leaseId
    });
    expect(redisZremMock).toHaveBeenCalledWith(expect.stringMatching(/^openai-concurrency:/), leaseId);

    redisGetMock.mockResolvedValueOnce("cached-response");
    await expect(
      limiter.getOpenAiCimdResponse("https://chatgpt.com/oauth/client.json")
    ).resolves.toBe("cached-response");
    await limiter.setOpenAiCimdResponse(
      "https://chatgpt.com/oauth/client.json",
      "cached-response",
      300_000
    );
    expect(redisSetMock).toHaveBeenCalledWith(
      expect.stringMatching(/^openai-cimd:/),
      "cached-response",
      "PX",
      300_000
    );
    await limiter.close();
  });

  it("atomically claims a client-assertion jti", async () => {
    const limiter = createRedisAuthRateLimiter({ redisUrl: "redis://redis:6379" });
    redisSetMock.mockResolvedValueOnce("OK").mockResolvedValueOnce(null);
    const expiresAt = Math.floor(Date.now() / 1_000) + 315;

    await expect(
      limiter.claimOpenAiClientAssertionJti({
        issuer: "https://chatgpt.com/oauth/client.json",
        jti: "assertion-jti",
        expiresAt
      })
    ).resolves.toBe(true);
    await expect(
      limiter.claimOpenAiClientAssertionJti({
        issuer: "https://chatgpt.com/oauth/client.json",
        jti: "assertion-jti",
        expiresAt
      })
    ).resolves.toBe(false);
    expect(redisSetMock).toHaveBeenCalledWith(
      expect.stringMatching(/^openai-client-assertion:/),
      "claimed",
      "PX",
      expect.any(Number),
      "NX"
    );
    await limiter.close();
  });
});
