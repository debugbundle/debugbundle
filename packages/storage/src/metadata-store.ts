import { randomUUID } from "node:crypto";

import { generateProbeTriggerToken } from "../../auth/src/index.js";
import { getTierCapabilities, type TierName } from "../../shared-types/src/index.js";
import { buildBillableIncidentEventsPredicateSql, getRequiredStringField } from "./helpers.js";
import type {
  AcceptOrganizationInviteResult,
  AlertRuleRecord,
  BuildBundleJob,
  BundleBuildContext,
  CreateOrganizationInviteResult,
  DemotedIncidentEventReference,
  DeleteAlertResult,
  IncidentEventReference,
  IncidentLogRecord,
  IncidentRetrievalRecord,
  InsertIncidentEventInput,
  MarkIncidentSpikingInput,
  MemberTokenRecord,
  OrganizationInviteRecord,
  OrganizationMemberRecord,
  PostgresMetadataStore,
  ProbeActivationRecord,
  ProbeEventCandidateReference,
  ProjectRecord,
  ProjectTokenRecord,
  Queryable,
  RecordIncidentEventRetentionInput,
  RecordIncidentEventRetentionResult,
  RegressionDeployCorrelation,
  DeletedProjectRecord,
  RemoveOrganizationMemberResult,
  ResolveMemberResult,
  ResolveProjectResult,
  ServiceRetrievalRecord,
  UpdateOrganizationMemberRoleResult,
  UpsertIncidentInput,
  UpsertIncidentResult,
  WeeklyProjectReportSummary,
} from "./types.js";

function mapAlertRuleRow(row: {
  alert_id: string;
  project_id: string;
  service_id: string | null;
  channel: AlertRuleRecord["channel"];
  condition_type: AlertRuleRecord["condition_type"];
  severity_min: AlertRuleRecord["severity_min"];
  config: Record<string, unknown>;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}): AlertRuleRecord {
  return {
    alert_id: row.alert_id,
    project_id: row.project_id,
    service_id: row.service_id,
    channel: row.channel,
    condition_type: row.condition_type,
    severity_min: row.severity_min,
    config: row.config,
    is_enabled: row.is_enabled,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function severityToRank(severity: RecordIncidentEventRetentionInput["severity"]): number {
  switch (severity) {
    case "critical":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    default:
      return 1;
  }
}

function buildProjectMetricsWindow(nowIso: string): { starts_at: string; ends_at: string } {
  const now = new Date(nowIso);
  const startsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const endsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));

  return {
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString()
  };
}

