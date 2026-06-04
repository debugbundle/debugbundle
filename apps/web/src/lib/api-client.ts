import type {
  BillingSummaryRecord,
  BillingUsageMetric,
  SessionRecord
} from "./api-types.js";

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

let browserSessionCsrfToken: string | null = null;
let browserSessionInvalidated = false;
const browserSessionInvalidationListeners = new Set<() => void>();

export class InvalidSessionError extends Error {
  constructor() {
    super("invalid_session");
    this.name = "InvalidSessionError";
  }
}

export function isInvalidSessionError(error: unknown): error is InvalidSessionError {
  return (
    error instanceof InvalidSessionError ||
    (error instanceof Error && error.message === "invalid_session")
  );
}

export function clearBrowserSessionState(): void {
  browserSessionCsrfToken = null;
}

function invalidateBrowserSession(): void {
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
        billing.trial?.plan === "solo" || billing.trial?.plan === "team"
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

export async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;

    if (response.status === 401 && body?.error === "invalid_session") {
      invalidateBrowserSession();
      throw new InvalidSessionError();
    }

    throw new Error(body?.error ?? `request_failed_${response.status}`);
  }

  return (await response.json()) as T;
}

export function rememberSession<T extends SessionRecord | null>(session: T): T {
  if (session !== null) {
    browserSessionInvalidated = false;
  }

  browserSessionCsrfToken = session?.csrf_token ?? null;
  return session;
}

export function buildBrowserSessionHeaders(
  includeJsonContentType = false
): Record<string, string> {
  const headers: Record<string, string> = {};

  if (includeJsonContentType) {
    headers["Content-Type"] = "application/json";
  }

  if (browserSessionCsrfToken !== null) {
    headers["X-CSRF-Token"] = browserSessionCsrfToken;
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
