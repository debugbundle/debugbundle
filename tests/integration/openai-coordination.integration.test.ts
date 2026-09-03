import { randomUUID } from "node:crypto";

import { afterAll, expect, it } from "vitest";

import { createRedisAuthRateLimiter } from "../../packages/storage/src/index.js";
import { redisUrl, runIntegration } from "../helpers/integration-setup.ts";

runIntegration("OpenAI Redis coordination integration", () => {
  const first = createRedisAuthRateLimiter({ redisUrl });
  const second = createRedisAuthRateLimiter({ redisUrl });

  afterAll(async () => {
    await Promise.all([first.close(), second.close()]);
  });

  it("shares concurrency, CIMD cache, and assertion replay state across clients", async () => {
    const subject = randomUUID();
    const claims = await Promise.all([
      first.acquireConcurrency({
        bucket: "openai-mcp-global-concurrency",
        subject,
        limit: 2,
        leaseMs: 60_000
      }),
      second.acquireConcurrency({
        bucket: "openai-mcp-global-concurrency",
        subject,
        limit: 2,
        leaseMs: 60_000
      }),
      first.acquireConcurrency({
        bucket: "openai-mcp-global-concurrency",
        subject,
        limit: 2,
        leaseMs: 60_000
      })
    ]);
    expect(claims.filter((claim) => claim.acquired)).toHaveLength(2);
    expect(claims.filter((claim) => !claim.acquired)).toHaveLength(1);

    const acquired = claims.find((claim) => claim.acquired)!;
    await first.releaseConcurrency({
      bucket: "openai-mcp-global-concurrency",
      subject,
      leaseId: acquired.lease_id
    });
    await expect(
      second.acquireConcurrency({
        bucket: "openai-mcp-global-concurrency",
        subject,
        limit: 2,
        leaseMs: 60_000
      })
    ).resolves.toMatchObject({ acquired: true });

    const cacheUrl = `https://chatgpt.com/oauth/client.json#${randomUUID()}`;
    await first.setOpenAiCimdResponse(cacheUrl, "bounded-public-metadata", 300_000);
    await expect(second.getOpenAiCimdResponse(cacheUrl)).resolves.toBe("bounded-public-metadata");

    const assertion = {
      issuer: "https://chatgpt.com/oauth/client.json",
      jti: randomUUID(),
      expiresAt: Math.floor(Date.now() / 1_000) + 315
    };
    const assertionClaims = await Promise.all([
      first.claimOpenAiClientAssertionJti(assertion),
      second.claimOpenAiClientAssertionJti(assertion)
    ]);
    expect(assertionClaims.sort()).toEqual([false, true]);
  });
});
