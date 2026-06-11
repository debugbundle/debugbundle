import { randomUUID } from "node:crypto";

import { getTierCapabilities, type TierName } from "../../shared-types/src/index.js";

import type { AccountAnalyticsStore } from "./account-analytics-store.js";
import { buildBillableIncidentEventsPredicateSql } from "./helpers.js";
import {
  isPlanDowngrade,
  normalizePlanForDowngradeAudit,
  recordPlanDowngradeCleanupAudit
} from "./plan-downgrade-audit.js";
import { createOrganizationPlanCleanupService } from "./plan-downgrade-cleanup.js";
import { runInTransaction } from "./transaction.js";
import type { Queryable } from "./types.js";

export interface BillingUsageMetric {
  used: number;
  limit: number;
}

export interface BillingCapacityPendingReduction {
  additional_purchased: number;
  total: number;
  effective_at: string;
}

export type BillingState =
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete"
  | "admin_override"
  | "trialing"
  | "trial_expired"
  | null;

export type BillingTrialPlan = Exclude<TierName, "free">;

export interface BillingTrialSummary {
  available: boolean;
  active: boolean;
  plan: BillingTrialPlan | null;
  started_at: string | null;
  ends_at: string | null;
  used_at: string | null;
  converted_at: string | null;
  expired_at: string | null;
  days_remaining: number | null;
}

export interface BillingSummaryRecord {
  plan: TierName;
  billing_state: BillingState;
  stripe_customer_id: string | null;
  active_projects: number;
  capacity_units: {
    total: number;
    included: number;
    additional_purchased: number;
    pending_reduction: BillingCapacityPendingReduction | null;
  };
  usage_window: {
    starts_at: string;
    ends_at: string;
  };
  allowances: {
    monthly_bundle_requests: BillingUsageMetric;
    monthly_raw_ingested_events: BillingUsageMetric;
    retained_bundle_cap: BillingUsageMetric;
    monthly_remote_activations: BillingUsageMetric;
    monthly_alert_deliveries: BillingUsageMetric;
    monthly_webhook_deliveries: BillingUsageMetric;
  };
  trial: BillingTrialSummary;
}

export interface TrialLifecycleNotificationCandidate {
  organization_id: string;
  current_plan: TierName;
  trial_plan: BillingTrialPlan;
  trial_started_at: string;
  trial_ends_at: string;
  trial_converted_at: string | null;
  trial_expired_at: string | null;
}

export interface TrialLifecycleBillingStore {
  claimTrialStartedNotificationCandidates(input: {
    limit: number;
  }): Promise<TrialLifecycleNotificationCandidate[]>;
  claimTrialEndingSoonNotificationCandidates(input: {
    now: string;
    reminder_days: 1 | 7;
    limit: number;
  }): Promise<TrialLifecycleNotificationCandidate[]>;
  claimExpiredTrialCandidates(input: {
    now: string;
    limit: number;
  }): Promise<TrialLifecycleNotificationCandidate[]>;
  claimTrialConvertedNotificationCandidates(input: {
    limit: number;
  }): Promise<TrialLifecycleNotificationCandidate[]>;
  recordTrialLifecycleEvent(input: {
    organization_id: string;
    event_type: string;
    dedupe_key: string;
  }): Promise<boolean>;
}

export interface BillingStore {
  getBillingSummaryForOrganization(input: {
    organization_id: string;
    now: string;
  }): Promise<BillingSummaryRecord | null>;
  startTrialForOrganization(input: {
    organization_id: string;
    target_plan: BillingTrialPlan;
    started_at: string;
    ends_at: string;
  }): Promise<BillingSummaryRecord | "billing_not_found" | "trial_unavailable">;
  expireTrialForOrganization(input: {
    organization_id: string;
    now: string;
  }): Promise<BillingSummaryRecord | "billing_not_found" | "trial_not_expired">;
  getBillingSummaryForProject(input: {
    project_id: string;
    now: string;
  }): Promise<BillingSummaryRecord | null>;
  incrementOrgUsageCounter(input: {
    organization_id: string;
    period_starts_at: string;
    count: number;
  }): Promise<void>;
  incrementProjectUsageCounter(input: {
    project_id: string;
    period_starts_at: string;
    count: number;
  }): Promise<void>;
}

