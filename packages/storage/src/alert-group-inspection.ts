import type { Queryable } from "./types.js";

export type AlertGroupKind = "direct" | "email_digest";

export interface AlertGroupCursor {
  created_at: string;
  id: string;
}

export interface AlertGroupSummary {
  group_id: string;
  kind: AlertGroupKind;
  project_id: string;
  alert_id: string | null;
  root_incident_id: string | null;
  channel: "email" | "slack" | "discord" | "webhook";
  status: "pending" | "delivered" | "failed";
  member_count: number;
  created_at: string;
  delivered_at: string | null;
}

export interface AlertGroupMember {
  incident_id: string;
  condition_type: string;
  created_at: string;
}

interface AlertGroupScope {
  organization_id: string;
  project_id: string;
  authorized_origin_ids?: readonly string[];
}

export interface AlertGroupInspectionStore {
  listGroupsForOrganization(
    input: AlertGroupScope & {
      limit: number;
      before?: AlertGroupCursor;
    }
  ): Promise<{ groups: AlertGroupSummary[]; next_cursor: AlertGroupCursor | null } | null>;
  getGroupForOrganization(
    input: AlertGroupScope & {
      kind: AlertGroupKind;
      group_id: string;
      limit: number;
      after?: AlertGroupCursor;
    }
  ): Promise<{
    group: AlertGroupSummary;
    members: AlertGroupMember[];
    next_cursor: AlertGroupCursor | null;
  } | null>;
}

type GroupRow = Omit<AlertGroupSummary, "member_count"> & { member_count: string | number };
type MemberRow = AlertGroupMember & { id: string } & Record<string, unknown>;

function boundedLimit(limit: number): number {
  return Number.isInteger(limit) ? Math.max(1, Math.min(100, limit)) : 50;
}

function mapGroup(row: GroupRow): AlertGroupSummary {
  return { ...row, member_count: Number(row.member_count) };
}

// Retained views use their frozen origin closure. The authorized snapshot prevents an
// in-flight consolidation from widening a request after API token authorization.
const SCOPED_GROUPS = `
  WITH visible_origins AS MATERIALIZED (
    SELECT origin.id FROM projects requested
    JOIN projects origin ON origin.organization_id = requested.organization_id
      AND origin.id = ANY(debugbundle_project_origins(requested.id))
    WHERE requested.id = $1::uuid AND requested.organization_id = $2::uuid
      AND ($3::uuid[] IS NULL OR origin.id = ANY($3::uuid[]))
  ), scoped_groups AS (
    SELECT d.id AS group_id, 'direct'::text AS kind, d.project_id,
      CASE WHEN scoped_rule.project_id IN (SELECT id FROM visible_origins) THEN d.alert_id END AS alert_id,
      d.incident_id AS root_incident_id, d.channel, d.status, d.created_at, d.delivered_at
    FROM alert_deliveries d
    JOIN visible_origins origin ON origin.id = d.project_id
    JOIN alert_rules scoped_rule ON scoped_rule.id = d.alert_id
      AND debugbundle_canonical_project(scoped_rule.project_id) = debugbundle_canonical_project(d.project_id)
    JOIN incidents root ON root.id = d.incident_id AND root.project_id = d.project_id
    UNION ALL
    SELECT e.id AS group_id, 'email_digest'::text, e.project_id,
      NULL::uuid, NULL::uuid, 'email'::text, e.status, e.created_at, e.delivered_at
    FROM alert_email_digests e
    JOIN visible_origins origin ON origin.id = e.project_id
  )
`;

// The delivery origin owns its members. A rule may have been created in a
// different origin of the same project without widening the member's read view.
const GROUP_MEMBERS = `
  SELECT m.id, m.incident_id, m.condition_type, m.created_at
  FROM alert_delivery_members m
  LEFT JOIN incidents linked ON linked.id = m.incident_id
  WHERE g.kind = 'direct' AND m.delivery_id = g.group_id
    AND (linked.id IS NULL OR linked.project_id = g.project_id)
  UNION ALL
  SELECT g.group_id, g.root_incident_id, 'legacy'::text, g.created_at
  WHERE g.kind = 'direct' AND NOT EXISTS (
    SELECT 1 FROM alert_delivery_members root_member
    WHERE root_member.delivery_id = g.group_id AND root_member.incident_id = g.root_incident_id
  )
  UNION ALL
  SELECT i.id, i.incident_id, i.condition_type, i.created_at
  FROM alert_email_digest_items i
  JOIN incidents linked ON linked.id = i.incident_id AND linked.project_id = i.project_id
  JOIN alert_rules scoped_rule ON scoped_rule.id = i.alert_id
    AND debugbundle_canonical_project(scoped_rule.project_id) = debugbundle_canonical_project(i.project_id)
  WHERE g.kind = 'email_digest' AND i.digest_id = g.group_id AND i.project_id = g.project_id
`;

