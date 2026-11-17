import type { BillingSummaryRecord, BillingUsageMetric, SessionRecord } from "./api-types.js";

interface WebApiEnv {
  VITE_API_URL?: string;
}

function normalizeApiBaseUrl(value: string | undefined): string {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed.length === 0) {
    return "";
  }

  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

export function resolveApiBaseUrl(env: WebApiEnv = import.meta.env): string {
  return normalizeApiBaseUrl(env.VITE_API_URL);
}

export function buildApiUrl(path: string, env: WebApiEnv = import.meta.env): string {
  return `${resolveApiBaseUrl(env)}${path}`;
}

export function resolveApiResourceUrl(
  value: string | null,
  env: WebApiEnv = import.meta.env
): string | null {
  if (value === null) {
    return null;
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return buildApiUrl(value.startsWith("/") ? value : `/${value}`, env);
}

export const API_BASE = resolveApiBaseUrl();

let browserSession: SessionRecord | null = null;
let browserSessionRevision = 0;
let browserSessionInvalidated = false;
const browserSessionInvalidationListeners = new Set<() => void>();

export class InvalidSessionError extends Error {
  constructor() {
    super("invalid_session");
    this.name = "InvalidSessionError";
  }
}

export class ApiRequestError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryAfterMs: number | null;

  constructor(code: string, status: number, retryAfterMs: number | null = null) {
    super(code);
    this.name = "ApiRequestError";
    this.code = code;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export function isInvalidSessionError(error: unknown): error is InvalidSessionError {
  return (
    error instanceof InvalidSessionError ||
    (error instanceof Error && error.message === "invalid_session")
  );
}

export function clearBrowserSessionState(): void {
  browserSession = null;
  browserSessionRevision += 1;
}

export function getBrowserSessionSnapshot(): { session: SessionRecord | null; revision: number } {
  return { session: browserSession, revision: browserSessionRevision };
}

export function invalidateBrowserSession(): void {
  clearBrowserSessionState();

  if (browserSessionInvalidated) {
    return;
  }

  browserSessionInvalidated = true;

  for (const listener of browserSessionInvalidationListeners) {
    listener();
  }
}

export function subscribeToBrowserSessionInvalidation(listener: () => void): () => void {
  browserSessionInvalidationListeners.add(listener);

  return () => {
    browserSessionInvalidationListeners.delete(listener);
  };
}

export function resetBrowserSessionClientState(): void {
  clearBrowserSessionState();
  browserSessionInvalidated = false;
  browserSessionInvalidationListeners.clear();
}

function parseRetryAfterMs(value: string | null): number | null {
  if (value === null) {
    return null;
  }

  const parsedSeconds = Number(value);
  if (Number.isFinite(parsedSeconds) && parsedSeconds >= 0) {
    return Math.ceil(parsedSeconds * 1_000);
  }

  const parsedAt = Date.parse(value);
  if (!Number.isFinite(parsedAt)) {
    return null;
  }

  return Math.max(0, parsedAt - Date.now());
}

function normalizeBillingUsageMetric(metric?: Partial<BillingUsageMetric>): BillingUsageMetric {
  return {
    used: metric?.used ?? 0,
    limit: metric?.limit ?? 0
  };
}

export function normalizeBillingSummary(
  billing: Omit<BillingSummaryRecord, "allowances" | "trial"> & {
    allowances?: Partial<BillingSummaryRecord["allowances"]>;
    trial?: Partial<BillingSummaryRecord["trial"]>;
  }
): BillingSummaryRecord {
  return {
    ...billing,
    billing_state: billing.billing_state ?? null,
    allowances: {
      monthly_bundle_requests: normalizeBillingUsageMetric(
        billing.allowances?.monthly_bundle_requests
      ),
      monthly_raw_ingested_events: normalizeBillingUsageMetric(
        billing.allowances?.monthly_raw_ingested_events
      ),
      retained_bundle_cap: normalizeBillingUsageMetric(billing.allowances?.retained_bundle_cap),
      monthly_remote_activations: normalizeBillingUsageMetric(
        billing.allowances?.monthly_remote_activations
      ),
      monthly_alert_deliveries: normalizeBillingUsageMetric(
        billing.allowances?.monthly_alert_deliveries
      ),
      monthly_webhook_deliveries: normalizeBillingUsageMetric(
        billing.allowances?.monthly_webhook_deliveries
      )
    },
    trial: {
      available: billing.trial?.available ?? true,
      active: billing.trial?.active ?? false,
      plan:
        billing.trial?.plan === "solo" ||
        billing.trial?.plan === "team" ||
        billing.trial?.plan === "business"
          ? billing.trial.plan
          : null,
      started_at: billing.trial?.started_at ?? null,
      ends_at: billing.trial?.ends_at ?? null,
      used_at: billing.trial?.used_at ?? null,
      converted_at: billing.trial?.converted_at ?? null,
      expired_at: billing.trial?.expired_at ?? null,
      days_remaining: billing.trial?.days_remaining ?? null
    }
  };
}

export function assertBrowserSessionResponse(status: number, body: unknown): void {
  const error = body !== null && typeof body === "object" && "error" in body ? body.error : null;
  // Shared management routes retain their member-token error for CLI/MCP
  // compatibility. This client authenticates those routes with cookies only.
  if (status === 401 && (error === "invalid_session" || error === "invalid_member_token")) {
    invalidateBrowserSession();
    throw new InvalidSessionError();
  }
}

export async function readJson<T>(response: Response, sessionRevision?: number): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    // Session-lifecycle requests may finish parsing after another identity wins.
    if (sessionRevision === undefined || sessionRevision === browserSessionRevision) {
      assertBrowserSessionResponse(response.status, body);
    }

    throw new ApiRequestError(
      body?.error ?? `request_failed_${response.status}`,
      response.status,
      parseRetryAfterMs(response.headers.get("Retry-After"))
    );
  }

  return (await response.json()) as T;
}

export function rememberSession<T extends SessionRecord | null>(session: T): T {
  if (session !== null) {
    browserSessionInvalidated = false;
  }

  browserSession = session;
  browserSessionRevision += 1;
  return session;
}

export function buildBrowserSessionHeaders(includeJsonContentType = false): Record<string, string> {
  const headers: Record<string, string> = {};

  if (includeJsonContentType) {
    headers["Content-Type"] = "application/json";
  }

  if (browserSession !== null) {
    headers["X-CSRF-Token"] = browserSession.csrf_token;
  }

  return headers;
}

export function parseAttachmentFilename(contentDisposition: string | null): string | null {
  if (contentDisposition === null) {
    return null;
  }

  const utfMatch = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition);
  if (utfMatch?.[1] !== undefined) {
    return decodeURIComponent(utfMatch[1]);
  }

  const asciiMatch = /filename="?([^";]+)"?/i.exec(contentDisposition);
  return asciiMatch?.[1] ?? null;
}
