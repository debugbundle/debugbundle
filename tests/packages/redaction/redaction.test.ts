import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { redact, sanitizeTelemetry, type JsonValue } from "../../../packages/redaction/src/index.js";

const privacyFixtures = JSON.parse(readFileSync(new URL("../../fixtures/privacy-conformance.json", import.meta.url), "utf8")) as {
  policy: string;
  cases: Array<{ id: string; input: JsonValue; expected: JsonValue }>;
};

describe("mandatory telemetry sanitization", () => {
  it("keeps the portable corpus tied to the policy version", () => {
    expect(privacyFixtures.policy).toBe("telemetry-privacy-v1");
  });

  for (const fixture of privacyFixtures.cases) {
    it(`sanitizes ${fixture.id} without losing safe evidence`, () => {
      const original = JSON.stringify(fixture.input);
      const result = sanitizeTelemetry(fixture.input);
      expect(result).toMatchObject({ ok: true });
      if (!result.ok) {
        return;
      }
      expect(result.value).toEqual(fixture.expected);
      expect(JSON.stringify(fixture.input)).toBe(original);
      expect(sanitizeTelemetry(result.value)).toMatchObject({ ok: true, value: result.value });
    });
  }

  it("adds custom fields without replacing credential protection", () => {
    expect(sanitizeTelemetry({ password: "SYNTHETIC_SECRET", businessField: "SYNTHETIC_SECRET" }, {
      additionalKeys: ["businessField"]
    })).toMatchObject({
      ok: true,
      value: { password: "[REDACTED]", businessField: "[REDACTED]" }
    });
  });

  it("withholds strings too large to scan instead of retaining an unchecked prefix", () => {
    const huge = `${"x".repeat(16_384)}password=SYNTHETIC_SECRET`;
    expect(sanitizeTelemetry({ message: huge })).toMatchObject({ ok: true, value: { message: "[REDACTED]" } });
  });

  it("fails closed on a hostile getter and does not throw into its caller", () => {
    const hostile = Object.defineProperty({}, "message", {
      enumerable: true,
      get() { throw new Error("SYNTHETIC_SECRET"); }
    });
    expect(sanitizeTelemetry(hostile)).toEqual({ ok: false, reason: "unsafe_input" });
  });

  it("does not execute application getters while scanning telemetry", () => {
    let calls = 0;
    const input = Object.defineProperty({}, "message", { enumerable: true, get() { calls += 1; return "safe"; } });
    expect(sanitizeTelemetry(input)).toEqual({ ok: false, reason: "unsafe_input" });
    expect(calls).toBe(0);
  });

  it("bounds deep traversal and preserves distinct aliases", () => {
    const nested: { password: string; parent?: unknown } = { password: "SYNTHETIC_SECRET" };
    nested.parent = nested;
    expect(sanitizeTelemetry({ first: nested, second: nested })).toMatchObject({
      ok: true,
      value: {
        first: { password: "[REDACTED]", parent: "[Circular]" },
        second: { password: "[REDACTED]", parent: "[Circular]" }
      }
    });
    let deep: JsonValue = "safe";
    for (let depth = 0; depth < 20; depth += 1) {
      deep = { nested: deep };
    }
    expect(sanitizeTelemetry({ body: deep })).toMatchObject({ ok: true });
    expect(JSON.stringify(sanitizeTelemetry({ body: deep }))).not.toContain('"safe"');
  });

  it("withholds a collection and total output that exceed their budgets", () => {
    expect(sanitizeTelemetry({ items: Array.from({ length: 257 }, (_, index) => index) })).toMatchObject({
      ok: true,
      value: { items: "[REDACTED]" }
    });
    expect(sanitizeTelemetry({ safe: "x".repeat(40) }, { maxTotalBytes: 8 })).toEqual({
      ok: false,
      reason: "budget_exceeded"
    });
  });

  it("never emits user-controlled credential-bearing object keys in its result", () => {
    expect(sanitizeTelemetry({ "Authorization: Bearer SYNTHETIC_SECRET": "value", safe: 1 })).toMatchObject({
      ok: true,
      value: { safe: 1 }
    });
  });

  it("withholds oversized segmented field names before matching them", () => {
    const hostileKey = "field_".repeat(200);
    const result = sanitizeTelemetry({ [hostileKey]: "value", safe: "diagnostic" });
    expect(result).toMatchObject({ ok: true, value: { safe: "diagnostic" } });
    expect(JSON.stringify(result)).not.toContain(hostileKey);
    const urlResult = sanitizeTelemetry(`https://example.test/?${hostileKey}=value&route=checkout`);
    expect(urlResult).toMatchObject({ ok: true, value: "https://example.test/?route=checkout" });
  });
});

