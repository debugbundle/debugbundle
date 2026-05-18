import type { OperationalEmailDeliveryStore } from "./types.js";

export type AllowanceMeter =
  | "monthly_bundle_requests"
  | "monthly_raw_ingested_events"
  | "retained_bundle_cap"
  | "monthly_remote_activations"
  | "monthly_alert_deliveries"
  | "monthly_webhook_deliveries";

export interface QueueAllowanceThresholdNotificationsInput {
  store: Pick<OperationalEmailDeliveryStore, "queueProjectOperationalEmailDelivery">;
  project_id: string;
  meter: AllowanceMeter;
  previous_used: number;
  next_used: number;
  limit: number;
  usage_window_starts_at?: string | null;
  usage_window_ends_at?: string | null;
}

const MONTHLY_ALLOWANCE_METERS = new Set<AllowanceMeter>([
  "monthly_bundle_requests",
  "monthly_raw_ingested_events",
  "monthly_remote_activations",
  "monthly_alert_deliveries",
  "monthly_webhook_deliveries"
]);

function isMonthlyAllowanceMeter(meter: AllowanceMeter): boolean {
  return MONTHLY_ALLOWANCE_METERS.has(meter);
}

function crossesThreshold(previousUsed: number, nextUsed: number, limit: number, ratio: number): boolean {
  if (limit <= 0) {
    return false;
  }

  const threshold = limit * ratio;
  return previousUsed < threshold && nextUsed >= threshold;
}

function buildAllowanceDedupeKey(input: {
  meter: AllowanceMeter;
  kind: "allowance_warning_80" | "allowance_limit_reached";
  limit: number;
  usage_window_starts_at?: string | null;
}): string {
  if (input.meter === "retained_bundle_cap") {
    return `${input.kind}:${input.meter}:limit:${input.limit}`;
  }

  return `${input.kind}:${input.meter}:window:${input.usage_window_starts_at ?? "unknown"}`;
}

function withUsageWindowStart(input: string | null | undefined): { usage_window_starts_at?: string | null } {
  if (input === undefined) {
    return {};
  }

  return { usage_window_starts_at: input };
}

export function getAllowanceMeterLabel(meter: AllowanceMeter): string {
  switch (meter) {
    case "monthly_bundle_requests":
      return "Bundle requests";
    case "monthly_raw_ingested_events":
      return "Raw ingested events";
    case "retained_bundle_cap":
      return "Retained bundle count";
    case "monthly_remote_activations":
      return "Remote activations";
    case "monthly_alert_deliveries":
      return "Alert deliveries";
    case "monthly_webhook_deliveries":
      return "Lifecycle webhook deliveries";
  }
}

export function getAllowanceLimitBehavior(meter: AllowanceMeter): string {
  switch (meter) {
    case "monthly_bundle_requests":
      return "new hosted bundle generation is skipped until the usage window resets";
    case "monthly_raw_ingested_events":
      return "new ingestion requests are rejected until the usage window resets";
    case "retained_bundle_cap":
      return "new bundles are still generated, but the oldest retained bundles are rotated out to stay within the cap";
    case "monthly_remote_activations":
      return "new remote probe activations are rejected until the usage window resets";
    case "monthly_alert_deliveries":
      return "new alert deliveries are suppressed until the usage window resets";
    case "monthly_webhook_deliveries":
      return "new lifecycle webhook deliveries and synthetic test deliveries are suppressed until the usage window resets";
  }
}

export async function queueAllowanceThresholdNotifications(
  input: QueueAllowanceThresholdNotificationsInput
): Promise<void> {
  if (input.limit <= 0) {
    return;
  }

  if (crossesThreshold(input.previous_used, input.next_used, input.limit, 0.8)) {
    await input.store.queueProjectOperationalEmailDelivery({
      project_id: input.project_id,
      kind: "allowance_warning_80",
      dedupe_key: buildAllowanceDedupeKey({
        meter: input.meter,
        kind: "allowance_warning_80",
        limit: input.limit,
        ...withUsageWindowStart(input.usage_window_starts_at)
      }),
      payload: {
        meter: input.meter,
        used: input.next_used,
        limit: input.limit,
        usage_window_ends_at: isMonthlyAllowanceMeter(input.meter) ? input.usage_window_ends_at ?? null : null
      }
    });
  }

  if (crossesThreshold(input.previous_used, input.next_used, input.limit, 1)) {
    await queueAllowanceLimitReachedNotification({
      store: input.store,
      project_id: input.project_id,
      meter: input.meter,
      used: input.next_used,
      limit: input.limit,
      usage_window_starts_at: input.usage_window_starts_at ?? null,
      usage_window_ends_at: isMonthlyAllowanceMeter(input.meter) ? input.usage_window_ends_at ?? null : null
    });
  }
}

export async function queueAllowanceLimitReachedNotification(input: {
  store: Pick<OperationalEmailDeliveryStore, "queueProjectOperationalEmailDelivery">;
  project_id: string;
  meter: AllowanceMeter;
  used: number;
  limit: number;
  usage_window_starts_at?: string | null;
  usage_window_ends_at?: string | null;
}): Promise<void> {
  if (input.limit <= 0) {
    return;
  }

  await input.store.queueProjectOperationalEmailDelivery({
    project_id: input.project_id,
    kind: "allowance_limit_reached",
    dedupe_key: buildAllowanceDedupeKey({
      meter: input.meter,
      kind: "allowance_limit_reached",
      limit: input.limit,
      ...withUsageWindowStart(input.usage_window_starts_at)
    }),
    payload: {
      meter: input.meter,
      used: input.used,
      limit: input.limit,
      usage_window_ends_at: isMonthlyAllowanceMeter(input.meter) ? input.usage_window_ends_at ?? null : null
    }
  });
}

export async function queueRetentionRotationNotice(input: {
  store: Pick<OperationalEmailDeliveryStore, "queueProjectOperationalEmailDelivery">;
  project_id: string;
  rotated_owner_count: number;
  retained_bundle_limit: number;
  dedupe_date: string;
}): Promise<void> {
  if (input.rotated_owner_count <= 0) {
    return;
  }

  await input.store.queueProjectOperationalEmailDelivery({
    project_id: input.project_id,
    kind: "retention_rotation_notice",
    dedupe_key: `retention_rotation_notice:${input.dedupe_date}`,
    payload: {
      rotated_owner_count: input.rotated_owner_count,
      retained_bundle_limit: input.retained_bundle_limit
    }
  });
}
