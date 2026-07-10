import {
  AnalyticsOpportunitiesListResponseSchema,
  AnalyticsOpportunityResponseSchema,
  type AnalyticsBundleAnalysisKind,
  type AnalyticsOpportunitiesListResponse,
  type AnalyticsOpportunityRecord,
  type AnalyticsOpportunityResponse,
  type AnalyticsOpportunityStatus
} from "../../shared-types/src/index.js";
import type { Queryable } from "./types.js";

export type AnalyticsOpportunitiesCursor = {
  last_detected_at: string;
  opportunity_id: string;
};

export interface AnalyticsOpportunityStore {
  listAnalyticsOpportunitiesForProject(input: {
    organization_id: string;
    project_id: string;
    status?: AnalyticsOpportunityStatus | undefined;
    kind?: AnalyticsBundleAnalysisKind | undefined;
    cursor?: AnalyticsOpportunitiesCursor | undefined;
    limit: number;
  }): Promise<AnalyticsOpportunitiesListResponse>;
  listAnalyticsOpportunitiesForOrganization(input: {
    organization_id: string;
    status?: AnalyticsOpportunityStatus | undefined;
    kind?: AnalyticsBundleAnalysisKind | undefined;
    cursor?: AnalyticsOpportunitiesCursor | undefined;
    limit: number;
  }): Promise<AnalyticsOpportunitiesListResponse>;
  getAnalyticsOpportunityForProject(input: {
    organization_id: string;
    project_id: string;
    opportunity_id: string;
  }): Promise<AnalyticsOpportunityResponse | null>;
}

type AnalyticsOpportunityRow = {
  opportunity_id: unknown;
  project_id: unknown;
  project_name: unknown;
  project_color_tag: unknown;
  service: unknown;
  environment: unknown;
  kind: unknown;
  status: unknown;
  severity: unknown;
  confidence: unknown;
  title: unknown;
  summary: unknown;
  evidence: unknown;
  related_incident_ids: unknown;
  related_deploy_ids: unknown;
  first_detected_at: unknown;
  last_detected_at: unknown;
  resolved_at: unknown;
  snoozed_until: unknown;
  bundle_generation_id: unknown;
  bundle_status: unknown;
  bundle_created_at: unknown;
  bundle_updated_at: unknown;
  bundle_failure_reason: unknown;
};

export function createPostgresAnalyticsOpportunityStore(db: Queryable): AnalyticsOpportunityStore {
  return {
    async listAnalyticsOpportunitiesForProject(input) {
      const limit = normalizeLimit(input.limit);
      const where = buildAnalyticsOpportunityWhere(input);
      const result = await db.query<AnalyticsOpportunityRow>(
        `
          ${buildAnalyticsOpportunitySelect()}
          ${where.sql}
          ORDER BY ao.last_detected_at DESC, ao.id::text DESC
          LIMIT $${where.params.length + 1}
        `,
        [...where.params, limit]
      );
      const opportunities = result.rows.map(mapAnalyticsOpportunityRow);
      const nextRecord = opportunities.length >= limit ? opportunities.at(-1) : undefined;

      return AnalyticsOpportunitiesListResponseSchema.parse({
        opportunities,
        next_cursor: nextRecord === undefined ? null : `${nextRecord.last_detected_at}|${nextRecord.opportunity_id}`
      });
    },

    async listAnalyticsOpportunitiesForOrganization(input) {
      const limit = normalizeLimit(input.limit);
      const where = buildAnalyticsOpportunityWhere(input);
      const result = await db.query<AnalyticsOpportunityRow>(
        `
          ${buildAnalyticsOpportunitySelect()}
          ${where.sql}
          ORDER BY ao.last_detected_at DESC, ao.id::text DESC
          LIMIT $${where.params.length + 1}
        `,
        [...where.params, limit]
      );
      const opportunities = result.rows.map(mapAnalyticsOpportunityRow);
      const nextRecord = opportunities.length >= limit ? opportunities.at(-1) : undefined;

      return AnalyticsOpportunitiesListResponseSchema.parse({
        opportunities,
        next_cursor: nextRecord === undefined ? null : `${nextRecord.last_detected_at}|${nextRecord.opportunity_id}`
      });
    },

    async getAnalyticsOpportunityForProject(input) {
      const result = await db.query<AnalyticsOpportunityRow>(
        `
          ${buildAnalyticsOpportunitySelect()}
          WHERE p.organization_id = $1::uuid
            AND ao.project_id = $2::uuid
            AND ao.id = $3::uuid
          LIMIT 1
        `,
        [input.organization_id, input.project_id, input.opportunity_id]
      );
      const row = result.rows[0];
      if (row === undefined) {
        return null;
      }

      return AnalyticsOpportunityResponseSchema.parse({
        opportunity: mapAnalyticsOpportunityRow(row)
      });
    }
  };
}

