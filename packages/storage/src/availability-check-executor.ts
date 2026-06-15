import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type AvailabilityCheckMethod = "GET" | "HEAD";

export type AvailabilityCheckResultStatus =
  | "success"
  | "http_status_mismatch"
  | "timeout"
  | "dns_error"
  | "tls_error"
  | "connection_error"
  | "redirect_blocked"
  | "security_blocked"
  | "internal_error";

export interface AvailabilityCheckDefinition {
  url: string;
  method: AvailabilityCheckMethod;
  expected_status_min: number;
  expected_status_max: number;
  timeout_ms: number;
}

export interface AvailabilityCheckExecutionResult {
  status: AvailabilityCheckResultStatus;
  http_status: number | null;
  duration_ms: number;
  error_kind: string | null;
  error_message: string | null;
  checked_url_host: string;
  checked_url_path: string;
  checked_url_query: Record<string, string>;
  final_url: string;
  redirect_count: number;
}

export class AvailabilityCheckValidationError extends Error {
  public constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "AvailabilityCheckValidationError";
  }
}

const MAX_REDIRECTS = 3;
const ALLOWED_PORTS = new Set(["80", "443"]);
const BLOCKED_HOST_SUFFIXES = [".local", ".internal", ".localhost"];

function parseAndValidatePort(url: URL): void {
  if (url.port.length === 0) {
    return;
  }

  if (!ALLOWED_PORTS.has(url.port)) {
    throw new AvailabilityCheckValidationError(
      "blocked_port",
      "Only ports 80 and 443 are allowed for availability checks."
    );
  }
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (normalized === "localhost") {
    return true;
  }

  return BLOCKED_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

function parseIpv4(address: string): [number, number, number, number] | null {
  const parts = address.split(".");
  if (parts.length !== 4) {
    return null;
  }

  const bytes = parts.map((part) => Number.parseInt(part, 10));
  if (bytes.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return null;
  }

  return [bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!];
}

function isBlockedIpv4(address: string): boolean {
  const bytes = parseIpv4(address);
  if (
    bytes === null ||
    bytes[0] === undefined ||
    bytes[1] === undefined ||
    bytes[2] === undefined ||
    bytes[3] === undefined
  ) {
    return true;
  }

  const [a, b] = bytes;
  if (a === 0 || a === 10 || a === 127) {
    return true;
  }
  if (a === 100 && b >= 64 && b <= 127) {
    return true;
  }
  if (a === 169 && b === 254) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 192 && b === 0) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  if (a === 198 && (b === 18 || b === 19)) {
    return true;
  }
  if (a === 198 && b === 51) {
    return true;
  }
  if (a === 203 && b === 0) {
    return true;
  }
  if (a >= 224) {
    return true;
  }

  return false;
}

function isBlockedIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  if (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  ) {
    return true;
  }

  if (normalized === "::ffff:169.254.169.254") {
    return true;
  }

  return false;
}

function assertSafeResolvedAddress(address: string): void {
  const family = isIP(address);
  if (family === 4) {
    if (isBlockedIpv4(address)) {
      throw new AvailabilityCheckValidationError(
        "blocked_address",
        "Availability checks cannot target private or reserved IPv4 ranges."
      );
    }
    return;
  }

  if (family === 6) {
    if (isBlockedIpv6(address)) {
      throw new AvailabilityCheckValidationError(
        "blocked_address",
        "Availability checks cannot target private or reserved IPv6 ranges."
      );
    }
    return;
  }

  throw new AvailabilityCheckValidationError(
    "invalid_address",
    "Availability check DNS resolution returned an invalid address."
  );
}

async function assertSafeUrlTarget(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new AvailabilityCheckValidationError(
      "invalid_protocol",
      "Availability checks support only http and https URLs."
    );
  }
  if (url.username.length > 0 || url.password.length > 0) {
    throw new AvailabilityCheckValidationError(
      "credentials_not_allowed",
      "Availability check URLs cannot embed credentials."
    );
  }
  if (isBlockedHostname(url.hostname)) {
    throw new AvailabilityCheckValidationError(
      "blocked_hostname",
      "Availability checks cannot target localhost or private hostnames."
    );
  }

  parseAndValidatePort(url);

  let resolved;
  try {
    resolved = await lookup(url.hostname, { all: true, verbatim: true });
  } catch (error) {
    throw new AvailabilityCheckValidationError(
      "dns_lookup_failed",
      error instanceof Error ? error.message : String(error)
    );
  }

  if (resolved.length === 0) {
    throw new AvailabilityCheckValidationError(
      "dns_lookup_failed",
      "Availability check DNS resolution returned no addresses."
    );
  }

  for (const entry of resolved) {
    assertSafeResolvedAddress(entry.address);
  }
}

