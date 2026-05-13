import { describe, expect, it } from "vitest";

import {
  assertIntegrationSecretEncryptionKey,
  decryptIntegrationSecret,
  encryptIntegrationSecret
} from "../../../packages/storage/src/index.js";

const VALID_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

describe("integration secret crypto", () => {
  it("encrypts and decrypts integration secrets with the configured key", () => {
    const ciphertext = encryptIntegrationSecret("https://hooks.slack.com/services/T/B/X", VALID_KEY);

    expect(ciphertext.startsWith("encv1.")).toBe(true);
    expect(decryptIntegrationSecret(ciphertext, VALID_KEY)).toBe("https://hooks.slack.com/services/T/B/X");
  });

  it("rejects invalid encryption keys and tampered ciphertext", () => {
    expect(() => assertIntegrationSecretEncryptionKey("short")).toThrow(
      "integration_secret_encryption_key_invalid"
    );

    const ciphertext = encryptIntegrationSecret("secret", VALID_KEY);
    expect(() => decryptIntegrationSecret(`${ciphertext}extra`, VALID_KEY)).toThrow(
      "integration_secret_ciphertext_invalid"
    );
  });
});