const GROUP_PROJECTION = `
  g.group_id::text, g.kind, g.project_id::text, g.alert_id::text, g.root_incident_id::text,
  g.channel, g.status, g.created_at::text, g.delivered_at::text,
  (SELECT count(DISTINCT incident_id) FROM (${GROUP_MEMBERS}) AS members)::text AS member_count
`;

function scopeParams(input: AlertGroupScope): [string, string, readonly string[] | null] {
  return [input.project_id, input.organization_id, input.authorized_origin_ids ?? null];
}

export function createPostgresAlertGroupInspectionStore(db: Queryable): AlertGroupInspectionStore {
  return {
    async listGroupsForOrganization(input) {
      const authorized = await db.query<{ allowed: boolean }>(
        `
        SELECT EXISTS (
          SELECT 1 FROM projects WHERE id = $1::uuid AND organization_id = $2::uuid
        ) AS allowed
      `,
        [input.project_id, input.organization_id]
      );
      if (authorized.rows[0]?.allowed !== true) return null;

      const limit = boundedLimit(input.limit);
      const result = await db.query<GroupRow>(
        `
        ${SCOPED_GROUPS}, page AS (
          SELECT * FROM scoped_groups
          WHERE $4::timestamptz IS NULL OR (created_at, group_id) < ($4::timestamptz, $5::uuid)
          ORDER BY created_at DESC, group_id DESC LIMIT $6
        )
        SELECT ${GROUP_PROJECTION}
        FROM page g ORDER BY g.created_at DESC, g.group_id DESC
      `,
        [
          ...scopeParams(input),
          input.before?.created_at ?? null,
          input.before?.id ?? null,
          limit + 1
        ]
      );
      const groups = result.rows.slice(0, limit).map(mapGroup);
      const last = groups.at(-1);
      return {
        groups,
        next_cursor:
          result.rows.length > limit && last !== undefined
            ? { created_at: last.created_at, id: last.group_id }
            : null
      };
    },

    async getGroupForOrganization(input) {
      const params = [...scopeParams(input), input.group_id, input.kind];
      const groupResult = await db.query<GroupRow>(
        `
        ${SCOPED_GROUPS}
        SELECT ${GROUP_PROJECTION}
        FROM scoped_groups g WHERE g.group_id = $4::uuid AND g.kind = $5
      `,
        params
      );
      const row = groupResult.rows[0];
      if (row === undefined) return null;
      const group = mapGroup(row);
      const limit = boundedLimit(input.limit);
      const membersResult = await db.query<MemberRow>(
        `
        ${SCOPED_GROUPS}
        SELECT m.id::text, m.incident_id::text, m.condition_type, m.created_at::text
        FROM scoped_groups g
        CROSS JOIN LATERAL (${GROUP_MEMBERS}) m
        WHERE g.group_id = $4::uuid AND g.kind = $5
          AND ($6::timestamptz IS NULL OR (m.created_at, m.id) > ($6::timestamptz, $7::uuid))
        ORDER BY m.created_at ASC, m.id ASC LIMIT $8
      `,
        [...params, input.after?.created_at ?? null, input.after?.id ?? null, limit + 1]
      );
      const page = membersResult.rows.slice(0, limit);
      const last = page.at(-1);
      return {
        group,
        members: page.map(({ incident_id, condition_type, created_at }) => ({
          incident_id,
          condition_type,
          created_at
        })),
        next_cursor:
          membersResult.rows.length > limit && last !== undefined
            ? { created_at: last.created_at, id: last.id }
            : null
      };
    }
  };
}
