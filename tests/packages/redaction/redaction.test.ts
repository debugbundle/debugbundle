import { describe, expect, it } from "vitest";

import { redact, type JsonValue } from "../../../packages/redaction/src/index.js";

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
