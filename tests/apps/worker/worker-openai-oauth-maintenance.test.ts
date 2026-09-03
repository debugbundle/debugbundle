import { describe, expect, it, vi } from "vitest";

import { createOpenAiOAuthMaintenance } from "../../../apps/worker/src/openai-oauth-maintenance.js";
import { parseWorkerEnv } from "../../../apps/worker/src/worker-env.js";
import type { RuntimeLogger } from "../../../packages/runtime-logger/src/index.js";

function logger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn()
  } as unknown as RuntimeLogger;
}

describe("OpenAI OAuth worker maintenance", () => {
  it("keeps cleanup dark and bounded by default", () => {
    const env = parseWorkerEnv({ ANALYTICS_HASH_SECRET: "test-analytics-secret" });

    expect(env.OPENAI_OAUTH_ENABLED).toBe("false");
    expect(env.OPENAI_OAUTH_CLEANUP_INTERVAL_MS).toBe(6 * 60 * 60 * 1_000);
    expect(env.OPENAI_OAUTH_CLEANUP_BATCH_SIZE).toBe(500);
  });

  it("requires the cleanup encryption key only when the OAuth surface is enabled", () => {
    expect(() =>
      parseWorkerEnv({
        OPENAI_OAUTH_ENABLED: "true",
        ANALYTICS_HASH_SECRET: "test-analytics-secret"
      })
    ).toThrow("OPENAI_OAUTH_ADAPTER_ENCRYPTION_KEY");
  });

  it("runs one bounded batch per interval and logs counts without credentials", async () => {
    let now = Date.parse("2026-08-30T12:00:00.000Z");
    const runtimeLogger = logger();
    const cleanup = vi.fn(async () => ({
      providerArtifacts: 2,
      authorizationCodes: 3,
      refreshTokens: 4,
      grants: 1
    }));
    const maintenance = createOpenAiOAuthMaintenance({
      cleanupExpiredCredentials: cleanup,
      logger: runtimeLogger,
      intervalMs: 60_000,
      batchSize: 500,
      now: () => now
    });

    await expect(maintenance.runIfDue()).resolves.toBe(true);
    await expect(maintenance.runIfDue()).resolves.toBe(false);
    now += 60_000;
    await expect(maintenance.runIfDue()).resolves.toBe(true);

    expect(cleanup).toHaveBeenCalledTimes(2);
    expect(cleanup).toHaveBeenCalledWith({ limit: 500 });
    const logged = JSON.stringify((runtimeLogger.info as ReturnType<typeof vi.fn>).mock.calls);
    expect(logged).toContain("authorization_codes_deleted");
    expect(logged).not.toContain("token_hash");
  });

  it("emits the reviewer expiry signal inside the monitored horizon", async () => {
    const now = Date.parse("2026-08-30T12:00:00.000Z");
    const runtimeLogger = logger();
    const maintenance = createOpenAiOAuthMaintenance({
      cleanupExpiredCredentials: vi.fn(async () => ({
        providerArtifacts: 0,
        authorizationCodes: 0,
        refreshTokens: 0,
        grants: 0
      })),
      logger: runtimeLogger,
      intervalMs: 60_000,
      batchSize: 500,
      reviewerCredentialExpiresAt: "2026-09-10T12:00:00.000Z",
      now: () => now
    });

    await maintenance.runIfDue();
    expect(runtimeLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "openai_reviewer_credential_expiring",
        remaining_days: 11,
        expired: false
      }),
      "openai_reviewer_credential_expiring"
    );
  });
});