describe("redaction", () => {
  it("should redact sensitive keys recursively", (): void => {
    const payload = {
      authorization: "Bearer top-secret",
      password: "hunter2",
      profile: {
        cookie: "session=abc",
        nested: {
          token: "super-token"
        }
      }
    };

    const result = redact(payload);

    expect(result.redacted.authorization).toBe("[REDACTED]");
    expect(result.redacted.password).toBe("[REDACTED]");
    expect(result.redacted.profile.cookie).toBe("[REDACTED]");
    expect(result.redacted.profile.nested.token).toBe("[REDACTED]");
    expect(result.redacted_fields).toEqual([
      "authorization",
      "password",
      "profile.cookie",
      "profile.nested.token"
    ]);
  });

  it("should redact sensitive values in arrays", (): void => {
    const payload = {
      users: [
        { email: "a@example.com", secret: "x" },
        { email: "b@example.com", secret: "y" }
      ]
    };

    const result = redact(payload);

    expect(result.redacted.users[0]?.secret).toBe("[REDACTED]");
    expect(result.redacted.users[1]?.secret).toBe("[REDACTED]");
  });

  it("should redact the expanded default sensitive key set", (): void => {
    const payload = {
      api_key: "api-key-value",
      apikey: "compact-api-key",
      access_token: "access-token-value",
      refresh_token: "refresh-token-value",
      private_key: "private-key-value",
      passwd: "passwd-value",
      card_number: "4111111111111111",
      cvv: "123",
      cvc: "999",
      pin: "0000",
      expiry: "01/30",
      phone: "+1-555-0100",
      bearer: "Bearer upstream-token",
      session_id: "session-123",
      otp: "123456",
      verification_code: "654321"
    };

    const result = redact(payload);

    expect(result.redacted).toEqual({
      api_key: "[REDACTED]",
      apikey: "[REDACTED]",
      access_token: "[REDACTED]",
      refresh_token: "[REDACTED]",
      private_key: "[REDACTED]",
      passwd: "[REDACTED]",
      card_number: "[REDACTED]",
      cvv: "[REDACTED]",
      cvc: "[REDACTED]",
      pin: "[REDACTED]",
      expiry: "[REDACTED]",
      phone: "[REDACTED]",
      bearer: "[REDACTED]",
      session_id: "[REDACTED]",
      otp: "[REDACTED]",
      verification_code: "[REDACTED]"
    });
    expect(result.redacted_fields).toEqual([
      "api_key",
      "apikey",
      "access_token",
      "refresh_token",
      "private_key",
      "passwd",
      "card_number",
      "cvv",
      "cvc",
      "pin",
      "expiry",
      "phone",
      "bearer",
      "session_id",
      "otp",
      "verification_code"
    ]);
  });

  it("should replace circular object references without losing sensitive field redaction", (): void => {
    const payload = {
      token: "root-token",
      nested: {
        password: "nested-password"
      }
    } as {
      token: string;
      nested: {
        password: string;
        self?: unknown;
      };
      self?: unknown;
    };
    payload.self = payload;
    payload.nested.self = payload.nested;

    const result = redact(payload as unknown as JsonValue);

    expect(result.redacted).toEqual({
      token: "[REDACTED]",
      nested: {
        password: "[REDACTED]",
        self: "[Circular]"
      },
      self: "[Circular]"
    });
    expect(result.redacted_fields).toEqual(["token", "nested.password"]);
  });

  it("should replace circular array references", (): void => {
    const payload = [] as unknown[];
    payload.push({ secret: "array-secret" }, payload);

    const result = redact(payload as unknown as JsonValue);

    expect(result.redacted).toEqual([
      { secret: "[REDACTED]" },
      "[Circular]"
    ]);
    expect(result.redacted_fields).toEqual(["[0].secret"]);
  });

  it("should redact delimiter-separated and camelCase sensitive key variants", (): void => {
    const payload = {
      user_password: "hunter2",
      apiKey: "api-key-value",
      my_secret_field: "secret-value",
      accessToken: "access-token",
      sessionId: "session-123",
      verificationCode: "123456",
      tokenizer: "safe-value",
      microphone: "still-safe"
    };

    const result = redact(payload);

    expect(result.redacted).toEqual({
      user_password: "[REDACTED]",
      apiKey: "[REDACTED]",
      my_secret_field: "[REDACTED]",
      accessToken: "[REDACTED]",
      sessionId: "[REDACTED]",
      verificationCode: "[REDACTED]",
      tokenizer: "safe-value",
      microphone: "still-safe"
    });
    expect(result.redacted_fields).toEqual([
      "user_password",
      "apiKey",
      "my_secret_field",
      "accessToken",
      "sessionId",
      "verificationCode"
    ]);
  });
});
