import { describe, expect, it, vi } from "vitest";

import {
  AGENT_TOKEN_PREFIX,
  generateAgentToken,
  hashToken,
  validateAgentToken,
  validateMemberToken,
  validateProjectToken
} from "../../../packages/auth/src/index.js";

describe("restricted agent token primitives", () => {
  it("keeps agent credentials distinct from older member and ingestion tokens", async () => {
    const generated = generateAgentToken();
    expect(generated.plaintext.startsWith(AGENT_TOKEN_PREFIX)).toBe(true);
    expect(generated.hash).toBe(hashToken(generated.plaintext));
    const resolve = vi.fn().mockResolvedValue({
      token_id: "agent_1", user_id: "user_1", organization_id: "org_1", project_id: "proj_1",
      scope: "incident:read-minimized", policy_version: "telemetry-privacy-v1",
      expires_at: "2026-10-01T00:00:00.000Z", revoked_at: null
    });
    await expect(validateAgentToken(generated.plaintext, resolve, { now: new Date("2026-09-20T00:00:00.000Z") }))
      .resolves.toMatchObject({ ok: true, context: { project_id: "proj_1" } });
    await expect(validateMemberToken(generated.plaintext, resolve)).resolves.toEqual({ ok: false, error: "invalid_token" });
    await expect(validateProjectToken(generated.plaintext, resolve)).resolves.toEqual({ ok: false, error: "invalid_token" });
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it("rejects unknown scopes, policy versions and expired credentials", async () => {
    const base = {
      token_id: "agent_1", user_id: "user_1", organization_id: "org_1", project_id: "proj_1",
      scope: "incident:read-minimized" as const, policy_version: "telemetry-privacy-v1" as const,
      expires_at: "2026-10-01T00:00:00.000Z", revoked_at: null
    };
    for (const override of [{ scope: "admin:*" }, { policy_version: "unknown" }, { expires_at: "" }]) {
      await expect(validateAgentToken("dbundle_agent_test", async () => ({ ...base, ...override } as typeof base),
        { now: new Date("2026-09-20T00:00:00.000Z") })).resolves.toMatchObject({ ok: false });
    }
    await expect(validateAgentToken("dbundle_agent_test", async () => base,
      { now: new Date("2026-10-02T00:00:00.000Z") })).resolves.toEqual({ ok: false, error: "token_expired" });
  });
});
