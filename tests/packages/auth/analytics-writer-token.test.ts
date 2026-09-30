import { expect, it, vi } from "vitest";
import {
  generateAnalyticsWriterToken,
  validateAnalyticsWriterToken,
  hashToken,
  validateProjectToken,
  validateMemberToken,
  validateAgentToken
} from "../../../packages/auth/src/index.js";

const now = new Date("2026-09-28T12:00:00.000Z");
const context = {
  writer_id: "11111111-1111-4111-8111-111111111111",
  project_id: "22222222-2222-4222-8222-222222222222",
  organization_id: "33333333-3333-4333-8333-333333333333",
  issuer_user_id: "44444444-4444-4444-8444-444444444444",
  kind: "server" as const,
  expires_at: "2026-10-28T12:00:00.000Z",
  revoked_at: null
};

it("generates distinct server/relay credentials with SHA-256 storage and no legacy permissions", async () => {
  for (const kind of ["server", "relay"] as const) {
    const token = generateAnalyticsWriterToken(kind);
    expect(token.plaintext).toMatch(
      kind === "server" ? /^dbundle_anl_[A-Za-z0-9_-]{43}$/ : /^dbundle_anr_[A-Za-z0-9_-]{43}$/
    );
    expect(token.hash).toBe(hashToken(token.plaintext));
    const resolver = vi.fn().mockResolvedValue({ ...context, kind });
    await expect(
      validateAnalyticsWriterToken(token.plaintext, resolver, { now, allowedKinds: [kind] })
    ).resolves.toEqual({ ok: true, context: { ...context, kind } });
    expect(resolver).toHaveBeenCalledWith(token.hash);
    const legacy = vi.fn();
    await expect(validateProjectToken(token.plaintext, legacy)).resolves.toEqual({
      ok: false,
      error: "invalid_token"
    });
    await expect(validateMemberToken(token.plaintext, legacy)).resolves.toEqual({
      ok: false,
      error: "invalid_token"
    });
    await expect(validateAgentToken(token.plaintext, legacy)).resolves.toEqual({
      ok: false,
      error: "invalid_token"
    });
    expect(legacy).not.toHaveBeenCalled();
  }
  expect(generateAnalyticsWriterToken("server").plaintext).not.toBe(
    generateAnalyticsWriterToken("server").plaintext
  );
});

it("defaults to server authority and never upgrades a relay through its returned metadata", async () => {
  const relay = generateAnalyticsWriterToken("relay");
  const resolver = vi.fn().mockResolvedValue(context);
  await expect(validateAnalyticsWriterToken(relay.plaintext, resolver, { now })).resolves.toEqual({
    ok: false,
    error: "invalid_token"
  });
  expect(resolver).not.toHaveBeenCalled();
  await expect(
    validateAnalyticsWriterToken(relay.plaintext, resolver, { now, allowedKinds: ["relay"] })
  ).resolves.toEqual({ ok: false, error: "invalid_token" });
});

it("rejects malformed/foreign tokens before a database lookup", async () => {
  const resolver = vi.fn();
  for (const token of [
    null,
    "",
    "dbundle_proj_abc",
    "dbundle_mem_abc",
    "dbundle_ah_abc",
    "dbundle_anl_short",
    `dbundle_anl_${"a".repeat(44)}`,
    `dbundle_anl_${"a".repeat(42)}!`,
    ` dbundle_anl_${"a".repeat(43)}`
  ]) {
    await expect(validateAnalyticsWriterToken(token, resolver, { now })).resolves.toEqual({
      ok: false,
      error: "invalid_token"
    });
  }
  expect(resolver).not.toHaveBeenCalled();
});

it("fails closed on missing, malformed, revoked and expired writer authority", async () => {
  const token = generateAnalyticsWriterToken("server").plaintext;
  for (const row of [
    null,
    { ...context, project_id: "wrong" },
    { ...context, kind: "relay" },
    { ...context, expires_at: "" },
    { ...context, issuer_user_id: null },
    { ...context, admin: true }
  ]) {
    await expect(validateAnalyticsWriterToken(token, async () => row, { now })).resolves.toEqual({
      ok: false,
      error: "invalid_token"
    });
  }
  await expect(
    validateAnalyticsWriterToken(
      token,
      async () => ({ ...context, revoked_at: now.toISOString() }),
      { now }
    )
  ).resolves.toEqual({ ok: false, error: "token_revoked" });
  await expect(
    validateAnalyticsWriterToken(
      token,
      async () => ({ ...context, expires_at: now.toISOString() }),
      { now }
    )
  ).resolves.toEqual({ ok: false, error: "token_expired" });
  await expect(
    validateAnalyticsWriterToken(token, async () => context, { now: new Date("invalid") })
  ).resolves.toEqual({ ok: false, error: "invalid_token" });
});
