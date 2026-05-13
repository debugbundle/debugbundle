import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ENCRYPTION_FORMAT_VERSION = "encv1";
const AES_256_GCM_KEY_BYTES = 32;
const AES_256_GCM_IV_BYTES = 12;

function decodeKey(key: string): Buffer {
  const decoded = Buffer.from(key, "base64url");
  if (decoded.length !== AES_256_GCM_KEY_BYTES) {
    throw new Error("integration_secret_encryption_key_invalid");
  }

  return decoded;
}

export function assertIntegrationSecretEncryptionKey(key: string): void {
  void decodeKey(key);
}

export function encryptIntegrationSecret(plaintext: string, key: string): string {
  const decodedKey = decodeKey(key);
  const iv = randomBytes(AES_256_GCM_IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", decodedKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    ENCRYPTION_FORMAT_VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url")
  ].join(".");
}

export function decryptIntegrationSecret(ciphertext: string, key: string): string {
  const [version, ivValue, authTagValue, payloadValue, ...rest] = ciphertext.split(".");
  if (
    version !== ENCRYPTION_FORMAT_VERSION ||
    ivValue === undefined ||
    authTagValue === undefined ||
    payloadValue === undefined ||
    rest.length > 0
  ) {
    throw new Error("integration_secret_ciphertext_invalid");
  }

  const decipher = createDecipheriv("aes-256-gcm", decodeKey(key), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(authTagValue, "base64url"));

  try {
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(payloadValue, "base64url")),
      decipher.final()
    ]);
    return plaintext.toString("utf8");
  } catch {
    throw new Error("integration_secret_ciphertext_invalid");
  }
}