type PostgresBillingStoreOptions = {
  accountAnalyticsStore?: AccountAnalyticsStore;
};

async function recordBillingMetricDeltas(
  accountAnalyticsStore: AccountAnalyticsStore | undefined,
  tx: Queryable,
  input: {
    organization_id: string;
    occurred_at: string;
    source: string;
    dedupe_key: string;
    deltas: Partial<Record<"trial_started" | "trial_expired", number>>;
  }
): Promise<void> {
  if (accountAnalyticsStore === undefined) {
    return;
  }

  await accountAnalyticsStore.withDb(tx).recordMetricDeltas(input);
}

function normalizePlan(plan: string | null | undefined): TierName {
  if (plan === "solo" || plan === "team") {
    return plan;
  }

  return "free";
}

function normalizeBillingState(value: string | null | undefined): BillingState {
  switch (value) {
    case "active":
    case "past_due":
    case "canceled":
    case "unpaid":
    case "incomplete":
    case "admin_override":
    case "trialing":
    case "trial_expired":
      return value;
    default:
      return null;
  }
}

function normalizeTrialPlan(value: string | null | undefined): BillingTrialPlan | null {
  if (value === "solo" || value === "team") {
    return value;
  }

  return null;
}

function buildUsageWindow(now: Date): { starts_at: string; ends_at: string } {
  const startsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const endsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  return {
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString()
  };
}

function resolveUsageWindow(input: {
  now: Date;
  plan: TierName;
  billing_period_starts_at: string | null;
  billing_period_ends_at: string | null;
}): { starts_at: string; ends_at: string } {
  if (
    input.plan !== "free" &&
    input.billing_period_starts_at !== null &&
    input.billing_period_ends_at !== null &&
    input.billing_period_starts_at < input.billing_period_ends_at
  ) {
    return {
      starts_at: input.billing_period_starts_at,
      ends_at: input.billing_period_ends_at
    };
  }

  return buildUsageWindow(input.now);
}

function buildTrialSummary(input: {
  now: Date;
  plan: TierName;
  billing_state: BillingState;
  stripe_subscription_id: string | null;
  trial_plan: BillingTrialPlan | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  trial_used_at: string | null;
  trial_converted_at: string | null;
  trial_expired_at: string | null;
}): BillingTrialSummary {
  const active =
    input.billing_state === "trialing" &&
    input.stripe_subscription_id === null &&
    input.trial_plan !== null &&
    input.trial_started_at !== null &&
    input.trial_ends_at !== null &&
    input.trial_started_at <= input.now.toISOString() &&
    input.trial_ends_at > input.now.toISOString();
  const daysRemaining =
    active && input.trial_ends_at !== null
      ? Math.max(
          1,
          Math.ceil(
            (new Date(input.trial_ends_at).getTime() - input.now.getTime()) / (24 * 60 * 60 * 1000)
          )
        )
      : null;

  return {
    available: input.trial_used_at === null && input.plan === "free",
    active,
    plan: input.trial_plan,
    started_at: input.trial_started_at,
    ends_at: input.trial_ends_at,
    used_at: input.trial_used_at,
    converted_at: input.trial_converted_at,
    expired_at: input.trial_expired_at,
    days_remaining: daysRemaining
  };
}

function toSqlStringLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function readCount(db: Queryable, sql: string, params: unknown[]): Promise<number> {
  const result = await db.query<{ count: number }>(sql, params);
  return result.rows[0]?.count ?? 0;
}

async function tableExists(db: Queryable, tableName: string): Promise<boolean> {
  const result = await db.query<{ exists: boolean }>(
    `
      SELECT to_regclass($1) IS NOT NULL AS exists
    `,
    [`public.${tableName}`]
  );

  return result.rows[0]?.exists ?? false;
}

