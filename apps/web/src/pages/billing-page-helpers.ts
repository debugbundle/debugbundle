import type { BillingSummaryRecord } from "../lib/api.js";

export interface PendingBillingCheckout {
  previousPlan: BillingSummaryRecord["plan"];
  targetPlan: "solo" | "team";
}

const BILLING_CHECKOUT_STORAGE_KEY = "debugbundle.billing.checkout";
const BILLING_WINDOW_REFRESH_BUFFER_MS = 1_000;
const BILLING_WINDOW_REFRESH_MAX_DELAY_MS = 86_400_000;
const BILLING_WINDOW_REFRESH_RETRY_DELAY_MS = 30_000;

interface BillingWindowFormatOptions {
  locale?: Intl.LocalesArgument;
  timeZone?: string;
}

interface BillingUsageWindow {
  starts_at: string;
  ends_at: string;
}

export function readPendingBillingCheckout(): PendingBillingCheckout | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.sessionStorage.getItem(BILLING_CHECKOUT_STORAGE_KEY);
  if (rawValue === null) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as Partial<PendingBillingCheckout>;
    if (
      (parsedValue.previousPlan === "free" || parsedValue.previousPlan === "solo" || parsedValue.previousPlan === "team") &&
      (parsedValue.targetPlan === "solo" || parsedValue.targetPlan === "team")
    ) {
      return {
        previousPlan: parsedValue.previousPlan,
        targetPlan: parsedValue.targetPlan
      };
    }
  } catch {
    return null;
  }

  return null;
}

export function writePendingBillingCheckout(checkout: PendingBillingCheckout): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(BILLING_CHECKOUT_STORAGE_KEY, JSON.stringify(checkout));
}

export function clearPendingBillingCheckout(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(BILLING_CHECKOUT_STORAGE_KEY);
}

export function billingReflectsCheckout(
  billing: BillingSummaryRecord,
  pendingCheckout: PendingBillingCheckout | null,
  baseline: BillingSummaryRecord | null
): boolean {
  if (pendingCheckout !== null) {
    if (billing.plan !== pendingCheckout.targetPlan) {
      return false;
    }

    if (baseline?.trial.active === true && baseline.plan === pendingCheckout.targetPlan) {
      return (
        billing.trial.active === false ||
        billing.stripe_customer_id !== baseline.stripe_customer_id ||
        billing.billing_state !== baseline.billing_state
      );
    }

    return true;
  }

  if (baseline === null) {
    return false;
  }

  return billing.plan !== baseline.plan || billing.stripe_customer_id !== baseline.stripe_customer_id;
}

export function formatPlanName(plan: BillingSummaryRecord["plan"]): string {
  switch (plan) {
    case "solo":
      return "Solo";
    case "team":
      return "Team";
    default:
      return "Free";
  }
}

export function resolveRequestedTrialPlan(value: string | null): "solo" | "team" | null {
  return value === "solo" || value === "team" ? value : null;
}

export function formatTrialDaysRemaining(daysRemaining: number | null): string | null {
  if (daysRemaining === null) {
    return null;
  }

  return `${daysRemaining} ${daysRemaining === 1 ? "day" : "days"} left`;
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

function formatDateInTimeZone(value: string, options: BillingWindowFormatOptions): string {
  return new Intl.DateTimeFormat(options.locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: options.timeZone
  }).format(new Date(value));
}

function formatTimeInTimeZone(
  value: string,
  options: BillingWindowFormatOptions & { timeZone: string }
): string {
  return new Intl.DateTimeFormat(options.locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: options.timeZone,
    timeZoneName: "short"
  }).format(new Date(value));
}

function isUtcTimeZone(timeZone: string): boolean {
  return timeZone === "UTC" || timeZone === "Etc/UTC" || timeZone === "Etc/GMT" || timeZone === "GMT";
}

export function formatBillingWindowDescription(
  usageWindow: BillingUsageWindow,
  options: BillingWindowFormatOptions = {}
): string {
  const timeZone = options.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  const startsAt = formatDateInTimeZone(usageWindow.starts_at, { ...options, timeZone });
  const endsAt = formatDateInTimeZone(usageWindow.ends_at, { ...options, timeZone });
  const localResetAt = `${endsAt} at ${formatTimeInTimeZone(usageWindow.ends_at, {
    ...options,
    timeZone
  })}`;
  const utcResetDate = formatDateInTimeZone(usageWindow.ends_at, {
    ...options,
    timeZone: "UTC"
  });
  const utcResetTime = formatTimeInTimeZone(usageWindow.ends_at, {
    ...options,
    timeZone: "UTC"
  });
  const utcResetAt = endsAt === utcResetDate ? utcResetTime : `${utcResetDate} at ${utcResetTime}`;
  const resetAt = isUtcTimeZone(timeZone) ? localResetAt : `${localResetAt} (${utcResetAt})`;

  return `Current window: ${startsAt} to ${endsAt}. Resets ${resetAt}.`;
}

export function getBillingWindowRefreshDelay(endsAt: string, now = Date.now()): number | null {
  const parsedEndsAt = Date.parse(endsAt);
  if (!Number.isFinite(parsedEndsAt)) {
    return null;
  }

  const remaining = parsedEndsAt + BILLING_WINDOW_REFRESH_BUFFER_MS - now;
  if (remaining <= 0) {
    return BILLING_WINDOW_REFRESH_RETRY_DELAY_MS;
  }

  return Math.min(remaining, BILLING_WINDOW_REFRESH_MAX_DELAY_MS);
}

export function formatActiveProjectCount(value: number): string {
  return `${value} active ${value === 1 ? "project" : "projects"}`;
}

export function formatAllowanceUnitCount(value: number): string {
  return `${value} allowance ${value === 1 ? "unit" : "units"}`;
}
