import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deriveProbeTriggerTokenKey,
  generateProbeTriggerToken
} from "../../../packages/auth/src/index.js";

describe("probe signing credential scopes", () => {
  afterEach(() => vi.unstubAllEnvs());
  const issuer = "00000000-0000-0000-0000-000000000001";
  const adopted = "00000000-0000-0000-0000-000000000002";
  const later = "00000000-0000-0000-0000-000000000003";
  it("preserves the installed single-origin key and isolates each broader snapshot", () => {
    vi.stubEnv("DEBUGBUNDLE_PROBE_TRIGGER_SECRET", "isolated-fixture-secret");
    const legacy = createHmac("sha256", "isolated-fixture-secret").update(issuer).digest("hex");
    expect(deriveProbeTriggerTokenKey(issuer)).toBe(legacy);
    expect(deriveProbeTriggerTokenKey(issuer, [issuer])).toBe(legacy);
    const key = deriveProbeTriggerTokenKey(issuer, [issuer, adopted]);
    expect(key).not.toBe(legacy);
    expect(deriveProbeTriggerTokenKey(issuer, [adopted, issuer, adopted])).toBe(key);
    expect(deriveProbeTriggerTokenKey(issuer, [issuer, adopted, later])).not.toBe(key);
    expect(deriveProbeTriggerTokenKey(issuer, [adopted])).not.toBe(legacy);
    expect(() => deriveProbeTriggerTokenKey(issuer, [])).toThrow("probe_scope_invalid");
    const token = generateProbeTriggerToken({
      projectId: issuer,
      scopeOriginIds: [issuer, adopted],
      payload: {
        activation_id: issuer,
        label_pattern: "checkout.*",
        service: "Site",
        environment: "production",
        trigger_expires_at: "2026-11-04T12:00:00.000Z"
      }
    });
    const [payload, signature] = token.plaintext.replace(/^dbundle_probe_/, "").split(".");
    expect(createHmac("sha256", key).update(payload!).digest("base64url")).toBe(signature);
    expect(createHmac("sha256", legacy).update(payload!).digest("base64url")).not.toBe(signature);
  });
});
