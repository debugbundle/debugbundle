import { DEFAULT_SENSITIVE_KEYS, isExactSensitiveKey, isSensitiveKey } from "./keys.js";

const REDACTED = "[REDACTED]";
const BUILTIN_LABELS = [
  ...DEFAULT_SENSITIVE_KEYS,
  "client_secret",
  "x_api_key",
  "accessToken",
  "refreshToken",
  "privateKey",
  "clientSecret"
];
const ASSIGNMENT = new RegExp(
  `\\b(${BUILTIN_LABELS.join("|")})\\b(["']?\\s*[:=]\\s*)(?:"[^"]*"|'[^']*'|[^\\s&,;]+)`,
  "gi"
);
const HEADER = /\b(Authorization|Proxy-Authorization|Cookie|Set-Cookie)\s*:\s*[^\r\n]*/gi;
const PEM =
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gi;
const PEM_COMPLETE = new RegExp(PEM.source, "i");
const PEM_START = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i;
const DEBUGBUNDLE_TOKEN =
  /\bdbundle_(?:proj|mem|probe|agent|invite|org_invite|org_transfer)_[A-Za-z0-9_-]+\b/g;
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+\/-]{6,}/gi;
const URL_TEXT = /\bhttps?:\/\/[^\s<>"']+/gi;
// Do not treat numeric substrings inside UUIDs, hashes, or identifier slugs as cards.
const CARD = /(?<![A-Za-z0-9_-])(?:\d[ -]?){12,18}\d(?![A-Za-z0-9_-])/g;

function isValidCard(value: string): boolean {
  const digits = value.replace(/[^0-9]/g, "");
  if (digits.length < 13 || digits.length > 19 || /^(\d)\1+$/.test(digits)) {
    return false;
  }
  let sum = 0;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if ((digits.length - index) % 2 === 0) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

function scrubUrl(
  raw: string,
  additionalKeys: readonly string[],
  exactKeys: readonly string[]
): string {
  const broadKeys = [...DEFAULT_SENSITIVE_KEYS, ...additionalKeys];
  try {
    const url = new URL(raw);
    if (url.username || url.password) {
      url.username = "REDACTED";
      url.password = "";
    }
    const nextQuery = new URLSearchParams();
    for (const [key, value] of url.searchParams) {
      if (key.length > 128 || scrubCredentialText(key, additionalKeys, false, exactKeys) !== key) continue;
      nextQuery.append(
        key,
        isSensitiveKey(key, broadKeys) ||
          isExactSensitiveKey(key, exactKeys) ||
          scrubCredentialText(value, additionalKeys, false, exactKeys) !== value
          ? REDACTED
          : value
      );
    }
    url.search = nextQuery.toString();
    url.hash = "";
    return url.toString();
  } catch {
    // A malformed URL with a recognizable credential must not be emitted verbatim.
    return REDACTED;
  }
}

/** Bounded caller input only. Returns stable replacement text, never the matching secret. */
export function scrubCredentialText(
  input: string,
  additionalKeys: readonly string[],
  scanUrls = true,
  exactKeys: readonly string[] = []
): string {
  if (PEM_START.test(input) && !PEM_COMPLETE.test(input)) return REDACTED;
  let output = input;
  if (/(?:password|token|secret|authorization|cookie)%3[ad]/i.test(output)) {
    try {
      output = decodeURIComponent(output);
    } catch {
      return REDACTED;
    }
  }
  output = output.replace(PEM, REDACTED).replace(HEADER, "$1: [REDACTED]");
  output = output.replace(BEARER, "$1 [REDACTED]").replace(DEBUGBUNDLE_TOKEN, REDACTED);
  output = output.replace(ASSIGNMENT, "$1$2[REDACTED]");
  if (additionalKeys.length > 0) {
    for (const key of additionalKeys) {
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const named = new RegExp(
        `\\b(${escaped})\\b(["']?\\s*[:=]\\s*)(?:"[^"]*"|'[^']*'|[^\\s&,;]+)`,
        "gi"
      );
      output = output.replace(named, "$1$2[REDACTED]");
    }
  }
  if (exactKeys.length > 0) {
    for (const key of exactKeys) {
      const trimmed = key.trim();
      if (trimmed.length === 0) continue;
      const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // Identifier boundaries keep `tag=secret` redacted while preserving `tag_name=script` and `x-tag-name=script`.
      const named = new RegExp(
        `(?<![A-Za-z0-9_-])(${escaped})(?![A-Za-z0-9_-])(["']?\\s*[:=]\\s*)(?:"[^"]*"|'[^']*'|[^\\s&,;]+)`,
        "gi"
      );
      output = output.replace(named, "$1$2[REDACTED]");
    }
  }
  output = output.replace(CARD, (candidate) => (isValidCard(candidate) ? REDACTED : candidate));
  if (!scanUrls) return output;
  return output.replace(URL_TEXT, (matched) => {
    const trailing = matched.match(/[).,;]+$/)?.[0] ?? "";
    return scrubUrl(matched.slice(0, matched.length - trailing.length), additionalKeys, exactKeys) + trailing;
  });
}
