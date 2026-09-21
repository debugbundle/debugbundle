export const DEFAULT_SENSITIVE_KEYS = [
  "password", "secret", "token", "api_key", "apikey", "access_token", "refresh_token",
  "private_key", "authorization", "bearer", "cookie", "session_id", "passwd", "ssn",
  "credit_card", "card_number", "cvv", "cvc", "pin", "expiry", "phone", "otp",
  "verification_code"
] as const;

function canonicalizeSensitiveKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function splitKeyIntoSegments(key: string): string[] {
  return key
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((segment) => segment.length > 0);
}

export function isSensitiveKey(key: string, sensitiveKeys: readonly string[]): boolean {
  const normalized = key.trim().toLowerCase();
  if (sensitiveKeys.includes(normalized)) {
    return true;
  }

  const canonicalSensitiveKeys = new Set(sensitiveKeys.map(canonicalizeSensitiveKey));
  const segments = splitKeyIntoSegments(key);
  for (let start = 0; start < segments.length; start += 1) {
    let combined = "";
    for (let end = start; end < segments.length; end += 1) {
      combined += segments[end];
      if (canonicalSensitiveKeys.has(combined)) {
        return true;
      }
    }
  }
  return false;
}