export function createPostgresBillingStore(
  db: Queryable,
  options: PostgresBillingStoreOptions = {}
): BillingStore & TrialLifecycleBillingStore {
  const accountAnalyticsStore = options.accountAnalyticsStore;

  async function claimTrialLifecycleCandidates(input: {
    sql: string;
    params: unknown[];
    event_type: string;
    dedupe_key: (candidate: TrialLifecycleNotificationCandidate) => string;
  }): Promise<TrialLifecycleNotificationCandidate[]> {
    const result = await db.query<{
      organization_id: string;
      current_plan: string;
      trial_plan: string;
      trial_started_at: string;
      trial_ends_at: string;
      trial_converted_at: string | null;
      trial_expired_at: string | null;
    }>(input.sql, input.params);

    const claimed: TrialLifecycleNotificationCandidate[] = [];

    for (const row of result.rows) {
      const trialPlan = normalizeTrialPlan(row.trial_plan);
      if (
        trialPlan === null ||
        row.trial_started_at === null ||
        row.trial_ends_at === null
      ) {
        continue;
      }

      const candidate: TrialLifecycleNotificationCandidate = {
        organization_id: row.organization_id,
        current_plan: normalizePlan(row.current_plan),
        trial_plan: trialPlan,
        trial_started_at: row.trial_started_at,
        trial_ends_at: row.trial_ends_at,
        trial_converted_at: row.trial_converted_at,
        trial_expired_at: row.trial_expired_at
      };
      const dedupeKey = input.dedupe_key(candidate);

      const existing = await db.query<{ exists: boolean }>(
        `
          SELECT EXISTS (
            SELECT 1
            FROM trial_lifecycle_events
            WHERE organization_id = $1::uuid
              AND event_type = $2
              AND dedupe_key = $3
          ) AS exists
        `,
        [candidate.organization_id, input.event_type, dedupeKey]
      );

      if (existing.rows[0]?.exists !== true) {
        claimed.push(candidate);
      }
    }

    return claimed;
  }

  async function recordTrialLifecycleEvent(input: {
    organization_id: string;
    event_type: string;
    dedupe_key: string;
  }): Promise<boolean> {
    const insert = await db.query<{ id: string }>(
      `
        INSERT INTO trial_lifecycle_events (
          id,
          organization_id,
          event_type,
          dedupe_key,
          created_at
        )
        VALUES (
          $1::uuid,
          $2::uuid,
          $3,
          $4,
          now()
        )
        ON CONFLICT (organization_id, event_type, dedupe_key)
        DO NOTHING
        RETURNING id::text AS id
      `,
      [randomUUID(), input.organization_id, input.event_type, input.dedupe_key]
    );

    return insert.rows[0]?.id !== undefined;
  }

  async function getBillingSummaryForOrganization(input: {
    organization_id: string;
    now: string;
  }): Promise<BillingSummaryRecord | null> {
    const organizationResult = await db.query<{
      plan: string;
      billing_state: string | null;
      stripe_customer_id: string | null;
      stripe_subscription_id: string | null;
      additional_capacity_units: number | null;
      billing_period_starts_at: string | null;
      billing_period_ends_at: string | null;
      trial_plan: string | null;
      trial_started_at: string | null;
      trial_ends_at: string | null;
      trial_used_at: string | null;
      trial_converted_at: string | null;
      trial_expired_at: string | null;
    }>(
      `
          SELECT
            COALESCE(plan, 'free') AS plan,
            to_jsonb(organizations) ->> 'billing_state' AS billing_state,
            stripe_customer_id,
            to_jsonb(organizations) ->> 'stripe_subscription_id' AS stripe_subscription_id,
            COALESCE((to_jsonb(organizations) ->> 'additional_capacity_units')::int, 0)::int AS additional_capacity_units,
            to_jsonb(organizations) ->> 'billing_period_starts_at' AS billing_period_starts_at,
            to_jsonb(organizations) ->> 'billing_period_ends_at' AS billing_period_ends_at,
            to_jsonb(organizations) ->> 'trial_plan' AS trial_plan,
            to_jsonb(organizations) ->> 'trial_started_at' AS trial_started_at,
            to_jsonb(organizations) ->> 'trial_ends_at' AS trial_ends_at,
            to_jsonb(organizations) ->> 'trial_used_at' AS trial_used_at,
            to_jsonb(organizations) ->> 'trial_converted_at' AS trial_converted_at,
            to_jsonb(organizations) ->> 'trial_expired_at' AS trial_expired_at
          FROM organizations
          WHERE id = $1
          LIMIT 1
        `,
      [input.organization_id]
    );

    const organization = organizationResult.rows[0];
    if (organization === undefined) {
      return null;
    }

    const plan = normalizePlan(organization.plan);
    const billingState = normalizeBillingState(organization.billing_state);
    const stripeSubscriptionId = organization.stripe_subscription_id ?? null;
    const billingPeriodStartsAt = organization.billing_period_starts_at ?? null;
    const billingPeriodEndsAt = organization.billing_period_ends_at ?? null;
    const now = new Date(input.now);
    const capabilities = getTierCapabilities(plan);
    const usageWindow = resolveUsageWindow({
      now,
      plan,
      billing_period_starts_at: billingPeriodStartsAt,
      billing_period_ends_at: billingPeriodEndsAt
    });
    const additionalPurchased = Math.max(0, organization.additional_capacity_units ?? 0);
    const totalCapacityUnits = capabilities.included_capacity_units + additionalPurchased;
    const monthlyRawIngestedEventsPredicate = buildBillableIncidentEventsPredicateSql({
      planSql: toSqlStringLiteral(plan),
      eventClassSql: "ie.event_class"
    });

    const [
      projectCount,
      monthlyBundleRequests,
      monthlyRawIngestedEvents,
      retainedBundles,
      monthlyRemoteActivations,
      alertDeliveriesTablePresent,
      alertEmailDigestsTablePresent,
      webhookDeliveriesTablePresent,
      usageCountersTablePresent
    ] = await Promise.all([
      readCount(
        db,
        `
            SELECT COUNT(*)::int AS count
            FROM projects
            WHERE organization_id = $1
          `,
        [input.organization_id]
      ),
      readCount(
        db,
        `
            SELECT COUNT(*)::int AS count
            FROM bundle_generations bg
            JOIN projects p ON p.id = bg.project_id
            WHERE p.organization_id = $1
              AND bg.created_at >= $2::timestamptz
              AND bg.created_at < $3::timestamptz
          `,
        [input.organization_id, usageWindow.starts_at, usageWindow.ends_at]
      ),
      readCount(
        db,
        `
            SELECT COUNT(*)::int AS count
            FROM incident_events ie
            JOIN incidents i ON i.id = ie.incident_id
            JOIN projects p ON p.id = i.project_id
            WHERE p.organization_id = $1
              AND (${monthlyRawIngestedEventsPredicate})
              AND ie.occurred_at >= $2::timestamptz
              AND ie.occurred_at < $3::timestamptz
          `,
        [input.organization_id, usageWindow.starts_at, usageWindow.ends_at]
      ),
      readCount(
        db,
        `
            SELECT COUNT(DISTINCT COALESCE(bg.incident_id::text, bg.improvement_opportunity_id::text))::int AS count
            FROM bundle_generations bg
            JOIN projects p ON p.id = bg.project_id
            WHERE p.organization_id = $1
          `,
        [input.organization_id]
      ),
      readCount(
        db,
        `
            SELECT COUNT(*)::int AS count
            FROM probe_activations pa
            JOIN projects p ON p.id = pa.project_id
            WHERE p.organization_id = $1
              AND pa.created_at >= $2::timestamptz
              AND pa.created_at < $3::timestamptz
          `,
        [input.organization_id, usageWindow.starts_at, usageWindow.ends_at]
      ),
      tableExists(db, "alert_deliveries"),
      tableExists(db, "alert_email_digests"),
      tableExists(db, "webhook_deliveries"),
      tableExists(db, "org_usage_counters")
    ]);

    const monthlyAlertDeliveries =
      alertDeliveriesTablePresent || alertEmailDigestsTablePresent
        ? await readCount(
            db,
            `
              SELECT COUNT(*)::int AS count
              FROM (
                ${[
                  alertDeliveriesTablePresent
                    ? `
                        SELECT ad.project_id, ad.created_at
                        FROM alert_deliveries ad
                      `
                    : null,
                  alertEmailDigestsTablePresent
                    ? `
                        SELECT dig.project_id, dig.created_at
                        FROM alert_email_digests dig
                      `
                    : null
                ]
                  .filter((part): part is string => part !== null)
                  .join("\nUNION ALL\n")}
              ) deliveries
              JOIN projects p ON p.id = deliveries.project_id
              WHERE p.organization_id = $1
                AND deliveries.created_at >= $2::timestamptz
                AND deliveries.created_at < $3::timestamptz
            `,
            [input.organization_id, usageWindow.starts_at, usageWindow.ends_at]
          )
        : 0;

    const monthlyWebhookDeliveries = webhookDeliveriesTablePresent
      ? await readCount(
          db,
          `
              SELECT COUNT(*)::int AS count
              FROM webhook_deliveries wd
              JOIN projects p ON p.id = wd.project_id
              WHERE p.organization_id = $1
                AND wd.created_at >= $2::timestamptz
                AND wd.created_at < $3::timestamptz
            `,
          [input.organization_id, usageWindow.starts_at, usageWindow.ends_at]
        )
      : 0;

    const usageCounterValue = usageCountersTablePresent
      ? await readCount(
          db,
          `
              SELECT COALESCE(raw_ingested_events, 0)::int AS count
              FROM org_usage_counters
              WHERE organization_id = $1
                AND period_starts_at = $2::timestamptz
            `,
          [input.organization_id, usageWindow.starts_at]
        )
      : 0;

    const effectiveRawIngestedEvents = Math.max(monthlyRawIngestedEvents, usageCounterValue);

    return {
      plan,
      billing_state: billingState,
      stripe_customer_id: organization.stripe_customer_id ?? null,
      active_projects: projectCount,
      capacity_units: {
        total: totalCapacityUnits,
        included: capabilities.included_capacity_units,
        additional_purchased: additionalPurchased,
        pending_reduction: null
      },
      usage_window: usageWindow,
      allowances: {
        monthly_bundle_requests: {
          used: monthlyBundleRequests,
          limit: capabilities.monthly_bundle_requests * totalCapacityUnits
        },
        monthly_raw_ingested_events: {
          used: effectiveRawIngestedEvents,
          limit: capabilities.monthly_raw_ingested_events * totalCapacityUnits
        },
        retained_bundle_cap: {
          used: retainedBundles,
          limit: capabilities.retained_bundle_cap * totalCapacityUnits
        },
        monthly_remote_activations: {
          used: monthlyRemoteActivations,
          limit: capabilities.monthly_remote_activations * totalCapacityUnits
        },
        monthly_alert_deliveries: {
          used: monthlyAlertDeliveries,
          limit: capabilities.monthly_alert_deliveries * totalCapacityUnits
        },
        monthly_webhook_deliveries: {
          used: monthlyWebhookDeliveries,
          limit: capabilities.monthly_webhook_deliveries * totalCapacityUnits
        }
      },
      trial: buildTrialSummary({
        now,
        plan,
        billing_state: billingState,
        stripe_subscription_id: stripeSubscriptionId,
        trial_plan: normalizeTrialPlan(organization.trial_plan),
        trial_started_at: organization.trial_started_at ?? null,
        trial_ends_at: organization.trial_ends_at ?? null,
        trial_used_at: organization.trial_used_at ?? null,
        trial_converted_at: organization.trial_converted_at ?? null,
        trial_expired_at: organization.trial_expired_at ?? null
      })
    };
  }

  return {
    getBillingSummaryForOrganization,
    recordTrialLifecycleEvent,

    async claimTrialStartedNotificationCandidates(input): Promise<TrialLifecycleNotificationCandidate[]> {
      return claimTrialLifecycleCandidates({
        sql: `
          SELECT
            id::text AS organization_id,
            COALESCE(plan, 'free') AS current_plan,
            (to_jsonb(organizations) ->> 'trial_plan') AS trial_plan,
            (to_jsonb(organizations) ->> 'trial_started_at') AS trial_started_at,
            (to_jsonb(organizations) ->> 'trial_ends_at') AS trial_ends_at,
            (to_jsonb(organizations) ->> 'trial_converted_at') AS trial_converted_at,
            (to_jsonb(organizations) ->> 'trial_expired_at') AS trial_expired_at
          FROM organizations
          WHERE (to_jsonb(organizations) ->> 'trial_started_at') IS NOT NULL
          ORDER BY (to_jsonb(organizations) ->> 'trial_started_at')::timestamptz ASC, id ASC
          LIMIT $1
        `,
        params: [input.limit],
        event_type: "trial_started_email",
        dedupe_key: (candidate) => candidate.trial_started_at
      });
    },

    async claimTrialEndingSoonNotificationCandidates(
      input
    ): Promise<TrialLifecycleNotificationCandidate[]> {
      const lowerBound = input.reminder_days === 7 ? "1 day" : "0 days";

      return claimTrialLifecycleCandidates({
        sql: `
          SELECT
            id::text AS organization_id,
            COALESCE(plan, 'free') AS current_plan,
            (to_jsonb(organizations) ->> 'trial_plan') AS trial_plan,
            (to_jsonb(organizations) ->> 'trial_started_at') AS trial_started_at,
            (to_jsonb(organizations) ->> 'trial_ends_at') AS trial_ends_at,
            (to_jsonb(organizations) ->> 'trial_converted_at') AS trial_converted_at,
            (to_jsonb(organizations) ->> 'trial_expired_at') AS trial_expired_at
          FROM organizations
          WHERE COALESCE(to_jsonb(organizations) ->> 'billing_state', '') = 'trialing'
            AND COALESCE(to_jsonb(organizations) ->> 'stripe_subscription_id', '') = ''
            AND (to_jsonb(organizations) ->> 'trial_ends_at')::timestamptz > $1::timestamptz + ($3::text)::interval
            AND (to_jsonb(organizations) ->> 'trial_ends_at')::timestamptz <= $1::timestamptz + ($2::text || ' days')::interval
          ORDER BY (to_jsonb(organizations) ->> 'trial_ends_at')::timestamptz ASC, id ASC
          LIMIT $4
        `,
        params: [input.now, input.reminder_days, lowerBound, input.limit],
        event_type: input.reminder_days === 7 ? "trial_ending_soon_7d_email" : "trial_ending_soon_1d_email",
        dedupe_key: (candidate) => `${candidate.trial_ends_at}:${input.reminder_days}`
      });
    },

    async claimExpiredTrialCandidates(input): Promise<TrialLifecycleNotificationCandidate[]> {
      return claimTrialLifecycleCandidates({
        sql: `
          SELECT
            id::text AS organization_id,
            COALESCE(plan, 'free') AS current_plan,
            (to_jsonb(organizations) ->> 'trial_plan') AS trial_plan,
            (to_jsonb(organizations) ->> 'trial_started_at') AS trial_started_at,
            (to_jsonb(organizations) ->> 'trial_ends_at') AS trial_ends_at,
            (to_jsonb(organizations) ->> 'trial_converted_at') AS trial_converted_at,
            (to_jsonb(organizations) ->> 'trial_expired_at') AS trial_expired_at
          FROM organizations
          WHERE COALESCE(to_jsonb(organizations) ->> 'billing_state', '') = 'trialing'
            AND COALESCE(to_jsonb(organizations) ->> 'stripe_subscription_id', '') = ''
            AND (to_jsonb(organizations) ->> 'trial_ends_at')::timestamptz <= $1::timestamptz
          ORDER BY (to_jsonb(organizations) ->> 'trial_ends_at')::timestamptz ASC, id ASC
          LIMIT $2
        `,
        params: [input.now, input.limit],
        event_type: "trial_expired",
        dedupe_key: (candidate) => candidate.trial_ends_at
      });
    },

    async claimTrialConvertedNotificationCandidates(
      input
    ): Promise<TrialLifecycleNotificationCandidate[]> {
      return claimTrialLifecycleCandidates({
        sql: `
          SELECT
            id::text AS organization_id,
            COALESCE(plan, 'free') AS current_plan,
            (to_jsonb(organizations) ->> 'trial_plan') AS trial_plan,
            (to_jsonb(organizations) ->> 'trial_started_at') AS trial_started_at,
            (to_jsonb(organizations) ->> 'trial_ends_at') AS trial_ends_at,
            (to_jsonb(organizations) ->> 'trial_converted_at') AS trial_converted_at,
            (to_jsonb(organizations) ->> 'trial_expired_at') AS trial_expired_at
          FROM organizations
          WHERE (to_jsonb(organizations) ->> 'trial_converted_at') IS NOT NULL
          ORDER BY (to_jsonb(organizations) ->> 'trial_converted_at')::timestamptz ASC, id ASC
          LIMIT $1
        `,
        params: [input.limit],
        event_type: "trial_converted_email",
        dedupe_key: (candidate) => candidate.trial_converted_at ?? candidate.trial_ends_at
      });
    },

    async startTrialForOrganization(
      input
    ): Promise<BillingSummaryRecord | "billing_not_found" | "trial_unavailable"> {
      const started = await runInTransaction(db, async (tx) => {
        const result = await tx.query<{ id: string }>(
          `
            UPDATE organizations
            SET
              plan = $2,
              additional_capacity_units = 0,
              stripe_customer_id = NULL,
              stripe_subscription_id = NULL,
              billing_state = 'trialing',
              billing_period_starts_at = $3::timestamptz,
              billing_period_ends_at = $4::timestamptz,
              trial_plan = $2,
              trial_started_at = $3::timestamptz,
              trial_ends_at = $4::timestamptz,
              trial_used_at = COALESCE((to_jsonb(organizations) ->> 'trial_used_at')::timestamptz, $3::timestamptz),
              trial_expired_at = NULL
            WHERE id = $1
              AND COALESCE(plan, 'free') = 'free'
              AND (to_jsonb(organizations) ->> 'trial_used_at') IS NULL
              AND COALESCE(to_jsonb(organizations) ->> 'billing_state', '') <> 'trialing'
            RETURNING id::text AS id
          `,
          [input.organization_id, input.target_plan, input.started_at, input.ends_at]
        );

        if (result.rows[0]?.id === undefined) {
          return false;
        }

        await recordBillingMetricDeltas(accountAnalyticsStore, tx, {
          organization_id: input.organization_id,
          occurred_at: input.started_at,
          source: "trial_started",
          dedupe_key: `trial_started:${input.organization_id}:${input.started_at}`,
          deltas: {
            trial_started: 1
          }
        });

        return true;
      });

      if (!started) {
        const organizationResult = await db.query<{ id: string }>(
          `
            SELECT id::text AS id
            FROM organizations
            WHERE id = $1
            LIMIT 1
          `,
          [input.organization_id]
        );

        return organizationResult.rows[0] === undefined ? "billing_not_found" : "trial_unavailable";
      }

      return (
        (await getBillingSummaryForOrganization({
          organization_id: input.organization_id,
          now: input.started_at
        })) ?? "billing_not_found"
      );
    },

    async expireTrialForOrganization(
      input
    ): Promise<BillingSummaryRecord | "billing_not_found" | "trial_not_expired"> {
      const expired = await runInTransaction(db, async (tx) => {
        const previousResult = await tx.query<{ plan: string }>(
          `
            SELECT COALESCE(plan, 'free') AS plan
            FROM organizations
            WHERE id = $1
            FOR UPDATE
          `,
          [input.organization_id]
        );
        const previousPlan = normalizePlanForDowngradeAudit(previousResult.rows[0]?.plan);

        const result = await tx.query<{ id: string }>(
          `
            UPDATE organizations
            SET
              plan = 'free',
              additional_capacity_units = 0,
              billing_state = 'trial_expired',
              billing_period_starts_at = NULL,
              billing_period_ends_at = NULL,
              trial_expired_at = COALESCE((to_jsonb(organizations) ->> 'trial_expired_at')::timestamptz, $2::timestamptz)
            WHERE id = $1
              AND COALESCE(to_jsonb(organizations) ->> 'billing_state', '') = 'trialing'
              AND (to_jsonb(organizations) ->> 'trial_ends_at')::timestamptz <= $2::timestamptz
              AND COALESCE(to_jsonb(organizations) ->> 'stripe_subscription_id', '') = ''
            RETURNING id::text AS id
          `,
          [input.organization_id, input.now]
        );

        if (result.rows[0]?.id === undefined) {
          return false;
        }

        const cleanupSummary = await createOrganizationPlanCleanupService(tx).cleanupOrganizationForPlan({
          organization_id: input.organization_id,
          plan: "free",
          now: input.now
        });

        if (isPlanDowngrade(previousPlan, "free")) {
          await recordPlanDowngradeCleanupAudit({
            db: tx,
            organization_id: input.organization_id,
            previous_plan: previousPlan,
            target_plan: "free",
            trigger_source: "trial_expiry",
            cleanup_summary: cleanupSummary,
            occurred_at: input.now
          });
        }

        await recordBillingMetricDeltas(accountAnalyticsStore, tx, {
          organization_id: input.organization_id,
          occurred_at: input.now,
          source: "trial_expired",
          dedupe_key: `trial_expired:${input.organization_id}:${input.now}`,
          deltas: {
            trial_expired: 1
          }
        });

        return true;
      });

      if (!expired) {
        const organizationResult = await db.query<{ id: string }>(
          `
            SELECT id::text AS id
            FROM organizations
            WHERE id = $1
            LIMIT 1
          `,
          [input.organization_id]
        );

        return organizationResult.rows[0] === undefined ? "billing_not_found" : "trial_not_expired";
      }

      return (
        (await getBillingSummaryForOrganization({
          organization_id: input.organization_id,
          now: input.now
        })) ?? "billing_not_found"
      );
    },

    async getBillingSummaryForProject(input): Promise<BillingSummaryRecord | null> {
      const projectResult = await db.query<{ organization_id: string | null }>(
        `
          SELECT organization_id::text AS organization_id
          FROM projects
          WHERE id = $1
          LIMIT 1
        `,
        [input.project_id]
      );

      const organizationId = projectResult.rows[0]?.organization_id;
      if (organizationId === undefined || organizationId === null) {
        return null;
      }

      return getBillingSummaryForOrganization({
        organization_id: organizationId,
        now: input.now
      });
    },

    async incrementOrgUsageCounter(input): Promise<void> {
      await db.query(
        `
          INSERT INTO org_usage_counters (organization_id, period_starts_at, raw_ingested_events, updated_at)
          VALUES ($1, $2::timestamptz, $3, now())
          ON CONFLICT (organization_id, period_starts_at)
          DO UPDATE SET
            raw_ingested_events = org_usage_counters.raw_ingested_events + EXCLUDED.raw_ingested_events,
            updated_at = now()
        `,
        [input.organization_id, input.period_starts_at, input.count]
      );
    },

    async incrementProjectUsageCounter(input): Promise<void> {
      await db.query(
        `
          INSERT INTO project_usage_counters (project_id, period_starts_at, raw_ingested_events, updated_at)
          VALUES ($1, $2::timestamptz, $3, now())
          ON CONFLICT (project_id, period_starts_at)
          DO UPDATE SET
            raw_ingested_events = project_usage_counters.raw_ingested_events + EXCLUDED.raw_ingested_events,
            updated_at = now()
        `,
        [input.project_id, input.period_starts_at, input.count]
      );
    }
  };
}