function buildQueryRecord(url: URL): Record<string, string> {
  const entries = Array.from(url.searchParams.entries()).sort(([leftKey], [rightKey]) =>
    leftKey.localeCompare(rightKey)
  );

  return Object.fromEntries(entries.map(([key]) => [key, "[redacted]"]));
}

function redactUrlForEvidence(url: URL): string {
  const redacted = new URL(url.toString());
  for (const key of Array.from(redacted.searchParams.keys())) {
    redacted.searchParams.set(key, "[redacted]");
  }
  redacted.hash = "";
  return redacted.toString();
}

function classifyNetworkError(error: unknown): Pick<AvailabilityCheckExecutionResult, "status" | "error_kind" | "error_message"> {
  if (error instanceof AvailabilityCheckValidationError) {
    return {
      status: "security_blocked",
      error_kind: error.code,
      error_message: error.message
    };
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return {
      status: "timeout",
      error_kind: "timeout",
      error_message: "The availability check timed out."
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  if (normalized.includes("certificate") || normalized.includes("tls")) {
    return {
      status: "tls_error",
      error_kind: "tls_error",
      error_message: message
    };
  }
  if (normalized.includes("dns") || normalized.includes("enotfound")) {
    return {
      status: "dns_error",
      error_kind: "dns_error",
      error_message: message
    };
  }
  if (
    normalized.includes("connect") ||
    normalized.includes("socket") ||
    normalized.includes("econnrefused") ||
    normalized.includes("ehostunreach")
  ) {
    return {
      status: "connection_error",
      error_kind: "connection_error",
      error_message: message
    };
  }

  return {
    status: "internal_error",
    error_kind: "internal_error",
    error_message: message
  };
}

export async function validateAvailabilityCheckDefinition(
  input: AvailabilityCheckDefinition
): Promise<{ normalized_url: string }> {
  const url = new URL(input.url);
  await assertSafeUrlTarget(url);
  return {
    normalized_url: url.toString()
  };
}

export async function executeAvailabilityCheck(
  input: AvailabilityCheckDefinition
): Promise<AvailabilityCheckExecutionResult> {
  const startedAt = Date.now();
  let currentUrl = new URL(input.url);
  await assertSafeUrlTarget(currentUrl);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeout_ms);
  let redirectCount = 0;

  try {
    for (;;) {
      const response = await fetch(currentUrl, {
        method: input.method,
        redirect: "manual",
        headers: {
          "user-agent": "DebugBundle-AvailabilityCheck/1.0",
          "accept": "*/*"
        },
        signal: controller.signal
      });

      const location = response.headers.get("location");
      if (
        response.status >= 300 &&
        response.status < 400 &&
        location !== null &&
        redirectCount < MAX_REDIRECTS
      ) {
        const nextUrl = new URL(location, currentUrl);
        await assertSafeUrlTarget(nextUrl);
        currentUrl = nextUrl;
        redirectCount += 1;
        response.body?.cancel().catch(() => undefined);
        continue;
      }

      if (response.status >= 300 && response.status < 400 && location !== null && redirectCount >= MAX_REDIRECTS) {
        response.body?.cancel().catch(() => undefined);
        return {
          status: "redirect_blocked",
          http_status: response.status,
          duration_ms: Date.now() - startedAt,
          error_kind: "too_many_redirects",
          error_message: "The availability check exceeded the redirect limit.",
          checked_url_host: currentUrl.host,
          checked_url_path: currentUrl.pathname,
          checked_url_query: buildQueryRecord(currentUrl),
          final_url: redactUrlForEvidence(currentUrl),
          redirect_count: redirectCount
        };
      }

      const matched =
        response.status >= input.expected_status_min &&
        response.status <= input.expected_status_max;
      response.body?.cancel().catch(() => undefined);

      return {
        status: matched ? "success" : "http_status_mismatch",
        http_status: response.status,
        duration_ms: Date.now() - startedAt,
        error_kind: matched ? null : "http_status_mismatch",
        error_message: matched
          ? null
          : `Expected ${input.expected_status_min}-${input.expected_status_max} but received ${response.status}.`,
        checked_url_host: currentUrl.host,
        checked_url_path: currentUrl.pathname,
        checked_url_query: buildQueryRecord(currentUrl),
        final_url: redactUrlForEvidence(currentUrl),
        redirect_count: redirectCount
      };
    }
  } catch (error) {
    const classified = classifyNetworkError(error);
    return {
      ...classified,
      http_status: null,
      duration_ms: Date.now() - startedAt,
      checked_url_host: currentUrl.host,
      checked_url_path: currentUrl.pathname,
      checked_url_query: buildQueryRecord(currentUrl),
      final_url: redactUrlForEvidence(currentUrl),
      redirect_count: redirectCount
    };
  } finally {
    clearTimeout(timeout);
  }
}
