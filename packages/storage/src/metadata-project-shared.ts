import { getTierCapabilities } from "../../shared-types/src/index.js";
import type {
  ProjectRecord,
  ProjectAccessRecord,
  ProjectInviteRecord,
  ProjectMemberRecord,
  Queryable,
  DeletedProjectRecord
} from "./types.js";

export function buildProjectMetricsWindow(nowIso: string): { starts_at: string; ends_at: string } {
  const now = new Date(nowIso);
  const startsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const endsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));

  return {
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString()
  };
}

export function buildProjectDayWindow(nowIso: string): { starts_at: string; ends_at: string } {
  const now = new Date(nowIso);
  const startsAt = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)
  );
  const endsAt = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0)
  );

  return {
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString()
  };
}

export function buildMonthlyRawIngestedEventsMetricSelect(input: {
  projectIdSql: string;
  startsAtSql: string;
  endsAtSql: string;
  billableIncidentEventsPredicate: string;
}): string {
  return `
    SELECT GREATEST(
      (
        SELECT COUNT(*)::int
        FROM incident_events ie
        JOIN incidents i ON i.id = ie.incident_id
        WHERE i.project_id = ${input.projectIdSql}
          AND (${input.billableIncidentEventsPredicate})
          AND ie.occurred_at >= ${input.startsAtSql}::timestamptz
          AND ie.occurred_at < ${input.endsAtSql}::timestamptz
      ),
      COALESCE(
        (
          SELECT puc.raw_ingested_events::int
          FROM project_usage_counters puc
          WHERE puc.project_id = ${input.projectIdSql}
            AND puc.period_starts_at = ${input.startsAtSql}::timestamptz
          LIMIT 1
        ),
        0
      )
    )::int
  `;
}

export function buildProjectMetricsJsonSql(input: {
  projectIdSql: string;
  monthStartsAtSql: string;
  monthEndsAtSql: string;
  dayStartsAtSql: string;
  dayEndsAtSql: string;
  billableIncidentEventsPredicate: string;
  alertDeliveriesSelect: string;
}): string {
  return `
    json_build_object(
      'open_incidents', (
        SELECT COUNT(*)::int
        FROM incidents i
        WHERE i.project_id = ${input.projectIdSql}
          AND i.status = 'open'
      ),
      'regressed_incidents', (
        SELECT COUNT(*)::int
        FROM incidents i
        WHERE i.project_id = ${input.projectIdSql}
          AND i.status = 'regressed'
      ),
      'opened_incidents_today', (
        SELECT COUNT(*)::int
        FROM incidents i
        WHERE i.project_id = ${input.projectIdSql}
          AND i.first_seen_at >= ${input.dayStartsAtSql}::timestamptz
          AND i.first_seen_at < ${input.dayEndsAtSql}::timestamptz
      ),
      'attention_incidents_today', (
        SELECT COUNT(*)::int
        FROM incidents i
        WHERE i.project_id = ${input.projectIdSql}
          AND (
            (
              i.first_seen_at >= ${input.dayStartsAtSql}::timestamptz
              AND i.first_seen_at < ${input.dayEndsAtSql}::timestamptz
            )
            OR (
              i.regressed_at IS NOT NULL
              AND i.regressed_at >= ${input.dayStartsAtSql}::timestamptz
              AND i.regressed_at < ${input.dayEndsAtSql}::timestamptz
            )
          )
      ),
      'opened_incidents_month', (
        SELECT COUNT(*)::int
        FROM incidents i
        WHERE i.project_id = ${input.projectIdSql}
          AND i.first_seen_at >= ${input.monthStartsAtSql}::timestamptz
          AND i.first_seen_at < ${input.monthEndsAtSql}::timestamptz
      ),
      'monthly_bundle_requests', (
        SELECT COUNT(*)::int
        FROM bundle_generations bg
        WHERE bg.project_id = ${input.projectIdSql}
          AND bg.created_at >= ${input.monthStartsAtSql}::timestamptz
          AND bg.created_at < ${input.monthEndsAtSql}::timestamptz
      ),
      'monthly_raw_ingested_events', (
        ${buildMonthlyRawIngestedEventsMetricSelect({
          projectIdSql: input.projectIdSql,
          startsAtSql: input.monthStartsAtSql,
          endsAtSql: input.monthEndsAtSql,
          billableIncidentEventsPredicate: input.billableIncidentEventsPredicate
        })}
      ),
      'retained_bundles', (
        SELECT COUNT(DISTINCT bg.incident_id)::int
        FROM bundle_generations bg
        WHERE bg.project_id = ${input.projectIdSql}
      ),
      'monthly_alert_deliveries', ${input.alertDeliveriesSelect}
    )
  `;
}

export async function alertDeliveriesTableExists(db: Queryable): Promise<boolean> {
  const result = await db.query<{ exists: string | boolean } & Record<string, unknown>>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'alert_deliveries'
      ) AS exists
    `,
    []
  );

  const value = result.rows[0]?.exists;
  return value === true || value === "t";
}

export async function alertEmailDigestsTableExists(db: Queryable): Promise<boolean> {
  const result = await db.query<{ exists: string | boolean } & Record<string, unknown>>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'alert_email_digests'
      ) AS exists
    `,
    []
  );

  const value = result.rows[0]?.exists;
  return value === true || value === "t";
}