async function alertDeliveriesTableExists(db: Queryable): Promise<boolean> {
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

function normalizeProjectMetrics(value: unknown): ProjectRecord["metrics"] {
  if (typeof value !== "object" || value === null) {
    return {
      monthly_bundle_requests: 0,
      monthly_raw_ingested_events: 0,
      retained_bundles: 0,
      monthly_alert_deliveries: 0
    };
  }

  const metrics = value as Partial<ProjectRecord["metrics"]>;

  return {
    monthly_bundle_requests: metrics.monthly_bundle_requests ?? 0,
    monthly_raw_ingested_events: metrics.monthly_raw_ingested_events ?? 0,
    retained_bundles: metrics.retained_bundles ?? 0,
    monthly_alert_deliveries: metrics.monthly_alert_deliveries ?? 0
  };
}

function mapProjectRow(row: ProjectRecord & Record<string, unknown>): ProjectRecord {
  return {
    project_id: row.project_id,
    organization_id: row.organization_id,
    name: row.name,
    slug: row.slug,
    environment_default: row.environment_default,
    organization_plan: row.organization_plan,
    metrics: normalizeProjectMetrics(row.metrics),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function mapDeletedProjectRow(row: DeletedProjectRecord & Record<string, unknown>): DeletedProjectRecord {
  return {
    project_id: row.project_id,
    organization_id: row.organization_id,
    name: row.name,
    slug: row.slug,
    environment_default: row.environment_default,
    organization_plan: row.organization_plan,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function collectDemotedIncidentEvents(
  target: Map<string, DemotedIncidentEventReference>,
  rows: Array<{ event_id: string; occurred_at: string; is_sampled: boolean }>
): void {
  for (const row of rows) {
    if (!row.is_sampled) {
      target.set(row.event_id, {
        event_id: row.event_id,
        occurred_at: row.occurred_at
      });
    }
  }
}

async function getOrCreateServiceId(
  db: Queryable,
  projectId: string,
  serviceName: string,
  environment: string
): Promise<string> {
  const existing = await db.query<{ id: string }>(
    `
      SELECT id
      FROM services
      WHERE project_id = $1 AND name = $2 AND environment = $3
      LIMIT 1
    `,
    [projectId, serviceName, environment]
  );

  const existingId = existing.rows[0]?.id;
  if (existingId !== undefined) {
    return existingId;
  }

  const inserted = await db.query<{ id: string }>(
    `
      INSERT INTO services (id, project_id, name, environment, created_at, updated_at)
      VALUES ($1, $2, $3, $4, now(), now())
      ON CONFLICT (project_id, name, environment)
      DO UPDATE SET updated_at = now()
      RETURNING id
    `,
    [randomUUID(), projectId, serviceName, environment]
  );

  const insertedId = inserted.rows[0]?.id;
  if (insertedId === undefined) {
    throw new Error("service_insert_failed");
  }

  return insertedId;
}

async function upsertDeploymentFromEvent(input: {
  db: Queryable;
  event_id: string;
  project_id: string;
  service_id: string;
  environment: string;
  commit_sha: string;
  version: string;
  branch: string;
  deployed_at: string;
}): Promise<void> {
  await input.db.query(
    `
      INSERT INTO deployments (
        id,
        project_id,
        service_id,
        environment,
        source_event_id,
        commit_sha,
        version,
        branch,
        deployed_at,
        metadata,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5::uuid,
        $6,
        $7,
        $8,
        $9::timestamptz,
        '{}'::jsonb,
        now(),
        now()
      )
      ON CONFLICT (source_event_id)
      DO UPDATE SET
        commit_sha = EXCLUDED.commit_sha,
        version = EXCLUDED.version,
        branch = EXCLUDED.branch,
        deployed_at = EXCLUDED.deployed_at,
        updated_at = now()
    `,
    [
      randomUUID(),
      input.project_id,
      input.service_id,
      input.environment,
      input.event_id,
      input.commit_sha,
      input.version,
      input.branch,
      input.deployed_at
    ]
  );
}

async function getRegressionDeployCorrelation(input: {
  db: Queryable;
  project_id: string;
  service_id: string;
  environment: string;
  occurred_at: string;
}): Promise<RegressionDeployCorrelation | null> {
  const result = await input.db.query<RegressionDeployCorrelation & Record<string, unknown>>(
    `
      SELECT
        d.id AS deployment_id,
        d.commit_sha,
        d.version,
        d.branch,
        d.deployed_at::text AS deployed_at,
        FLOOR(EXTRACT(EPOCH FROM ($1::timestamptz - d.deployed_at)) / 60)::integer AS minutes_since_deploy
      FROM deployments d
      WHERE d.project_id = $2
        AND d.service_id = $3
        AND d.environment = $4
        AND d.deployed_at <= $1::timestamptz
        AND d.deployed_at >= ($1::timestamptz - INTERVAL '24 hours')
      ORDER BY d.deployed_at DESC
      LIMIT 1
    `,
    [input.occurred_at, input.project_id, input.service_id, input.environment]
  );

  const correlation = result.rows[0];
  if (correlation === undefined) {
    return null;
  }

  return {
    deployment_id: correlation.deployment_id,
    commit_sha: correlation.commit_sha,
    version: correlation.version,
    branch: correlation.branch,
    deployed_at: correlation.deployed_at,
    minutes_since_deploy: correlation.minutes_since_deploy
  };
}

export function createPostgresMetadataStore(db: Queryable): PostgresMetadataStore {
  return {
    async resolveProjectByTokenHash(tokenHash: string): Promise<ResolveProjectResult | null> {
      const result = await db.query<ResolveProjectResult & Record<string, unknown>>(
        `
          SELECT
            pt.project_id,
            p.organization_id,
            COALESCE(o.plan, 'free') AS organization_plan,
            revoked_at::text AS revoked_at,
            expires_at::text AS expires_at
          FROM project_tokens pt
          JOIN projects p ON p.id = pt.project_id
          JOIN organizations o ON o.id = p.organization_id
          WHERE pt.token_hash = $1
            AND o.suspended_at IS NULL
          LIMIT 1
        `,
        [tokenHash]
      );

      return result.rows[0] ?? null;
    },
    async getBundleFailureReasonForOrganization(input): Promise<string | null> {
      const result = await db.query<{ bundle_failure_reason: string | null }>(
        `
          SELECT i.bundle_failure_reason
          FROM incidents i
          JOIN projects p ON p.id = i.project_id
          WHERE p.organization_id = $1
            AND i.id = $2
          LIMIT 1
        `,
        [input.organization_id, input.incident_id]
      );

      return result.rows[0]?.bundle_failure_reason ?? null;
    },

    async getBundleSourceForOrganization(input: {
      organization_id: string;
      incident_id: string;
    }): Promise<{
      event_id: string;
      occurred_at: string;
      occurrence_count: number;
      trigger: string;
    } | null> {
      const result = await db.query<{
        event_id: string;
        occurred_at: string;
        occurrence_count: number;
        trigger: string;
      }>(
        `
          SELECT
            i.bundle_source_event_id::text AS event_id,
            i.bundle_source_occurred_at::text AS occurred_at,
            i.occurrence_count,
            i.bundle_trigger AS trigger
          FROM incidents i
          JOIN projects p ON p.id = i.project_id
          WHERE p.organization_id = $1
            AND i.id = $2
            AND i.bundle_source_event_id IS NOT NULL
          LIMIT 1
        `,
        [input.organization_id, input.incident_id]
      );

      return result.rows[0] ?? null;
    },

    async resolveMemberByTokenHash(tokenHash: string): Promise<ResolveMemberResult | null> {
      const result = await db.query<ResolveMemberResult & Record<string, unknown>>(
        `
          SELECT
            mt.user_id AS member_id,
            mt.organization_id,
            om.role,
            mt.revoked_at::text AS revoked_at,
            mt.expires_at::text AS expires_at
          FROM member_tokens mt
          JOIN organization_members om
            ON om.organization_id = mt.organization_id
           AND om.user_id = mt.user_id
          JOIN organizations org ON org.id = mt.organization_id
          WHERE mt.token_hash = $1
            AND om.suspended_at IS NULL
            AND org.suspended_at IS NULL
          LIMIT 1
        `,
        [tokenHash]
      );

      return result.rows[0] ?? null;
    },

    async listMembersForOrganization(input): Promise<{ plan: string; members: OrganizationMemberRecord[] } | null> {
      const organizationResult = await db.query<{ organization_id: string; plan: string }>(
        `
          SELECT
            id AS organization_id,
            COALESCE(plan, 'free') AS plan
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

      const membersResult = await db.query<OrganizationMemberRecord & Record<string, unknown>>(
        `
          SELECT
            om.user_id,
            u.email,
            om.role,
            om.created_at::text AS created_at
          FROM organization_members om
          JOIN users u ON u.id = om.user_id
          WHERE om.organization_id = $1
          ORDER BY CASE WHEN om.role = 'owner' THEN 0 ELSE 1 END, om.created_at ASC, om.user_id ASC
        `,
        [input.organization_id]
      );

      return {
        plan: organization.plan,
        members: membersResult.rows
      };
    },

    async listPendingInvitesForOrganization(input): Promise<OrganizationInviteRecord[] | null> {
      const organizationResult = await db.query<{ organization_id: string }>(
        `
          SELECT id AS organization_id
          FROM organizations
          WHERE id = $1
          LIMIT 1
        `,
        [input.organization_id]
      );

      if (organizationResult.rows[0] === undefined) {
        return null;
      }

      const invitesResult = await db.query<OrganizationInviteRecord & Record<string, unknown>>(
        `
          SELECT
            id AS invite_id,
            organization_id,
            email,
            role,
            invited_by,
            accepted_at::text AS accepted_at,
            expires_at::text AS expires_at,
            created_at::text AS created_at
          FROM invites
          WHERE organization_id = $1
            AND accepted_at IS NULL
            AND expires_at > $2::timestamptz
          ORDER BY created_at DESC, id DESC
        `,
        [input.organization_id, input.now]
      );

      return invitesResult.rows;
    },

    async createInviteForOrganization(input): Promise<CreateOrganizationInviteResult | null> {
      const organizationResult = await db.query<{ organization_id: string; plan: string }>(
        `
          SELECT
            id AS organization_id,
            COALESCE(plan, 'free') AS plan
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

      if (!getTierCapabilities(organization.plan).member_invites) {
        return {
          kind: "upgrade_required",
          plan: organization.plan
        };
      }

      const existingMemberResult = await db.query<{ user_id: string }>(
        `
          SELECT om.user_id
          FROM organization_members om
          JOIN users u ON u.id = om.user_id
          WHERE om.organization_id = $1
            AND lower(u.email) = lower($2)
          LIMIT 1
        `,
        [input.organization_id, input.email]
      );

      if (existingMemberResult.rows[0] !== undefined) {
        return {
          kind: "member_exists",
          plan: organization.plan
        };
      }

      try {
        const result = await db.query<OrganizationInviteRecord & Record<string, unknown>>(
          `
            INSERT INTO invites (
              id,
              organization_id,
              email,
              role,
              invited_by,
              invite_token_hash,
              expires_at,
              created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, now())
            RETURNING
              id AS invite_id,
              organization_id,
              email,
              role,
              invited_by,
              accepted_at::text AS accepted_at,
              expires_at::text AS expires_at,
              created_at::text AS created_at
          `,
          [
            randomUUID(),
            input.organization_id,
            input.email.trim().toLowerCase(),
            input.role,
            input.invited_by_user_id,
            input.invite_token_hash,
            input.expires_at
          ]
        );

        const invite = result.rows[0];
        if (invite === undefined) {
          throw new Error("organization_invite_insert_failed");
        }

        return {
          kind: "created",
          plan: organization.plan,
          invite
        };
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "23505" &&
          "constraint" in error &&
          error.constraint === "invites_organization_id_email_key"
        ) {
          return {
            kind: "invite_exists",
            plan: organization.plan
          };
        }

        throw error;
      }
    },

    async cancelInviteForOrganization(input): Promise<OrganizationInviteRecord | null> {
      const result = await db.query<OrganizationInviteRecord & Record<string, unknown>>(
        `
          DELETE FROM invites
          WHERE organization_id = $1
            AND id = $2::uuid
            AND accepted_at IS NULL
          RETURNING
            id AS invite_id,
            organization_id,
            email,
            role,
            invited_by,
            accepted_at::text AS accepted_at,
            expires_at::text AS expires_at,
            created_at::text AS created_at
        `,
        [input.organization_id, input.invite_id]
      );

      return result.rows[0] ?? null;
    },

    async acceptInviteForUser(input): Promise<AcceptOrganizationInviteResult> {
      const inviteResult = await db.query<{
        invite_id: string;
        organization_id: string;
        email: string;
        role: "member";
      } & Record<string, unknown>>(
        `
          SELECT
            id AS invite_id,
            organization_id,
            email,
            role
          FROM invites
          WHERE invite_token_hash = $1
            AND accepted_at IS NULL
            AND expires_at > $2::timestamptz
          LIMIT 1
        `,
        [input.invite_token_hash, input.accepted_at]
      );

      const invite = inviteResult.rows[0];
      if (invite === undefined) {
        return { kind: "invalid_token" };
      }

      if (invite.email.trim().toLowerCase() !== input.email.trim().toLowerCase()) {
        return { kind: "email_mismatch" };
      }

      const existingMembershipResult = await db.query<{
        user_id: string;
        organization_id: string;
        role: "owner" | "member";
      } & Record<string, unknown>>(
        `
          SELECT
            user_id,
            organization_id,
            role
          FROM organization_members
          WHERE organization_id = $1
            AND user_id = $2::uuid
          LIMIT 1
        `,
        [invite.organization_id, input.user_id]
      );

      const existingMembership = existingMembershipResult.rows[0];
      if (existingMembership !== undefined) {
        await db.query(
          `
            UPDATE invites
            SET accepted_at = $2::timestamptz
            WHERE id = $1::uuid
              AND accepted_at IS NULL
          `,
          [invite.invite_id, input.accepted_at]
        );

        return {
          kind: "accepted",
          membership: existingMembership
        };
      }

      const createdMembershipResult = await db.query<{
        user_id: string;
        organization_id: string;
        role: "owner" | "member";
      } & Record<string, unknown>>(
        `
          INSERT INTO organization_members (id, organization_id, user_id, role, created_at)
          VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::timestamptz)
          ON CONFLICT (organization_id, user_id) DO NOTHING
          RETURNING user_id, organization_id, role
        `,
        [randomUUID(), invite.organization_id, input.user_id, invite.role, input.accepted_at]
      );

      const membership =
        createdMembershipResult.rows[0] ??
        (
          await db.query<{
            user_id: string;
            organization_id: string;
            role: "owner" | "member";
          } & Record<string, unknown>>(
            `
              SELECT
                user_id,
                organization_id,
                role
              FROM organization_members
              WHERE organization_id = $1::uuid
                AND user_id = $2::uuid
              LIMIT 1
            `,
            [invite.organization_id, input.user_id]
          )
        ).rows[0];

      if (membership === undefined) {
        return { kind: "invalid_token" };
      }

      await db.query(
        `
          UPDATE invites
          SET accepted_at = $2::timestamptz
          WHERE id = $1::uuid
            AND accepted_at IS NULL
        `,
        [invite.invite_id, input.accepted_at]
      );

      return {
        kind: "accepted",
        membership
      };
    },

    async removeMemberFromOrganization(input): Promise<RemoveOrganizationMemberResult | null> {
      const memberResult = await db.query<OrganizationMemberRecord & Record<string, unknown>>(
        `
          SELECT
            om.user_id,
            u.email,
            om.role,
            om.created_at::text AS created_at
          FROM organization_members om
          JOIN users u ON u.id = om.user_id
          WHERE om.organization_id = $1
            AND om.user_id = $2::uuid
          LIMIT 1
        `,
        [input.organization_id, input.user_id]
      );

      const member = memberResult.rows[0];
      if (member === undefined) {
        return null;
      }

      if (member.role === "owner") {
        return {
          kind: "owner_removal_forbidden",
          member
        };
      }

      await db.query(
        `
          DELETE FROM organization_members
          WHERE organization_id = $1
            AND user_id = $2::uuid
        `,
        [input.organization_id, input.user_id]
      );

      await db.query<{ revoked_token_count: string }>(
        `
          UPDATE member_tokens
          SET revoked_at = $3::timestamptz
          WHERE organization_id = $1
            AND user_id = $2::uuid
            AND revoked_at IS NULL
          RETURNING id AS revoked_token_count
        `,
        [input.organization_id, input.user_id, input.revoked_at]
      );

      return {
        kind: "removed",
        member
      };
    },

    async updateMemberRoleForOrganization(input): Promise<UpdateOrganizationMemberRoleResult | null> {
      const memberResult = await db.query<OrganizationMemberRecord & Record<string, unknown>>(
        `
          SELECT
            om.user_id,
            u.email,
            om.role,
            om.created_at::text AS created_at
          FROM organization_members om
          JOIN users u ON u.id = om.user_id
          WHERE om.organization_id = $1
            AND om.user_id = $2::uuid
          LIMIT 1
        `,
        [input.organization_id, input.user_id]
      );

      const member = memberResult.rows[0];
      if (member === undefined) {
        return null;
      }

      if (member.role === "owner" && input.role !== "owner") {
        const ownerCountResult = await db.query<{ owner_count: string }>(
          `
            SELECT COUNT(*)::text AS owner_count
            FROM organization_members
            WHERE organization_id = $1
              AND role = 'owner'
          `,
          [input.organization_id]
        );

        if (Number(ownerCountResult.rows[0]?.owner_count ?? "0") <= 1) {
          return {
            kind: "owner_role_change_forbidden",
            member
          };
        }
      }

      const updatedMemberResult = await db.query<OrganizationMemberRecord & Record<string, unknown>>(
        `
          UPDATE organization_members om
          SET role = $3
          FROM users u
          WHERE om.organization_id = $1
            AND om.user_id = $2::uuid
            AND u.id = om.user_id
          RETURNING
            om.user_id,
            u.email,
            om.role,
            om.created_at::text AS created_at
        `,
        [input.organization_id, input.user_id, input.role]
      );

      const updatedMember = updatedMemberResult.rows[0];
      if (updatedMember === undefined) {
        return null;
      }

      return {
        kind: "updated",
        member: updatedMember
      };
    },

    async listProjectsForOrganization(input): Promise<ProjectRecord[]> {
      const usageWindow = buildProjectMetricsWindow(input.now);
      const hasAlertDeliveries = await alertDeliveriesTableExists(db);
      const organizationPlanSql = "COALESCE(o.plan, 'free')";
      const billableIncidentEventsPredicate = buildBillableIncidentEventsPredicateSql({
        planSql: organizationPlanSql,
        eventClassSql: "ie.event_class"
      });
      const alertDeliveriesSelect = hasAlertDeliveries
        ? `
            (
              SELECT COUNT(*)::int
              FROM alert_deliveries ad
              WHERE ad.project_id = p.id
                AND ad.created_at >= $2::timestamptz
                AND ad.created_at < $3::timestamptz
            )
          `
        : "0";
      const result = await db.query<ProjectRecord & Record<string, unknown>>(
        `
          SELECT
            p.id AS project_id,
            p.organization_id,
            p.name,
            p.slug,
            p.environment_default,
            ${organizationPlanSql} AS organization_plan,
            json_build_object(
              'monthly_bundle_requests', (
                SELECT COUNT(*)::int
                FROM bundle_generations bg
                WHERE bg.project_id = p.id
                  AND bg.created_at >= $2::timestamptz
                  AND bg.created_at < $3::timestamptz
              ),
              'monthly_raw_ingested_events', (
                SELECT COUNT(*)::int
                FROM incident_events ie
                JOIN incidents i ON i.id = ie.incident_id
                WHERE i.project_id = p.id
                  AND (${billableIncidentEventsPredicate})
                  AND ie.occurred_at >= $2::timestamptz
                  AND ie.occurred_at < $3::timestamptz
              ),
              'retained_bundles', (
                SELECT COUNT(DISTINCT bg.incident_id)::int
                FROM bundle_generations bg
                WHERE bg.project_id = p.id
              ),
              'monthly_alert_deliveries', ${alertDeliveriesSelect}
            ) AS metrics,
            p.created_at::text AS created_at,
            p.updated_at::text AS updated_at
          FROM projects p
          JOIN organizations o ON o.id = p.organization_id
          WHERE p.organization_id = $1
          ORDER BY p.created_at DESC, p.id DESC
          LIMIT $4
        `,
        [input.organization_id, usageWindow.starts_at, usageWindow.ends_at, input.limit]
      );

      return result.rows.map(mapProjectRow);
    },

    async createProjectForOrganization(input): Promise<ProjectRecord | null> {
      try {
        const result = await db.query<ProjectRecord & Record<string, unknown>>(
          `
            WITH created_project AS (
              INSERT INTO projects (
                id,
                organization_id,
                name,
                slug,
                environment_default,
                created_at,
                updated_at
              )
              SELECT
                $1,
                o.id,
                $3,
                $4,
                $5,
                now(),
                now()
              FROM organizations o
              WHERE o.id = $2
              RETURNING
                id AS project_id,
                organization_id,
                name,
                slug,
                environment_default,
                created_at,
                updated_at
            )
            SELECT
              cp.project_id,
              cp.organization_id,
              cp.name,
              cp.slug,
              cp.environment_default,
              COALESCE(o.plan, 'free') AS organization_plan,
              json_build_object(
                'monthly_bundle_requests', 0,
                'monthly_raw_ingested_events', 0,
                'retained_bundles', 0,
                'monthly_alert_deliveries', 0
              ) AS metrics,
              cp.created_at::text AS created_at,
              cp.updated_at::text AS updated_at
            FROM created_project cp
            JOIN organizations o ON o.id = cp.organization_id
          `,
          [
            randomUUID(),
            input.organization_id,
            input.name,
            input.slug,
            input.environment_default
          ]
        );

        return result.rows[0] === undefined ? null : mapProjectRow(result.rows[0]);
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "23505" &&
          "constraint" in error &&
          error.constraint === "projects_organization_id_slug_key"
        ) {
          return null;
        }

        throw error;
      }
    },

    async updateProjectForOrganization(input): Promise<ProjectRecord | "slug_taken" | null> {
      try {
        const usageWindow = buildProjectMetricsWindow(new Date().toISOString());
        const hasAlertDeliveries = await alertDeliveriesTableExists(db);
        const billableIncidentEventsPredicate = buildBillableIncidentEventsPredicateSql({
          planSql: "(SELECT COALESCE(o.plan, 'free') FROM organizations o WHERE o.id = projects.organization_id)",
          eventClassSql: "ie.event_class"
        });
        const alertDeliveriesSelect = hasAlertDeliveries
          ? `
              (
                SELECT COUNT(*)::int
                FROM alert_deliveries ad
                WHERE ad.project_id = projects.id
                  AND ad.created_at >= $6::timestamptz
                  AND ad.created_at < $7::timestamptz
              )
            `
          : "0";
        const result = await db.query<ProjectRecord & Record<string, unknown>>(
          `
            WITH updated_project AS (
              UPDATE projects
              SET
                name = COALESCE($3, name),
                slug = COALESCE($4, slug),
                environment_default = COALESCE($5, environment_default),
                updated_at = now()
              WHERE organization_id = $1 AND id = $2
              RETURNING
                id AS project_id,
                organization_id,
                name,
                slug,
                environment_default,
                created_at,
                updated_at
            )
            SELECT
              up.project_id,
              up.organization_id,
              up.name,
              up.slug,
              up.environment_default,
              COALESCE(o.plan, 'free') AS organization_plan,
              json_build_object(
                'monthly_bundle_requests', (
                  SELECT COUNT(*)::int
                  FROM bundle_generations bg
                  WHERE bg.project_id = up.project_id
                    AND bg.created_at >= $6::timestamptz
                    AND bg.created_at < $7::timestamptz
                ),
                'monthly_raw_ingested_events', (
                  SELECT COUNT(*)::int
                  FROM incident_events ie
                  JOIN incidents i ON i.id = ie.incident_id
                  WHERE i.project_id = up.project_id
                    AND (${billableIncidentEventsPredicate})
                    AND ie.occurred_at >= $6::timestamptz
                    AND ie.occurred_at < $7::timestamptz
                ),
                'retained_bundles', (
                  SELECT COUNT(DISTINCT bg.incident_id)::int
                  FROM bundle_generations bg
                  WHERE bg.project_id = up.project_id
                ),
                'monthly_alert_deliveries', ${alertDeliveriesSelect}
              ) AS metrics,
              up.created_at::text AS created_at,
              up.updated_at::text AS updated_at
            FROM updated_project up
            JOIN organizations o ON o.id = up.organization_id
          `,
          [
            input.organization_id,
            input.project_id,
            input.name ?? null,
            input.slug ?? null,
            input.environment_default ?? null,
            usageWindow.starts_at,
            usageWindow.ends_at
          ]
        );

        return result.rows[0] === undefined ? null : mapProjectRow(result.rows[0]);
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "23505" &&
          "constraint" in error &&
          error.constraint === "projects_organization_id_slug_key"
        ) {
          return "slug_taken";
        }

        throw error;
      }
    },

    async deleteProjectForOrganization(input): Promise<DeletedProjectRecord | null> {
      const result = await db.query<DeletedProjectRecord & Record<string, unknown>>(
        `
          WITH deleted_project AS (
            DELETE FROM projects
            WHERE organization_id = $1 AND id = $2
            RETURNING
              id AS project_id,
              organization_id,
              name,
              slug,
              environment_default,
              created_at,
              updated_at
          )
          SELECT
            dp.project_id,
            dp.organization_id,
            dp.name,
            dp.slug,
            dp.environment_default,
            COALESCE(o.plan, 'free') AS organization_plan,
            dp.created_at::text AS created_at,
            dp.updated_at::text AS updated_at
          FROM deleted_project dp
          JOIN organizations o ON o.id = dp.organization_id
        `,
        [input.organization_id, input.project_id]
      );

      return result.rows[0] === undefined ? null : mapDeletedProjectRow(result.rows[0]);
    },

    async listProjectTokensForOrganization(input): Promise<ProjectTokenRecord[] | null> {
      const scopedProject = await db.query<{ id: string }>(
        `
          SELECT id
          FROM projects
          WHERE id = $1
            AND organization_id = $2
          LIMIT 1
        `,
        [input.project_id, input.organization_id]
      );

      if (scopedProject.rows[0] === undefined) {
        return null;
      }

      const result = await db.query<ProjectTokenRecord & Record<string, unknown>>(
        `
          SELECT
            id AS token_id,
            project_id,
            label,
            created_at::text AS created_at,
            last_used_at::text AS last_used_at,
            revoked_at::text AS revoked_at,
            expires_at::text AS expires_at
          FROM project_tokens
          WHERE project_id = $1
            AND revoked_at IS NULL
          ORDER BY created_at DESC
          LIMIT $2
        `,
        [input.project_id, input.limit]
      );

      return result.rows;
    },

    async createProjectTokenForOrganization(input): Promise<ProjectTokenRecord | null> {
      const scopedProject = await db.query<{ id: string }>(
        `
          SELECT id
          FROM projects
          WHERE id = $1
            AND organization_id = $2
          LIMIT 1
        `,
        [input.project_id, input.organization_id]
      );

      if (scopedProject.rows[0] === undefined) {
        return null;
      }

      const result = await db.query<ProjectTokenRecord & Record<string, unknown>>(
        `
          INSERT INTO project_tokens (id, project_id, token_hash, label, created_at)
          VALUES ($1, $2, $3, $4, now())
          RETURNING
            id AS token_id,
            project_id,
            label,
            created_at::text AS created_at,
            last_used_at::text AS last_used_at,
            revoked_at::text AS revoked_at,
            expires_at::text AS expires_at
        `,
        [randomUUID(), input.project_id, input.token_hash, input.label]
      );

      return result.rows[0] ?? null;
    },

    async revokeProjectTokenForOrganization(input): Promise<ProjectTokenRecord | null> {
      const result = await db.query<ProjectTokenRecord & Record<string, unknown>>(
        `
          UPDATE project_tokens pt
          SET revoked_at = $1
          FROM projects p
          WHERE pt.id = $2
            AND pt.project_id = $3
            AND p.id = pt.project_id
            AND p.organization_id = $4
            AND pt.revoked_at IS NULL
          RETURNING
            pt.id AS token_id,
            pt.project_id,
            pt.label,
            pt.created_at::text AS created_at,
            pt.last_used_at::text AS last_used_at,
            pt.revoked_at::text AS revoked_at,
            pt.expires_at::text AS expires_at
        `,
        [input.revoked_at, input.token_id, input.project_id, input.organization_id]
      );

      return result.rows[0] ?? null;
    },

    async listMemberTokensForOrganization(input): Promise<MemberTokenRecord[]> {
      const result = await db.query<MemberTokenRecord & Record<string, unknown>>(
        `
          SELECT
            id AS token_id,
            user_id,
            organization_id,
            label,
            created_at::text AS created_at,
            last_used_at::text AS last_used_at,
            revoked_at::text AS revoked_at,
            expires_at::text AS expires_at
          FROM member_tokens
          WHERE organization_id = $1
            AND user_id = $2
            AND revoked_at IS NULL
          ORDER BY created_at DESC
          LIMIT $3
        `,
        [input.organization_id, input.user_id, input.limit]
      );

      return result.rows;
    },

    async createMemberTokenForOrganization(input): Promise<MemberTokenRecord> {
      const result = await db.query<MemberTokenRecord & Record<string, unknown>>(
        `
          INSERT INTO member_tokens (id, user_id, organization_id, token_hash, label, created_at)
          VALUES ($1, $2, $3, $4, $5, now())
          RETURNING
            id AS token_id,
            user_id,
            organization_id,
            label,
            created_at::text AS created_at,
            last_used_at::text AS last_used_at,
            revoked_at::text AS revoked_at,
            expires_at::text AS expires_at
        `,
        [randomUUID(), input.user_id, input.organization_id, input.token_hash, input.label]
      );

      const created = result.rows[0];
      if (created === undefined) {
        throw new Error("member_token_insert_failed");
      }

      return created;
    },

    async revokeMemberTokenForOrganization(input): Promise<MemberTokenRecord | null> {
      const result = await db.query<MemberTokenRecord & Record<string, unknown>>(
        `
          UPDATE member_tokens
          SET revoked_at = $1
          WHERE id = $2
            AND organization_id = $3
            AND user_id = $4
            AND revoked_at IS NULL
          RETURNING
            id AS token_id,
            user_id,
            organization_id,
            label,
            created_at::text AS created_at,
            last_used_at::text AS last_used_at,
            revoked_at::text AS revoked_at,
            expires_at::text AS expires_at
        `,
        [input.revoked_at, input.token_id, input.organization_id, input.user_id]
      );

      return result.rows[0] ?? null;
    },

    async listAlertsForOrganization(input): Promise<AlertRuleRecord[] | null> {
      const scopedProject = await db.query<{ id: string }>(
        `
          SELECT id
          FROM projects
          WHERE id = $1
            AND organization_id = $2
          LIMIT 1
        `,
        [input.project_id, input.organization_id]
      );

      if (scopedProject.rows[0] === undefined) {
        return null;
      }

      const result = await db.query<{
        alert_id: string;
        project_id: string;
        service_id: string | null;
        channel: AlertRuleRecord["channel"];
        condition_type: AlertRuleRecord["condition_type"];
        severity_min: AlertRuleRecord["severity_min"];
        config: Record<string, unknown>;
        is_enabled: boolean;
        created_at: string;
        updated_at: string;
      }>(
        `
          SELECT
            id AS alert_id,
            project_id,
            service_id,
            channel,
            condition_type,
            severity_min,
            config,
            is_enabled,
            created_at::text AS created_at,
            updated_at::text AS updated_at
          FROM alert_rules
          WHERE project_id = $1
          ORDER BY created_at DESC, id DESC
          LIMIT $2
        `,
        [input.project_id, input.limit]
      );

      return result.rows.map(mapAlertRuleRow);
    },

    async createAlertForOrganization(input): Promise<AlertRuleRecord | null> {
      const scopedProject = await db.query<{ id: string }>(
        `
          SELECT p.id
          FROM projects p
          LEFT JOIN services s ON s.id = $3::uuid
          WHERE p.id = $1
            AND p.organization_id = $2
            AND ($3::uuid IS NULL OR s.project_id = p.id)
          LIMIT 1
        `,
        [input.project_id, input.organization_id, input.service_id ?? null]
      );

      if (scopedProject.rows[0] === undefined) {
        return null;
      }

      const result = await db.query<{
        alert_id: string;
        project_id: string;
        service_id: string | null;
        channel: AlertRuleRecord["channel"];
        condition_type: AlertRuleRecord["condition_type"];
        severity_min: AlertRuleRecord["severity_min"];
        config: Record<string, unknown>;
        is_enabled: boolean;
        created_at: string;
        updated_at: string;
      }>(
        `
          INSERT INTO alert_rules (
            id,
            project_id,
            service_id,
            channel,
            condition_type,
            severity_min,
            config,
            is_enabled,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3::uuid, $4, $5, $6, $7::jsonb, $8, now(), now())
          RETURNING
            id AS alert_id,
            project_id,
            service_id,
            channel,
            condition_type,
            severity_min,
            config,
            is_enabled,
            created_at::text AS created_at,
            updated_at::text AS updated_at
        `,
        [
          randomUUID(),
          input.project_id,
          input.service_id ?? null,
          input.channel,
          input.condition_type,
          input.severity_min ?? null,
          JSON.stringify(input.config),
          input.is_enabled
        ]
      );

      const created = result.rows[0];
      return created === undefined ? null : mapAlertRuleRow(created);
    },

    async updateAlertForOrganization(input): Promise<AlertRuleRecord | null> {
      const hasServiceId = Object.prototype.hasOwnProperty.call(input, "service_id");
      const hasSeverityMin = Object.prototype.hasOwnProperty.call(input, "severity_min");
      const hasConfig = Object.prototype.hasOwnProperty.call(input, "config");

      const result = await db.query<{
        alert_id: string;
        project_id: string;
        service_id: string | null;
        channel: AlertRuleRecord["channel"];
        condition_type: AlertRuleRecord["condition_type"];
        severity_min: AlertRuleRecord["severity_min"];
        config: Record<string, unknown>;
        is_enabled: boolean;
        created_at: string;
        updated_at: string;
      }>(
        `
          UPDATE alert_rules ar
          SET
            service_id = CASE WHEN $3::boolean THEN $4::uuid ELSE ar.service_id END,
            channel = COALESCE($5, ar.channel),
            condition_type = COALESCE($6, ar.condition_type),
            severity_min = CASE WHEN $7::boolean THEN $8 ELSE ar.severity_min END,
            config = CASE WHEN $9::boolean THEN COALESCE($10::jsonb, '{}'::jsonb) ELSE ar.config END,
            is_enabled = COALESCE($11::boolean, ar.is_enabled),
            updated_at = now()
          FROM projects p
          LEFT JOIN services s ON s.id = $4::uuid
          WHERE ar.id = $1
            AND p.id = ar.project_id
            AND p.organization_id = $2
            AND ($4::uuid IS NULL OR $3::boolean = false OR s.project_id = ar.project_id)
          RETURNING
            ar.id AS alert_id,
            ar.project_id,
            ar.service_id,
            ar.channel,
            ar.condition_type,
            ar.severity_min,
            ar.config,
            ar.is_enabled,
            ar.created_at::text AS created_at,
            ar.updated_at::text AS updated_at
        `,
        [
          input.alert_id,
          input.organization_id,
          hasServiceId,
          hasServiceId ? input.service_id ?? null : null,
          input.channel ?? null,
          input.condition_type ?? null,
          hasSeverityMin,
          hasSeverityMin ? input.severity_min ?? null : null,
          hasConfig,
          hasConfig ? JSON.stringify(input.config ?? {}) : null,
          input.is_enabled ?? null
        ]
      );

      const updated = result.rows[0];
      return updated === undefined ? null : mapAlertRuleRow(updated);
    },

    async deleteAlertForOrganization(input): Promise<DeleteAlertResult | null> {
      const result = await db.query<DeleteAlertResult & Record<string, unknown>>(
        `
          DELETE FROM alert_rules ar
          USING projects p
          WHERE ar.id = $1
            AND p.id = ar.project_id
            AND p.organization_id = $2
          RETURNING ar.id AS alert_id
        `,
        [input.alert_id, input.organization_id]
      );

      return result.rows[0] ?? null;
    },

    async listActiveProbesForProject(input: { project_id: string; now: string }): Promise<ProbeActivationRecord[]> {
      const result = await db.query<ProbeActivationRecord & Record<string, unknown>>(
        `
          SELECT
            id AS activation_id,
            label_pattern,
            service,
            environment,
            expires_at::text AS expires_at,
            trigger_expires_at::text AS trigger_expires_at
          FROM probe_activations
          WHERE project_id = $1
            AND deactivated_at IS NULL
            AND expires_at > $2::timestamptz
          ORDER BY created_at DESC
        `,
        [input.project_id, input.now]
      );

      return result.rows;
    },

    async listActiveProbesForProjectInOrganization(input: {
      organization_id: string;
      project_id: string;
      now: string;
    }): Promise<{ organization_plan: TierName; activations: ProbeActivationRecord[] } | null> {
      const scopedProject = await db.query<Record<string, unknown>>(
        `
          SELECT p.id, COALESCE(o.plan, 'free') AS organization_plan
          FROM projects p
          JOIN organizations o ON o.id = p.organization_id
          WHERE p.id = $1
            AND p.organization_id = $2
          LIMIT 1
        `,
        [input.project_id, input.organization_id]
      );

      const project = scopedProject.rows[0];
      if (project === undefined) {
        return null;
      }

      const activations = await db.query<ProbeActivationRecord & Record<string, unknown>>(
        `
          SELECT
            id AS activation_id,
            label_pattern,
            service,
            environment,
            expires_at::text AS expires_at,
            trigger_expires_at::text AS trigger_expires_at
          FROM probe_activations
          WHERE project_id = $1
            AND deactivated_at IS NULL
            AND expires_at > $2::timestamptz
          ORDER BY created_at DESC
        `,
        [input.project_id, input.now]
      );

      return {
        organization_plan: project["organization_plan"] === "solo" ? "solo" : project["organization_plan"] === "team" ? "team" : "free",
        activations: activations.rows
      };
    },

    async createProbeActivationForProjectInOrganization(input: {
      organization_id: string;
      project_id: string;
      created_by_member_id: string;
      label_pattern: string;
      service: string;
      environment: string;
      expires_at: string;
      trigger_expires_at: string;
    }): Promise<{ organization_plan: TierName; activation: ProbeActivationRecord; trigger_token: string; concurrent_limit_exceeded?: boolean } | null> {
      const scopedProject = await db.query<Record<string, unknown>>(
        `
          SELECT p.id, COALESCE(o.plan, 'free') AS organization_plan
          FROM projects p
          JOIN organizations o ON o.id = p.organization_id
          WHERE p.id = $1
            AND p.organization_id = $2
          LIMIT 1
        `,
        [input.project_id, input.organization_id]
      );

      const project = scopedProject.rows[0];
      if (project === undefined) {
        return null;
      }

      /** Max 5 concurrent active (non-expired, non-deactivated) activations per project (FR-PRB-05). */
      const countResult = await db.query<{ cnt: string }>(
        `
          SELECT COUNT(*)::text AS cnt
          FROM probe_activations
          WHERE project_id = $1
            AND deactivated_at IS NULL
            AND expires_at > now()
        `,
        [input.project_id]
      );
      const activeCount = Number(countResult.rows[0]?.cnt ?? "0");
      if (activeCount >= 5) {
        return {
          organization_plan: project["organization_plan"] === "solo" ? "solo" : project["organization_plan"] === "team" ? "team" : "free",
          activation: { activation_id: "", label_pattern: "", service: "", environment: "", expires_at: "", trigger_expires_at: "", },
          trigger_token: "",
          concurrent_limit_exceeded: true
        };
      }

      const activationId = randomUUID();
      const triggerToken = generateProbeTriggerToken({
        projectId: input.project_id,
        payload: {
          activation_id: activationId,
          label_pattern: input.label_pattern,
          service: input.service,
          environment: input.environment,
          trigger_expires_at: input.trigger_expires_at
        }
      });

      const inserted = await db.query<ProbeActivationRecord & Record<string, unknown>>(
        `
          INSERT INTO probe_activations (
            id,
            project_id,
            created_by_member_id,
            label_pattern,
            service,
            environment,
            trigger_token_hash,
            trigger_expires_at,
            expires_at,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
          RETURNING
            id AS activation_id,
            label_pattern,
            service,
            environment,
            expires_at::text AS expires_at,
            trigger_expires_at::text AS trigger_expires_at
        `,
        [
          activationId,
          input.project_id,
          input.created_by_member_id,
          input.label_pattern,
          input.service,
          input.environment,
          triggerToken.hash,
          input.trigger_expires_at,
          input.expires_at
        ]
      );

      const activation = inserted.rows[0];
      if (activation === undefined) {
        throw new Error("probe_activation_insert_failed");
      }

      return {
        organization_plan: project["organization_plan"] === "solo" ? "solo" : project["organization_plan"] === "team" ? "team" : "free",
        activation,
        trigger_token: triggerToken.plaintext
      };
    },

    async deactivateProbeActivationForProjectInOrganization(input: {
      organization_id: string;
      project_id: string;
      activation_id: string;
      deactivated_at: string;
    }): Promise<{ organization_plan: TierName; deactivated: { activation_id: string; deactivated_at: string } } | null> {
      const result = await db.query<Record<string, unknown>>(
        `
          UPDATE probe_activations pa
          SET deactivated_at = $1
          FROM projects p
          WHERE pa.id = $2
            AND pa.project_id = $3
            AND pa.project_id = p.id
            AND p.organization_id = $4
            AND pa.deactivated_at IS NULL
          RETURNING
            COALESCE((SELECT o.plan FROM organizations o WHERE o.id = p.organization_id), 'free') AS organization_plan,
            pa.id AS activation_id,
            pa.deactivated_at::text AS deactivated_at
        `,
        [input.deactivated_at, input.activation_id, input.project_id, input.organization_id]
      );

      const row = result.rows[0];
      if (row === undefined) {
        return null;
      }

      return {
        organization_plan: row["organization_plan"] === "solo" ? "solo" : row["organization_plan"] === "team" ? "team" : "free",
        deactivated: {
          activation_id: getRequiredStringField(row, "activation_id"),
          deactivated_at: getRequiredStringField(row, "deactivated_at")
        }
      };
    },

    async listIncidentsForOrganization(input): Promise<IncidentRetrievalRecord[]> {
      const conditions = ["p.organization_id = $1"];
      const params: unknown[] = [input.organization_id];

      if (input.project_id !== undefined) {
        params.push(input.project_id);
        conditions.push(`i.project_id = $${params.length}`);
      }

      if (input.environment !== undefined) {
        params.push(input.environment);
        conditions.push(`i.environment = $${params.length}`);
      }

      if (input.service !== undefined) {
        params.push(input.service);
        conditions.push(`s.name = $${params.length}`);
      }

      if (input.status !== undefined) {
        params.push(input.status);
        conditions.push(`i.status = $${params.length}`);
      }

      if (input.severity !== undefined) {
        params.push(input.severity);
        conditions.push(`i.severity = $${params.length}`);
      }

      if (input.cursor !== undefined) {
        params.push(input.cursor.last_seen_at);
        const lastSeenAtIndex = params.length;
        params.push(input.cursor.incident_id);
        const incidentIdIndex = params.length;
        conditions.push(
          `(i.last_seen_at < $${lastSeenAtIndex} OR (i.last_seen_at = $${lastSeenAtIndex} AND i.id < $${incidentIdIndex}))`
        );
      }

      params.push(input.limit);
      const limitIndex = params.length;

      const result = await db.query<IncidentRetrievalRecord>(
        `
          SELECT
            i.id AS incident_id,
            i.project_id,
            p.name AS project_name,
            i.service_id,
            s.name AS service_name,
            i.latest_deployment_id::text AS latest_deployment_id,
            i.environment,
            i.fingerprint,
            i.fingerprint_version,
            i.title,
            i.severity,
            i.status,
            i.first_seen_at::text AS first_seen_at,
            i.last_seen_at::text AS last_seen_at,
            i.occurrence_count,
            i.spike_detected_at::text AS spike_detected_at,
            i.resolved_at::text AS resolved_at,
            i.regressed_at::text AS regressed_at,
            COALESCE(i.matched_fields, ARRAY[]::text[]) AS matched_fields
          FROM incidents i
          JOIN projects p ON p.id = i.project_id
          LEFT JOIN services s ON s.id = i.service_id
          WHERE ${conditions.join("\n            AND ")}
          ORDER BY i.last_seen_at DESC, i.id DESC
          LIMIT $${limitIndex}
        `,
        params
      );

      return result.rows;
    },

    async getIncidentForOrganization(input): Promise<IncidentRetrievalRecord | null> {
      const result = await db.query<IncidentRetrievalRecord>(
        `
          SELECT
            i.id AS incident_id,
            i.project_id,
            p.name AS project_name,
            i.service_id,
            s.name AS service_name,
            i.latest_deployment_id::text AS latest_deployment_id,
            i.environment,
            i.fingerprint,
            i.fingerprint_version,
            i.title,
            i.severity,
            i.status,
            i.first_seen_at::text AS first_seen_at,
            i.last_seen_at::text AS last_seen_at,
            i.occurrence_count,
            i.spike_detected_at::text AS spike_detected_at,
            i.resolved_at::text AS resolved_at,
            i.regressed_at::text AS regressed_at,
            COALESCE(i.matched_fields, ARRAY[]::text[]) AS matched_fields
          FROM incidents i
          JOIN projects p ON p.id = i.project_id
          LEFT JOIN services s ON s.id = i.service_id
          WHERE p.organization_id = $1
            AND i.id = $2
          LIMIT 1
        `,
        [input.organization_id, input.incident_id]
      );

      return result.rows[0] ?? null;
    },

    async resolveIncidentForOrganization(input) {
      const result = await db.query<IncidentRetrievalRecord>(
        `
          WITH updated AS (
            UPDATE incidents i
            SET status = 'resolved',
                resolved_at = COALESCE(i.resolved_at, $4::timestamptz),
                resolved_by_member_id = COALESCE(i.resolved_by_member_id, $3::uuid),
                updated_at = now()
            FROM projects p
            WHERE i.project_id = p.id
              AND p.organization_id = $1
              AND i.id = $2
            RETURNING
              i.id AS incident_id,
              i.project_id,
              i.service_id,
              i.latest_deployment_id::text AS latest_deployment_id,
              i.environment,
              i.fingerprint,
              i.fingerprint_version,
              i.title,
              i.severity,
              i.status,
              i.first_seen_at::text AS first_seen_at,
              i.last_seen_at::text AS last_seen_at,
              i.occurrence_count,
              i.spike_detected_at::text AS spike_detected_at,
              i.resolved_at::text AS resolved_at,
              i.regressed_at::text AS regressed_at,
              COALESCE(i.matched_fields, ARRAY[]::text[]) AS matched_fields
          )
          SELECT
            updated.incident_id,
            updated.project_id,
            p.name AS project_name,
            updated.service_id,
            s.name AS service_name,
            updated.latest_deployment_id,
            updated.environment,
            updated.fingerprint,
            updated.fingerprint_version,
            updated.title,
            updated.severity,
            updated.status,
            updated.first_seen_at,
            updated.last_seen_at,
            updated.occurrence_count,
            updated.spike_detected_at,
            updated.resolved_at,
            updated.regressed_at,
            updated.matched_fields
          FROM updated
          JOIN projects p ON p.id = updated.project_id
          LEFT JOIN services s ON s.id = updated.service_id
        `,
        [input.organization_id, input.incident_id, input.resolved_by_member_id, input.resolved_at]
      );

      return result.rows[0] ?? null;
    },

    async reopenIncidentForOrganization(input) {
      const result = await db.query<IncidentRetrievalRecord>(
        `
          WITH updated AS (
            UPDATE incidents i
            SET status = 'open',
                resolved_at = NULL,
                resolved_by_member_id = NULL,
                regressed_at = NULL,
                updated_at = now()
            FROM projects p
            WHERE i.project_id = p.id
              AND p.organization_id = $1
              AND i.id = $2
            RETURNING
              i.id AS incident_id,
              i.project_id,
              i.service_id,
              i.latest_deployment_id::text AS latest_deployment_id,
              i.environment,
              i.fingerprint,
              i.fingerprint_version,
              i.title,
              i.severity,
              i.status,
              i.first_seen_at::text AS first_seen_at,
              i.last_seen_at::text AS last_seen_at,
              i.occurrence_count,
              i.spike_detected_at::text AS spike_detected_at,
              i.resolved_at::text AS resolved_at,
              i.regressed_at::text AS regressed_at,
              COALESCE(i.matched_fields, ARRAY[]::text[]) AS matched_fields
          )
          SELECT
            updated.incident_id,
            updated.project_id,
            p.name AS project_name,
            updated.service_id,
            s.name AS service_name,
            updated.latest_deployment_id,
            updated.environment,
            updated.fingerprint,
            updated.fingerprint_version,
            updated.title,
            updated.severity,
            updated.status,
            updated.first_seen_at,
            updated.last_seen_at,
            updated.occurrence_count,
            updated.spike_detected_at,
            updated.resolved_at,
            updated.regressed_at,
            updated.matched_fields
          FROM updated
          JOIN projects p ON p.id = updated.project_id
          LEFT JOIN services s ON s.id = updated.service_id
        `,
        [input.organization_id, input.incident_id]
      );

      return result.rows[0] ?? null;
    },

    async listServicesForOrganization(input): Promise<ServiceRetrievalRecord[] | null> {
      const scopedProject = await db.query<{ id: string }>(
        `
          SELECT id
          FROM projects
          WHERE id = $1
            AND organization_id = $2
          LIMIT 1
        `,
        [input.project_id, input.organization_id]
      );

      if (scopedProject.rows[0] === undefined) {
        return null;
      }

      const result = await db.query<ServiceRetrievalRecord>(
        `
          SELECT
            s.id AS service_id,
            s.project_id,
            s.name,
            s.runtime,
            s.framework,
            s.environment
          FROM services s
          WHERE s.project_id = $1
          ORDER BY s.name ASC, s.environment ASC, s.id ASC
          LIMIT $2
        `,
        [input.project_id, input.limit]
      );

      return result.rows;
    },

    async listIncidentLogsForOrganization(input): Promise<IncidentLogRecord[]> {
      const cursorOccurredAt = input.cursor?.occurred_at ?? null;
      const cursorEventId = input.cursor?.event_id ?? null;
      const level = input.level ?? null;

      const result = await db.query<IncidentLogRecord>(
        `
          SELECT
            ie.event_id,
            ie.event_type,
            ie.occurred_at::text AS occurred_at,
            ie.is_sampled,
            ie.level
          FROM incident_events ie
          JOIN incidents i ON i.id = ie.incident_id
          JOIN projects p ON p.id = i.project_id
          WHERE i.id = $1
            AND p.organization_id = $2
            AND ($3::text IS NULL OR ie.level = $3)
            AND (
              $4::timestamptz IS NULL
              OR (ie.occurred_at, ie.event_id) < ($4::timestamptz, $5::uuid)
            )
          ORDER BY ie.occurred_at DESC
          LIMIT $6
        `,
        [input.incident_id, input.organization_id, level, cursorOccurredAt, cursorEventId, input.limit]
      );

      return result.rows;
    },

    async getBundleBuildContext(input): Promise<BundleBuildContext | null> {
      const result = await db.query<BundleBuildContext & Record<string, unknown>>(
        `
          SELECT
            i.id::text AS incident_id,
            i.project_id::text AS project_id,
            i.service_id::text AS service_id,
            COALESCE(s.name, 'unknown') AS service_name,
            s.runtime AS service_runtime,
            s.framework AS service_framework,
            i.environment,
            i.fingerprint,
            i.title,
            i.severity,
            i.first_seen_at::text AS first_seen_at,
            i.last_seen_at::text AS last_seen_at,
            i.occurrence_count,
            COALESCE(
              ARRAY_AGG(DISTINCT ie.event_type ORDER BY ie.event_type)
                FILTER (WHERE ie.event_type IS NOT NULL),
              ARRAY[]::text[]
            ) AS source_event_types
          FROM incidents i
          LEFT JOIN services s ON s.id = i.service_id
          LEFT JOIN incident_events ie ON ie.incident_id = i.id
          WHERE i.project_id = $1
            AND i.id = $2
          GROUP BY
            i.id,
            i.project_id,
            i.service_id,
            s.name,
            s.runtime,
            s.framework,
            i.environment,
            i.fingerprint,
            i.title,
            i.severity,
            i.first_seen_at,
            i.last_seen_at,
            i.occurrence_count
          LIMIT 1
        `,
        [input.project_id, input.incident_id]
      );

      return result.rows[0] ?? null;
    },
    async hasBundleGenerationForSourceEvent(input): Promise<boolean> {
      const result = await db.query<{ exists: boolean }>(
        `
          SELECT EXISTS(
            SELECT 1
            FROM bundle_generations
            WHERE incident_id = $1
              AND source_event_id = $2
          ) AS exists
        `,
        [input.incident_id, input.event_id]
      );

      return result.rows[0]?.exists ?? false;
    },

    async markBundleGenerationFailure(input): Promise<void> {
      await db.query(
        `
          UPDATE incidents
          SET
            bundle_failure_reason = $2,
            updated_at = now()
          WHERE id = $1
        `,
        [input.incident_id, input.reason]
      );
    },

    async pruneRetainedIncidentsForProject(input): Promise<Array<{ project_id: string; incident_id: string }>> {
      const result = await db.query<{ project_id: string; incident_id: string }>(
        `
          WITH organization_scope AS (
            SELECT organization_id
            FROM projects
            WHERE id = $1::uuid
            LIMIT 1
          ),
          ranked_incidents AS (
            SELECT
              i.id AS incident_id,
              i.project_id AS project_id,
              MAX(bg.created_at) AS latest_bundle_created_at,
              ROW_NUMBER() OVER (
                ORDER BY MAX(bg.created_at) DESC, i.id DESC
              ) AS bundle_rank
            FROM bundle_generations bg
            JOIN incidents i ON i.id = bg.incident_id
            JOIN projects p ON p.id = i.project_id
            JOIN organization_scope scope ON scope.organization_id = p.organization_id
            GROUP BY i.id, i.project_id
          ),
          incidents_to_delete AS (
            SELECT incident_id, project_id
            FROM ranked_incidents
            WHERE bundle_rank > $2::int
          ),
          deleted AS (
            DELETE FROM incidents i
            USING incidents_to_delete target
            WHERE i.id = target.incident_id
            RETURNING target.project_id::text AS project_id, target.incident_id::text AS incident_id
          )
          SELECT project_id, incident_id
          FROM deleted
        `,
        [input.project_id, input.retained_bundle_limit]
      );

      return result.rows;
    },

    async reserveBundleGeneration(input): Promise<{
      generation_number: number;
      created_at: string;
      updated_at: string;
      source_event_id: string;
      source_occurred_at: string;
      trigger: BuildBundleJob["trigger"];
    }> {
      const result = await db.query<{
        project_id: string;
        generation_number: number;
        created_at: string;
        updated_at: string;
        source_event_id: string;
        source_occurred_at: string;
        trigger: BuildBundleJob["trigger"];
      } & Record<string, unknown>>(
        `
          WITH reserved AS (
            UPDATE incidents
            SET
              bundle_generation_number = CASE
                WHEN bundle_source_event_id = $2::uuid THEN bundle_generation_number
                WHEN bundle_source_occurred_at IS NOT NULL AND bundle_source_occurred_at > $3::timestamptz
                  THEN bundle_generation_number
                ELSE GREATEST(bundle_generation_number, 0) + 1
              END,
              bundle_created_at = CASE
                WHEN bundle_source_event_id = $2::uuid AND bundle_created_at IS NOT NULL THEN bundle_created_at
                WHEN bundle_source_occurred_at IS NOT NULL AND bundle_source_occurred_at > $3::timestamptz
                  THEN bundle_created_at
                ELSE now()
              END,
              bundle_updated_at = CASE
                WHEN bundle_source_event_id = $2::uuid AND bundle_updated_at IS NOT NULL THEN bundle_updated_at
                WHEN bundle_source_occurred_at IS NOT NULL AND bundle_source_occurred_at > $3::timestamptz
                  THEN bundle_updated_at
                ELSE now()
              END,
              bundle_source_event_id = CASE
                WHEN bundle_source_occurred_at IS NOT NULL AND bundle_source_occurred_at > $3::timestamptz
                  THEN bundle_source_event_id
                ELSE $2::uuid
              END,
              bundle_source_occurred_at = CASE
                WHEN bundle_source_occurred_at IS NOT NULL AND bundle_source_occurred_at > $3::timestamptz
                  THEN bundle_source_occurred_at
                ELSE $3::timestamptz
              END,
              bundle_trigger = CASE
                WHEN bundle_source_occurred_at IS NOT NULL AND bundle_source_occurred_at > $3::timestamptz
                  THEN bundle_trigger
                ELSE $4
              END,
              bundle_failure_reason = NULL,
              updated_at = now()
            WHERE id = $1
            RETURNING
              project_id::text AS project_id,
              id::text AS incident_id,
              bundle_generation_number AS generation_number,
              bundle_created_at::text AS created_at,
              bundle_updated_at::text AS updated_at,
              bundle_source_event_id::text AS source_event_id,
              bundle_source_occurred_at::text AS source_occurred_at,
              bundle_trigger AS trigger
          ),
          persisted AS (
            INSERT INTO bundle_generations (
              id,
              project_id,
              incident_id,
              bundle_type,
              generation_number,
              source_event_id,
              source_occurred_at,
              trigger,
              created_at,
              updated_at
            )
            SELECT
              $5::uuid,
              reserved.project_id::uuid,
              reserved.incident_id::uuid,
              'failure',
              reserved.generation_number,
              reserved.source_event_id::uuid,
              reserved.source_occurred_at::timestamptz,
              reserved.trigger,
              reserved.created_at::timestamptz,
              reserved.updated_at::timestamptz
            FROM reserved
            ON CONFLICT (incident_id, source_event_id)
            DO UPDATE SET
              generation_number = EXCLUDED.generation_number,
              trigger = EXCLUDED.trigger,
              updated_at = EXCLUDED.updated_at
            RETURNING 1
          )
          SELECT
            reserved.project_id,
            reserved.generation_number,
            reserved.created_at,
            reserved.updated_at,
            reserved.source_event_id,
            reserved.source_occurred_at,
            reserved.trigger
          FROM reserved
        `,
        [input.incident_id, input.event_id, input.occurred_at, input.trigger, randomUUID()]
      );

      const row = result.rows[0];
      if (row === undefined) {
        throw new Error("bundle_generation_reserve_failed");
      }

      return {
        generation_number: row.generation_number,
        created_at: row.created_at,
        updated_at: row.updated_at,
        source_event_id: row.source_event_id,
        source_occurred_at: row.source_occurred_at,
        trigger: row.trigger
      };
    },

    async listIncidentEventReferences(input): Promise<IncidentEventReference[]> {
      const result = await db.query<IncidentEventReference & Record<string, unknown>>(
        `
          SELECT
            ie.event_id,
            ie.event_type,
            ie.occurred_at::text AS occurred_at
          FROM incident_events ie
          WHERE ie.incident_id = $1
            AND ie.is_sampled = true
          ORDER BY ie.occurred_at ASC, ie.event_id ASC
        `,
        [input.incident_id]
      );

      return result.rows;
    },

    async listProbeEventCandidatesForServiceWindow(input): Promise<ProbeEventCandidateReference[]> {
      const result = await db.query<ProbeEventCandidateReference & Record<string, unknown>>(
        `
          SELECT
            ie.event_id,
            ie.occurred_at::text AS occurred_at
          FROM incident_events ie
          JOIN incidents i ON i.id = ie.incident_id
          LEFT JOIN services s ON s.id = i.service_id
          WHERE i.project_id = $1
            AND i.environment = $2
            AND COALESCE(s.name, 'unknown') = $3
            AND ie.event_type = 'probe_event'
            AND ie.occurred_at >= $4::timestamptz
            AND ie.occurred_at <= $5::timestamptz
          ORDER BY ie.occurred_at ASC, ie.event_id ASC
        `,
        [input.project_id, input.environment, input.service_name, input.window_start, input.window_end]
      );

      return result.rows;
    },

    async listProjectsWithWeeklyActivity(input): Promise<string[]> {
      const result = await db.query<{ project_id: string } & Record<string, unknown>>(
        `
          SELECT DISTINCT activity.project_id
          FROM (
            SELECT bg.project_id::text AS project_id
            FROM bundle_generations bg
            WHERE bg.created_at >= $1::timestamptz
              AND bg.created_at < $2::timestamptz

            UNION

            SELECT i.project_id::text AS project_id
            FROM incidents i
            WHERE i.first_seen_at >= $1::timestamptz
              AND i.first_seen_at < $2::timestamptz

            UNION

            SELECT i.project_id::text AS project_id
            FROM incidents i
            WHERE i.regressed_at IS NOT NULL
              AND i.regressed_at >= $1::timestamptz
              AND i.regressed_at < $2::timestamptz

            UNION

            SELECT i.project_id::text AS project_id
            FROM incidents i
            WHERE i.spike_detected_at IS NOT NULL
              AND i.spike_detected_at >= $1::timestamptz
              AND i.spike_detected_at < $2::timestamptz
          ) AS activity
          ORDER BY activity.project_id ASC
          LIMIT $3
        `,
        [input.window_start, input.window_end, input.limit]
      );

      return result.rows.map((row) => row.project_id);
    },

    async getWeeklyProjectReport(input): Promise<WeeklyProjectReportSummary | null> {
      const result = await db.query<{
        project_id: string;
        window_start: string;
        window_end: string;
        failure_bundles: number;
        improvement_bundles: number;
        new_incidents: number;
        regressions: number;
        top_spiking_incidents: WeeklyProjectReportSummary["top_spiking_incidents"];
      } & Record<string, unknown>>(
        `
          WITH activity AS (
            SELECT 1
            FROM bundle_generations bg
            WHERE bg.project_id = $1::uuid
              AND bg.created_at >= $2::timestamptz
              AND bg.created_at < $3::timestamptz

            UNION ALL

            SELECT 1
            FROM incidents i
            WHERE i.project_id = $1::uuid
              AND i.first_seen_at >= $2::timestamptz
              AND i.first_seen_at < $3::timestamptz

            UNION ALL

            SELECT 1
            FROM incidents i
            WHERE i.project_id = $1::uuid
              AND i.regressed_at IS NOT NULL
              AND i.regressed_at >= $2::timestamptz
              AND i.regressed_at < $3::timestamptz

            UNION ALL

            SELECT 1
            FROM incidents i
            WHERE i.project_id = $1::uuid
              AND i.spike_detected_at IS NOT NULL
              AND i.spike_detected_at >= $2::timestamptz
              AND i.spike_detected_at < $3::timestamptz
            LIMIT 1
          ),
          top_spikes AS (
            SELECT
              i.id::text AS incident_id,
              i.title,
              i.occurrence_count,
              i.spike_detected_at::text AS spike_detected_at
            FROM incidents i
            WHERE i.project_id = $1::uuid
              AND i.spike_detected_at IS NOT NULL
              AND i.spike_detected_at >= $2::timestamptz
              AND i.spike_detected_at < $3::timestamptz
            ORDER BY i.occurrence_count DESC, i.spike_detected_at DESC, i.id ASC
            LIMIT 5
          )
          SELECT
            $1::text AS project_id,
            $2::timestamptz::text AS window_start,
            $3::timestamptz::text AS window_end,
            COALESCE((
              SELECT COUNT(*)::integer
              FROM bundle_generations bg
              WHERE bg.project_id = $1::uuid
                AND bg.bundle_type = 'failure'
                AND bg.created_at >= $2::timestamptz
                AND bg.created_at < $3::timestamptz
            ), 0) AS failure_bundles,
            COALESCE((
              SELECT COUNT(*)::integer
              FROM bundle_generations bg
              WHERE bg.project_id = $1::uuid
                AND bg.bundle_type = 'improvement'
                AND bg.created_at >= $2::timestamptz
                AND bg.created_at < $3::timestamptz
            ), 0) AS improvement_bundles,
            COALESCE((
              SELECT COUNT(*)::integer
              FROM incidents i
              WHERE i.project_id = $1::uuid
                AND i.first_seen_at >= $2::timestamptz
                AND i.first_seen_at < $3::timestamptz
            ), 0) AS new_incidents,
            COALESCE((
              SELECT COUNT(*)::integer
              FROM incidents i
              WHERE i.project_id = $1::uuid
                AND i.regressed_at IS NOT NULL
                AND i.regressed_at >= $2::timestamptz
                AND i.regressed_at < $3::timestamptz
            ), 0) AS regressions,
            COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'incident_id', top_spikes.incident_id,
                  'title', top_spikes.title,
                  'occurrence_count', top_spikes.occurrence_count,
                  'spike_detected_at', top_spikes.spike_detected_at
                )
                ORDER BY top_spikes.occurrence_count DESC, top_spikes.spike_detected_at DESC, top_spikes.incident_id ASC
              )
              FROM top_spikes
            ), '[]'::jsonb) AS top_spiking_incidents
          FROM activity
          LIMIT 1
        `,
        [input.project_id, input.window_start, input.window_end]
      );

      const row = result.rows[0];
      if (row === undefined) {
        return null;
      }

      return {
        project_id: row.project_id,
        window_start: row.window_start,
        window_end: row.window_end,
        bundle_counts: {
          failure: row.failure_bundles,
          improvement: row.improvement_bundles
        },
        new_incidents: row.new_incidents,
        regressions: row.regressions,
        top_spiking_incidents: row.top_spiking_incidents ?? []
      };
    },

    async upsertIncident(input: UpsertIncidentInput): Promise<UpsertIncidentResult> {
      const serviceId = await getOrCreateServiceId(db, input.project_id, input.service_name, input.environment);

      if (input.event_type === "deploy_metadata" && input.deploy_metadata !== undefined) {
        await upsertDeploymentFromEvent({
          db,
          event_id: input.event_id,
          project_id: input.project_id,
          service_id: serviceId,
          environment: input.environment,
          commit_sha: input.deploy_metadata.commit_sha,
          version: input.deploy_metadata.version,
          branch: input.deploy_metadata.branch,
          deployed_at: input.deploy_metadata.deployed_at
        });
      }

      const matchedFields = input.matched_fields !== undefined && input.matched_fields.length > 0
        ? input.matched_fields
        : ["normalized_message"];
      const existingIncidentResult = await db.query<{ id: string; status: "open" | "resolved" | "regressed" }>(
        `
          SELECT id, status
          FROM incidents
          WHERE project_id = $1
            AND environment = $2
            AND service_id = $3
            AND fingerprint = $4
          LIMIT 1
        `,
        [input.project_id, input.environment, serviceId, input.fingerprint]
      );

      const existingIncident = existingIncidentResult.rows[0] ?? null;
      let duplicateEvent = false;
      let hasEventType = false;
      let hasRequestEvent = false;

      if (existingIncident !== null && existingIncident.id !== undefined) {
        const duplicateResult = await db.query<{ duplicate: boolean }>(
          `
            SELECT EXISTS(
              SELECT 1
              FROM incident_events
              WHERE incident_id = $1
                AND event_id = $2::uuid
            ) AS duplicate
          `,
          [existingIncident.id, input.event_id]
        );

        duplicateEvent = Boolean(duplicateResult.rows[0]?.duplicate);

        if (!duplicateEvent) {
          const eventTypePresenceResult = await db.query<{
            has_event_type: boolean;
            has_request_event: boolean;
          }>(
            `
              SELECT
                EXISTS(
                  SELECT 1
                  FROM incident_events
                  WHERE incident_id = $1
                    AND event_type = $2
                ) AS has_event_type,
                EXISTS(
                  SELECT 1
                  FROM incident_events
                  WHERE incident_id = $1
                    AND event_type = 'request_event'
                ) AS has_request_event
            `,
            [existingIncident.id, input.event_type ?? null]
          );

          hasEventType = Boolean(eventTypePresenceResult.rows[0]?.has_event_type);
          hasRequestEvent = Boolean(eventTypePresenceResult.rows[0]?.has_request_event);
        }
      }

      const newContextTypeAdded =
        existingIncident !== null &&
        existingIncident.id !== undefined &&
        input.event_type !== undefined &&
        !duplicateEvent &&
        !hasEventType;

      const reproductionConfidenceChanged =
        existingIncident !== null &&
        existingIncident.id !== undefined &&
        input.event_type === "request_event" &&
        !duplicateEvent &&
        !hasRequestEvent;

      const regressedNow =
        existingIncident !== null && existingIncident.id !== undefined && existingIncident.status === "resolved" && !duplicateEvent;

      const regressionDeploy = regressedNow
        ? await getRegressionDeployCorrelation({
            db,
            project_id: input.project_id,
            service_id: serviceId,
            environment: input.environment,
            occurred_at: input.occurred_at
          })
        : null;

      const result = await db.query<{
        incident_id: string;
        matched_fields: string[] | null;
        status: "open" | "resolved" | "regressed";
        occurrence_count: number;
      }>(
        `
          INSERT INTO incidents (
            id,
            project_id,
            service_id,
            environment,
            fingerprint,
            fingerprint_version,
            title,
            severity,
            status,
            first_seen_at,
            last_seen_at,
            occurrence_count,
            latest_deployment_id,
            matched_fields,
            created_at,
            updated_at
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            'open',
            $9::timestamptz,
            $9::timestamptz,
            1,
            $10::uuid,
            $11::text[],
            now(),
            now()
          )
          ON CONFLICT (project_id, environment, service_id, fingerprint)
          DO UPDATE SET
            last_seen_at = CASE
              WHEN $12::boolean THEN incidents.last_seen_at
              ELSE EXCLUDED.last_seen_at
            END,
            occurrence_count = incidents.occurrence_count + CASE
              WHEN $12::boolean THEN 0
              ELSE 1
            END,
            status = CASE
              WHEN incidents.status = 'resolved' AND NOT $12::boolean THEN 'regressed'
              ELSE incidents.status
            END,
            regressed_at = CASE
              WHEN incidents.status = 'resolved' AND NOT $12::boolean THEN EXCLUDED.last_seen_at
              ELSE incidents.regressed_at
            END,
            latest_deployment_id = CASE
              WHEN incidents.status = 'resolved' AND NOT $12::boolean AND $10::uuid IS NOT NULL THEN $10::uuid
              ELSE incidents.latest_deployment_id
            END,
            matched_fields = EXCLUDED.matched_fields,
            updated_at = now()
          RETURNING
            id AS incident_id,
            matched_fields,
            status,
            occurrence_count
        `,
        [
          randomUUID(),
          input.project_id,
          serviceId,
          input.environment,
          input.fingerprint,
          input.fingerprint_version,
          input.title,
          input.severity,
          input.occurred_at,
          regressionDeploy?.deployment_id ?? null,
          matchedFields,
          duplicateEvent
        ]
      );

      const row = result.rows[0];
      if (row === undefined) {
        throw new Error("incident_upsert_failed");
      }

      return {
        incident_id: row.incident_id,
        matched_fields: row.matched_fields ?? [],
        status: row.status,
        regressed_now: regressedNow,
        occurrence_count: row.occurrence_count,
        duplicate_event: duplicateEvent,
        ...(newContextTypeAdded ? { new_context_type_added: true } : {}),
        ...(reproductionConfidenceChanged ? { reproduction_confidence_changed: true } : {}),
        regression_deploy: regressionDeploy
      };
    },

    async insertIncidentEvent(input: InsertIncidentEventInput): Promise<void> {
      await db.query(
        `
          INSERT INTO incident_events (incident_id, event_id, event_type, event_class, occurred_at, is_sampled, level)
          VALUES ($1, $2, $3, $4, $5::timestamptz, $6, $7)
          ON CONFLICT (incident_id, event_id) DO NOTHING
        `,
        [input.incident_id, input.event_id, input.event_type, input.event_class ?? "context_signal", input.occurred_at, input.is_sampled, input.level ?? null]
      );
    },

    async recordIncidentEventRetention(
      input: RecordIncidentEventRetentionInput
    ): Promise<RecordIncidentEventRetentionResult> {
      await db.query("BEGIN", []);

      try {
        const demotedEventReferences = new Map<string, DemotedIncidentEventReference>();
        const retainFirst = input.occurrence_count === 1;
        const retainDeployMetadata = input.event_type === "deploy_metadata";
        const severityRank = severityToRank(input.severity);

        let retainAfterDeploy = false;
        if (!retainDeployMetadata) {
          const latestDeploymentResult = await db.query<{
            deployment_id: string;
            deployed_at: string;
          }>(
            `
              SELECT
                d.id::text AS deployment_id,
                d.deployed_at::text AS deployed_at
              FROM incidents i
              JOIN deployments d
                ON d.project_id = i.project_id
               AND d.service_id = i.service_id
               AND d.environment = i.environment
              WHERE i.id = $1
                AND d.deployed_at <= $2::timestamptz
              ORDER BY d.deployed_at DESC
              LIMIT 1
            `,
            [input.incident_id, input.occurred_at]
          );

          const latestDeployment = latestDeploymentResult.rows[0] ?? null;
          if (latestDeployment !== null) {
            const priorOccurrenceResult = await db.query<{ has_prior_occurrence: boolean }>(
              `
                SELECT EXISTS(
                  SELECT 1
                  FROM incident_events ie
                  WHERE ie.incident_id = $1
                    AND ie.event_id <> $2::uuid
                    AND ie.event_type <> 'deploy_metadata'
                    AND ie.occurred_at >= $3::timestamptz
                ) AS has_prior_occurrence
              `,
              [input.incident_id, input.event_id, latestDeployment.deployed_at]
            );

            retainAfterDeploy = !Boolean(priorOccurrenceResult.rows[0]?.has_prior_occurrence);
          }
        }

        const currentHighestSeverityResult = await db.query<{ max_rank: number | null }>(
          `
            SELECT MAX(severity_rank) AS max_rank
            FROM incident_events
            WHERE incident_id = $1
          `,
          [input.incident_id]
        );

        const currentHighestSeverityRank = currentHighestSeverityResult.rows[0]?.max_rank ?? null;
        const retainHighestSeverity = currentHighestSeverityRank === null || severityRank > currentHighestSeverityRank;

        const clearedLatestResult = await db.query<{ event_id: string; occurred_at: string; is_sampled: boolean }>(
          `
            UPDATE incident_events
            SET retain_latest = false,
                is_sampled = retain_first OR retain_after_deploy OR retain_highest_severity OR retain_deploy_metadata
            WHERE incident_id = $1
              AND retain_latest = true
            RETURNING event_id::text AS event_id, occurred_at::text AS occurred_at, is_sampled
          `,
          [input.incident_id]
        );

        collectDemotedIncidentEvents(demotedEventReferences, clearedLatestResult.rows);

        if (retainHighestSeverity) {
          const clearedHighestSeverityResult = await db.query<{ event_id: string; occurred_at: string; is_sampled: boolean }>(
            `
              UPDATE incident_events
              SET retain_highest_severity = false,
                  is_sampled = retain_first OR retain_latest OR retain_after_deploy OR retain_deploy_metadata
              WHERE incident_id = $1
                AND retain_highest_severity = true
              RETURNING event_id::text AS event_id, occurred_at::text AS occurred_at, is_sampled
            `,
            [input.incident_id]
          );

          collectDemotedIncidentEvents(demotedEventReferences, clearedHighestSeverityResult.rows);
        }

        const insertedResult = await db.query<{ is_sampled: boolean }>(
          `
            INSERT INTO incident_events (
              incident_id,
              event_id,
              event_type,
              event_class,
              occurred_at,
              is_sampled,
              level,
              retain_first,
              retain_latest,
              retain_after_deploy,
              retain_highest_severity,
              retain_deploy_metadata,
              severity_rank
            )
            VALUES (
              $1,
              $2,
              $3,
              $4,
              $5::timestamptz,
              true,
              $6,
              $7,
              true,
              $8,
              $9,
              $10,
              $11
            )
            ON CONFLICT (incident_id, event_id)
            DO UPDATE SET
              event_type = EXCLUDED.event_type,
              occurred_at = EXCLUDED.occurred_at,
              is_sampled = incident_events.is_sampled OR EXCLUDED.is_sampled,
              level = COALESCE(EXCLUDED.level, incident_events.level),
              retain_first = incident_events.retain_first OR EXCLUDED.retain_first,
              retain_latest = incident_events.retain_latest OR EXCLUDED.retain_latest,
              retain_after_deploy = incident_events.retain_after_deploy OR EXCLUDED.retain_after_deploy,
              retain_highest_severity = incident_events.retain_highest_severity OR EXCLUDED.retain_highest_severity,
              retain_deploy_metadata = incident_events.retain_deploy_metadata OR EXCLUDED.retain_deploy_metadata,
              severity_rank = GREATEST(incident_events.severity_rank, EXCLUDED.severity_rank)
            RETURNING is_sampled
          `,
          [
            input.incident_id,
            input.event_id,
            input.event_type,
            input.event_class ?? "context_signal",
            input.occurred_at,
            input.level ?? null,
            retainFirst,
            retainAfterDeploy,
            retainHighestSeverity,
            retainDeployMetadata,
            severityRank
          ]
        );

        await db.query("COMMIT", []);

        return {
          is_sampled: Boolean(insertedResult.rows[0]?.is_sampled),
          demoted_event_references: [...demotedEventReferences.values()].sort((left, right) => {
            if (left.occurred_at === right.occurred_at) {
              return left.event_id.localeCompare(right.event_id);
            }
            return left.occurred_at.localeCompare(right.occurred_at);
          })
        };
      } catch (error) {
        await db.query("ROLLBACK", []).catch(() => {});
        throw error;
      }
    },

    async markIncidentSpiking(input: MarkIncidentSpikingInput): Promise<boolean> {
      const result = await db.query(
        `
          UPDATE incidents
          SET spike_detected_at = $2::timestamptz,
              updated_at = now()
          WHERE id = $1
            AND spike_detected_at IS NULL
        `,
        [input.incident_id, input.detected_at]
      );

      return (result.rowCount ?? 0) > 0;
    }
  };
}
