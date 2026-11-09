import { describe, expect, it, vi } from "vitest";
import { resolveMemberTokenAndRecordUsage } from "../../../packages/storage/src/token-usage-store.js";
const base = {
  member_id: "11111111-1111-4111-8111-111111111111",
  organization_id: "22222222-2222-4222-8222-222222222222",
  role: "owner",
  revoked_at: null,
  expires_at: null
};

describe("stored member token policy", () => {
  it("keeps legacy resolution when no policy was stored", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [base] });
    expect(await resolveMemberTokenAndRecordUsage({ query }, "hash")).toEqual(base);
  });
  it("carries the validated declared scope through principal resolution", async () => {
    const policy = {
      version: 1,
      mode: "organization",
      organization_id: base.organization_id,
      permissions: ["project:read"]
    };
    const query = vi.fn().mockResolvedValue({ rows: [{ ...base, scope_policy: policy }] });
    expect(await resolveMemberTokenAndRecordUsage({ query }, "hash")).toMatchObject({
      ...base,
      token_policy: policy
    });
  });
  it.each([
    { version: 2 },
    { version: 1, mode: "anything" },
    {
      version: 1,
      mode: "organization",
      organization_id: base.organization_id,
      permissions: ["*:* "]
    }
  ])("rejects an unknown or invalid persisted policy", async (policy) => {
    const query = vi.fn().mockResolvedValue({ rows: [{ ...base, scope_policy: policy }] });
    expect(await resolveMemberTokenAndRecordUsage({ query }, "hash")).toBeNull();
  });
});