export function buildAlertDeliveriesCountSelect(input: {
  hasAlertDeliveries: boolean;
  hasAlertEmailDigests: boolean;
}): string {
  const parts: string[] = [];

  if (input.hasAlertDeliveries) {
    parts.push(`
      SELECT ad.created_at
      FROM alert_deliveries ad
      WHERE ad.project_id = p.id
        AND ad.created_at >= $2::timestamptz
        AND ad.created_at < $3::timestamptz
    `);
  }

  if (input.hasAlertEmailDigests) {
    parts.push(`
      SELECT dig.created_at
      FROM alert_email_digests dig
      WHERE dig.project_id = p.id
        AND dig.created_at >= $2::timestamptz
        AND dig.created_at < $3::timestamptz
    `);
  }

  if (parts.length === 0) {
    return "0";
  }

  return `
    (
      SELECT COUNT(*)::int
      FROM (
        ${parts.join("\nUNION ALL\n")}
      ) AS alert_events
    )
  `;
}

export function normalizeProjectMetrics(value: unknown): ProjectRecord["metrics"] {
  if (typeof value !== "object" || value === null) {
    return {
      open_incidents: 0,
      regressed_incidents: 0,
      attention_incidents_today: 0,
      opened_incidents_today: 0,
      opened_incidents_month: 0,
      monthly_bundle_requests: 0,
      monthly_raw_ingested_events: 0,
      retained_bundles: 0,
      monthly_alert_deliveries: 0
    };
  }

  const metrics = value as Partial<ProjectRecord["metrics"]>;

  return {
    open_incidents: metrics.open_incidents ?? 0,
    regressed_incidents: metrics.regressed_incidents ?? 0,
    attention_incidents_today:
      metrics.attention_incidents_today ?? metrics.opened_incidents_today ?? 0,
    opened_incidents_today: metrics.opened_incidents_today ?? 0,
    opened_incidents_month: metrics.opened_incidents_month ?? 0,
    monthly_bundle_requests: metrics.monthly_bundle_requests ?? 0,
    monthly_raw_ingested_events: metrics.monthly_raw_ingested_events ?? 0,
    retained_bundles: metrics.retained_bundles ?? 0,
    monthly_alert_deliveries: metrics.monthly_alert_deliveries ?? 0
  };
}

export function mapProjectRow(row: ProjectRecord & Record<string, unknown>): ProjectRecord {
  return {
    project_id: row.project_id,
    organization_id: row.organization_id,
    owner_user_id: row.owner_user_id,
    owner_email: row.owner_email,
    relationship: row.relationship,
    sharing_state: row.sharing_state,
    effective_role: row.effective_role,
    shared_access_suspended: row.shared_access_suspended ?? false,
    name: row.name,
    slug: row.slug,
    environment_default: row.environment_default,
    color_tag: row.color_tag ?? null,
    organization_plan: row.organization_plan,
    metrics: normalizeProjectMetrics(row.metrics),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export function mapDeletedProjectRow(
  row: DeletedProjectRecord & Record<string, unknown>
): DeletedProjectRecord {
  return {
    project_id: row.project_id,
    organization_id: row.organization_id,
    owner_user_id: row.owner_user_id,
    owner_email: row.owner_email,
    relationship: row.relationship,
    sharing_state: row.sharing_state,
    effective_role: row.effective_role,
    shared_access_suspended: row.shared_access_suspended ?? false,
    name: row.name,
    slug: row.slug,
    environment_default: row.environment_default,
    color_tag: row.color_tag ?? null,
    organization_plan: row.organization_plan,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export function mapProjectMemberRow(
  row: ProjectMemberRecord & Record<string, unknown>
): ProjectMemberRecord {
  return {
    user_id: row.user_id,
    email: row.email,
    role: row.role,
    membership_type: row.membership_type,
    created_at: row.created_at,
    avatar_object_key: row.avatar_object_key ?? null
  };
}

export function shouldSuspendSharedAccess(input: {
  relationship: "owned" | "shared";
  organization_plan: string;
}): boolean {
  return (
    input.relationship === "shared" &&
    !getTierCapabilities(input.organization_plan).shared_dashboards
  );
}

export function applySharedAccessSuspension(project: ProjectRecord): ProjectRecord {
  return {
    ...project,
    shared_access_suspended: shouldSuspendSharedAccess(project)
  };
}

export function applyProjectAccessSuspension(access: ProjectAccessRecord): ProjectAccessRecord {
  return {
    ...access,
    shared_access_suspended: shouldSuspendSharedAccess(access)
  };
}

export function mapProjectInviteRow(
  row: ProjectInviteRecord & Record<string, unknown>
): ProjectInviteRecord {
  return {
    invite_id: row.invite_id,
    project_id: row.project_id,
    email: row.email,
    role: row.role,
    invited_by_user_id: row.invited_by_user_id,
    accepted_at: row.accepted_at,
    canceled_at: row.canceled_at,
    expires_at: row.expires_at,
    created_at: row.created_at
  };
}
