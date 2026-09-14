import { type TierName } from "../../shared-types/src/index.js";
import type { AccountAnalyticsStore } from "./account-analytics-store.js";
import type { AlertRuleRecord, Queryable } from "./types.js";

export function mapAlertRuleRow(row: {
  alert_id: string;
  project_id: string;
  created_by_user_id: string;
  service_id: string | null;
  channel: AlertRuleRecord["channel"];
  condition_type: AlertRuleRecord["condition_type"];
  severity_min: AlertRuleRecord["severity_min"];
  severity_lifecycle_scope: AlertRuleRecord["severity_lifecycle_scope"];
  cooldown_seconds: number;
  config: Record<string, unknown>;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}): AlertRuleRecord {
  return {
    alert_id: row.alert_id,
    project_id: row.project_id,
    created_by_user_id: row.created_by_user_id,
    service_id: row.service_id,
    channel: row.channel,
    condition_type: row.condition_type,
    severity_min: row.severity_min,
    severity_lifecycle_scope: row.severity_lifecycle_scope,
    cooldown_seconds: Number(row.cooldown_seconds),
    config: row.config,
    is_enabled: row.is_enabled,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export function normalizeOrganizationPlan(value: unknown): TierName {
  return value === "solo" ? "solo" : value === "team" ? "team" : "free";
}

export function mapOptionalRow<TInput, TOutput>(
  row: TInput | undefined,
  mapper: (value: TInput) => TOutput
): TOutput | null {
  return row === undefined ? null : mapper(row);
}

export async function deleteProjectMemberOwnedAutomation(
  db: Queryable,
  input: {
    project_id: string;
    user_id: string;
  }
): Promise<void> {
  await db.query(
    `
      DELETE FROM github_dispatch_rules
      WHERE project_id = $1::uuid
        AND created_by_user_id = $2::uuid
    `,
    [input.project_id, input.user_id]
  );
  await db.query(
    `
      DELETE FROM agent_webhooks
      WHERE project_id = $1::uuid
        AND created_by_user_id = $2::uuid
    `,
    [input.project_id, input.user_id]
  );
  await db.query(
    `
      DELETE FROM alert_rules
      WHERE project_id = $1::uuid
        AND created_by_user_id = $2::uuid
    `,
    [input.project_id, input.user_id]
  );
}

export function optionalFieldValue<T>(include: boolean, value: T | null | undefined): T | null {
  if (!include) {
    return null;
  }

  return value ?? null;
}

export function optionalJsonFieldValue(
  include: boolean,
  value: Record<string, unknown> | undefined
): string | null {
  if (!include) {
    return null;
  }

  return JSON.stringify(value ?? {});
}

export type PostgresMetadataStoreOptions = {
  accountAnalyticsStore?: AccountAnalyticsStore;
};

export async function recordProjectMetric(
  accountAnalyticsStore: AccountAnalyticsStore,
  tx: Queryable,
  input: {
    organization_id: string;
    project_id: string;
    occurred_at: string;
    metric_key: "project_created" | "project_deleted";
  }
): Promise<void> {
  await accountAnalyticsStore.withDb(tx).recordMetricDeltas({
    organization_id: input.organization_id,
    occurred_at: input.occurred_at,
    source: input.metric_key,
    dedupe_key: `${input.metric_key}:${input.project_id}`,
    deltas: {
      [input.metric_key]: 1
    }
  });
}

export async function recordProjectMetricDeltas(
  accountAnalyticsStore: AccountAnalyticsStore | undefined,
  tx: Queryable,
  input: {
    organization_id: string;
    occurred_at: string;
    source: string;
    dedupe_key: string;
    deltas: Partial<
      Record<"remote_probe_activations_created" | "remote_probe_activations_expired", number>
    >;
  }
): Promise<void> {
  if (accountAnalyticsStore === undefined) {
    return;
  }

  await accountAnalyticsStore.withDb(tx).recordMetricDeltas(input);
}