function buildAnalyticsOpportunitySelect(): string {
  return `
    SELECT
      ao.id::text AS opportunity_id,
      ao.project_id::text AS project_id,
      p.name AS project_name,
      p.color_tag AS project_color_tag,
      ao.service,
      ao.environment,
      ao.kind,
      CASE
        WHEN ao.status = 'snoozed'
          AND ao.snoozed_until IS NOT NULL
          AND ao.snoozed_until <= now()
          THEN 'open'
        ELSE ao.status
      END AS status,
      ao.severity,
      ao.confidence::float8 AS confidence,
      ao.title,
      ao.summary,
      ao.evidence,
      ao.related_incident_ids::text[] AS related_incident_ids,
      ao.related_deploy_ids::text[] AS related_deploy_ids,
      ao.first_detected_at AS first_detected_at,
      ao.last_detected_at AS last_detected_at,
      ao.resolved_at AS resolved_at,
      CASE
        WHEN ao.status = 'snoozed'
          AND ao.snoozed_until IS NOT NULL
          AND ao.snoozed_until <= now()
          THEN NULL
        ELSE ao.snoozed_until
      END AS snoozed_until,
      bg.id::text AS bundle_generation_id,
      COALESCE(bg.status, ao.bundle_status) AS bundle_status,
      bg.created_at AS bundle_created_at,
      bg.updated_at AS bundle_updated_at,
      COALESCE(bg.failure_reason, ao.bundle_failure_reason) AS bundle_failure_reason
    FROM analytics_opportunities ao
    JOIN projects p ON p.id = ao.project_id
    LEFT JOIN LATERAL (
      SELECT
        abg.id,
        abg.status,
        abg.created_at,
        abg.updated_at,
        abg.failure_reason
      FROM analytics_bundle_generations abg
      WHERE abg.opportunity_id = ao.id
      ORDER BY abg.created_at DESC, abg.id::text DESC
      LIMIT 1
    ) bg ON TRUE
  `;
}

function buildAnalyticsOpportunityWhere(input: {
  organization_id: string;
  project_id?: string | undefined;
  status?: AnalyticsOpportunityStatus | undefined;
  kind?: AnalyticsBundleAnalysisKind | undefined;
  cursor?: AnalyticsOpportunitiesCursor | undefined;
}): { sql: string; params: unknown[] } {
  const conditions = ["p.organization_id = $1::uuid"];
  const params: unknown[] = [input.organization_id];

  if (input.project_id !== undefined) {
    params.push(input.project_id);
    conditions.push(`ao.project_id = $${params.length}::uuid`);
  }

  if (input.status !== undefined) {
    if (input.status === "open") {
      conditions.push(`(
        ao.status = 'open'
        OR (
          ao.status = 'snoozed'
          AND ao.snoozed_until IS NOT NULL
          AND ao.snoozed_until <= now()
        )
      )`);
    } else if (input.status === "snoozed") {
      conditions.push(`(
        ao.status = 'snoozed'
        AND (
          ao.snoozed_until IS NULL
          OR ao.snoozed_until > now()
        )
      )`);
    } else {
      params.push(input.status);
      conditions.push(`ao.status = $${params.length}`);
    }
  }

  if (input.kind !== undefined) {
    params.push(input.kind);
    conditions.push(`ao.kind = $${params.length}`);
  }

  if (input.cursor !== undefined) {
    params.push(input.cursor.last_detected_at, input.cursor.opportunity_id);
    const timestampParam = params.length - 1;
    const idParam = params.length;
    conditions.push(`(
      ao.last_detected_at < $${timestampParam}::timestamptz
      OR (
        ao.last_detected_at = $${timestampParam}::timestamptz
        AND ao.id::text < $${idParam}
      )
    )`);
  }

  return {
    sql: `WHERE ${conditions.join("\n            AND ")}`,
    params
  };
}

function mapAnalyticsOpportunityRow(row: AnalyticsOpportunityRow): AnalyticsOpportunityRecord {
  return {
    opportunity_id: toNonEmptyString(row.opportunity_id, "00000000-0000-0000-0000-000000000000"),
    project_id: toNonEmptyString(row.project_id, "00000000-0000-0000-0000-000000000000"),
    project_name: toNonEmptyString(row.project_name, "Unknown project"),
    project_color_tag: toNullableString(row.project_color_tag),
    service: toNullableString(row.service),
    environment: toNullableString(row.environment),
    kind: toNonEmptyString(row.kind, "usage_summary") as AnalyticsOpportunityRecord["kind"],
    status: toNonEmptyString(row.status, "open") as AnalyticsOpportunityRecord["status"],
    severity: toNonEmptyString(row.severity, "low") as AnalyticsOpportunityRecord["severity"],
    confidence: toNumber(row.confidence),
    title: toNonEmptyString(row.title, "Analytics opportunity"),
    summary: toNonEmptyString(row.summary, "Analytics opportunity evidence is available."),
    evidence: isRecord(row.evidence) ? row.evidence : {},
    related_incident_ids: toStringArray(row.related_incident_ids),
    related_deploy_ids: toStringArray(row.related_deploy_ids),
    first_detected_at: toIsoString(row.first_detected_at),
    last_detected_at: toIsoString(row.last_detected_at),
    resolved_at: toNullableIsoString(row.resolved_at),
    snoozed_until: toNullableIsoString(row.snoozed_until),
    bundle_generation_id: toNullableString(row.bundle_generation_id),
    bundle_status: toNonEmptyString(row.bundle_status, "not_requested") as AnalyticsOpportunityRecord["bundle_status"],
    bundle_created_at: toNullableIsoString(row.bundle_created_at),
    bundle_updated_at: toNullableIsoString(row.bundle_updated_at),
    bundle_failure_reason: toNullableString(row.bundle_failure_reason)
  };
}

function normalizeLimit(value: number): number {
  return Math.min(100, Math.max(1, Math.trunc(value)));
}

function toNonEmptyString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function toIsoString(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  return new Date(0).toISOString();
}

function toNullableIsoString(value: unknown): string | null {
  return value === null || value === undefined ? null : toIsoString(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
