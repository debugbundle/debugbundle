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

const DASHBOARD_READ_FRESHNESS = {
  live: 30_000,
  configuration: 60_000,
  history: 300_000
} as const;
const MAX_DASHBOARD_READS = 256;
const MAX_CONCURRENT_DASHBOARD_READS = 4;
interface DashboardRead {
  pending?: Promise<unknown>;
  result?: { value: unknown; freshUntil: number };
}
const dashboardReads = new Map<string, DashboardRead>();
let dashboardReadScope = 0;
let dashboardRateLimitedUntil = 0;
let dashboardReadSlots: { active: number; waiting: Array<() => void> } = { active: 0, waiting: [] };

/** A successful write invalidates all query variants of the affected resource. */
export function invalidateDashboardReads(
  path: string,
  scope: "resource" | "subtree" = "subtree"
): void {
  for (const key of dashboardReads.keys()) {
    if (
      key === path ||
      key.startsWith(`${path}?`) ||
      (scope === "subtree" && key.startsWith(`${path}/`))
    ) {
      dashboardReads.delete(key);
    }
  }
}

/** A change in project access fences every cached resource, including in-flight reads. */
export function clearDashboardReads(): void {
  dashboardReadScope += 1;
  dashboardReadSlots = { active: 0, waiting: [] };
  dashboardReads.clear();
}

function resetDashboardReads(): void {
  clearDashboardReads();
  dashboardRateLimitedUntil = 0;
}

/** Opt in only for cookie-authenticated, repeatable dashboard GETs. */
export async function readDashboardJson<T>(
  path: string,
  freshness: keyof typeof DASHBOARD_READ_FRESHNESS,
  options: { refresh?: boolean } = {}
): Promise<T> {
  const load = (): Promise<Response> =>
    fetch(`${API_BASE}${path}`, { credentials: "include", cache: "no-store" });
  const snapshot = getBrowserSessionSnapshot();
  if (snapshot.session === null) return readJson<T>(await load(), snapshot.revision);

  const requestScope = dashboardReadScope;
  const entry = dashboardReads.get(path);
  const now = Date.now();
  if (entry?.pending) return entry.pending as Promise<T>;
  if (!options.refresh && entry?.result && entry.result.freshUntil > now)
    return entry.result.value as T;
  const slots = dashboardReadSlots;
  const next: DashboardRead = {};
  dashboardReads.set(path, next);
  const pending = (async (): Promise<T> => {
    // A cold overview can request many distinct resources. Hand each released slot
    // to one waiter, which rechecks its authorization and backoff before fetching.
    if (slots.active >= MAX_CONCURRENT_DASHBOARD_READS) {
      await new Promise<void>((resume) => slots.waiting.push(resume));
    } else {
      slots.active += 1;
    }
    try {
      if (requestScope !== dashboardReadScope) throw new InvalidSessionError();
      const retryAfter = dashboardRateLimitedUntil - Date.now();
      if (retryAfter > 0) throw new ApiRequestError("rate_limited", 429, retryAfter);
      if (dashboardReads.get(path) !== next) return readDashboardJson<T>(path, freshness);
      const response = await load();
      if (requestScope !== dashboardReadScope) throw new InvalidSessionError();
      const value = await readJson<T>(response, snapshot.revision);
      if (requestScope !== dashboardReadScope) throw new InvalidSessionError();
      // A save may have invalidated this GET while its response was in flight.
      if (dashboardReads.get(path) !== next) return readDashboardJson<T>(path, freshness);
      next.result = { value, freshUntil: Date.now() + DASHBOARD_READ_FRESHNESS[freshness] };
      return value;
    } catch (error) {
      if (
        requestScope === dashboardReadScope &&
        error instanceof ApiRequestError &&
        error.status === 429 &&
        error.code === "rate_limited"
      ) {
        dashboardRateLimitedUntil = Math.max(
          dashboardRateLimitedUntil,
          Date.now() + (error.retryAfterMs ?? 5_000)
        );
      }
      throw error;
    } finally {
      const resume = slots.waiting.shift();
      if (resume) resume();
      else slots.active -= 1;
      if (dashboardReads.get(path) === next) {
        delete next.pending;
        if (!next.result) dashboardReads.delete(path);
        else if (dashboardReads.size > MAX_DASHBOARD_READS) {
          for (const [cachedPath, cached] of dashboardReads) {
            if (!cached.pending) dashboardReads.delete(cachedPath);
            if (dashboardReads.size <= MAX_DASHBOARD_READS) break;
          }
        }
      }
    }
  })();
  next.pending = pending;
  return pending;
}

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
  resetDashboardReads();
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
  if (
    browserSession?.session_id !== session?.session_id ||
    browserSession?.user_id !== session?.user_id ||
    browserSession?.organization_id !== session?.organization_id ||
    browserSession?.organization_plan !== session?.organization_plan ||
    browserSession?.role !== session?.role
  ) {
    resetDashboardReads();
  }
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
