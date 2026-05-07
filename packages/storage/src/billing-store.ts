import { getTierCapabilities, type TierName } from "../../shared-types/src/index.js";

import { buildBillableIncidentEventsPredicateSql } from "./helpers.js";
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

export interface BillingSummaryRecord {
  plan: TierName;
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
  };
}

export interface BillingStore {
  getBillingSummaryForOrganization(input: {
    organization_id: string;
    now: string;
  }): Promise<BillingSummaryRecord | null>;
  getBillingSummaryForProject(input: {
    project_id: string;
    now: string;
  }): Promise<BillingSummaryRecord | null>;
  incrementOrgUsageCounter(input: {
    organization_id: string;
    period_starts_at: string;
    count: number;
  }): Promise<void>;
}

function normalizePlan(plan: string | null | undefined): TierName {
  if (plan === "solo" || plan === "team") {
    return plan;
  }

  return "free";
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

export function createPostgresBillingStore(db: Queryable): BillingStore {
  async function getBillingSummaryForOrganization(input: {
    organization_id: string;
    now: string;
  }): Promise<BillingSummaryRecord | null> {
      const organizationResult = await db.query<{
        plan: string;
        stripe_customer_id: string | null;
        additional_capacity_units: number | null;
        billing_period_starts_at: string | null;
        billing_period_ends_at: string | null;
      }>(
        `
          SELECT
            COALESCE(plan, 'free') AS plan,
            stripe_customer_id,
            COALESCE((to_jsonb(organizations) ->> 'additional_capacity_units')::int, 0)::int AS additional_capacity_units,
            to_jsonb(organizations) ->> 'billing_period_starts_at' AS billing_period_starts_at,
            to_jsonb(organizations) ->> 'billing_period_ends_at' AS billing_period_ends_at
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
      const billingPeriodStartsAt = organization.billing_period_starts_at ?? null;
      const billingPeriodEndsAt = organization.billing_period_ends_at ?? null;
      const capabilities = getTierCapabilities(plan);
      const usageWindow = resolveUsageWindow({
        now: new Date(input.now),
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
            SELECT COUNT(DISTINCT bg.incident_id)::int AS count
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
        tableExists(db, "org_usage_counters")
      ]);

      const monthlyAlertDeliveries = alertDeliveriesTablePresent
        ? await readCount(
            db,
            `
              SELECT COUNT(*)::int AS count
              FROM alert_deliveries ad
              JOIN projects p ON p.id = ad.project_id
              WHERE p.organization_id = $1
                AND ad.created_at >= $2::timestamptz
                AND ad.created_at < $3::timestamptz
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
          }
        }
      };
  }

  return {
    getBillingSummaryForOrganization,

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
    }
  };
}