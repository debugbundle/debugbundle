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

export interface AlertGroupInspectionStore {
  listGroupsForOrganization(input: {
    organization_id: string;
    project_id: string;
    limit: number;
    before?: AlertGroupCursor;
  }): Promise<{ groups: AlertGroupSummary[]; next_cursor: AlertGroupCursor | null } | null>;
  getGroupForOrganization(input: {
    organization_id: string;
    project_id: string;
    kind: AlertGroupKind;
    group_id: string;
    limit: number;
    after?: AlertGroupCursor;
  }): Promise<{
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

export function createPostgresAlertGroupInspectionStore(db: Queryable): AlertGroupInspectionStore {
  return {
    async listGroupsForOrganization(input) {
      const authorized = await db.query<{ allowed: boolean }>(`
        SELECT EXISTS (
          SELECT 1 FROM projects WHERE id = $1::uuid AND organization_id = $2::uuid
        ) AS allowed
      `, [input.project_id, input.organization_id]);
      if (authorized.rows[0]?.allowed !== true) return null;

      const limit = boundedLimit(input.limit);
      const result = await db.query<GroupRow>(`
        WITH candidate AS (
          SELECT d.id AS group_id, 'direct'::text AS kind, d.project_id,
            d.alert_id, d.incident_id AS root_incident_id, d.channel, d.status,
            d.created_at, d.delivered_at
          FROM alert_deliveries d
          JOIN projects p ON p.id = d.project_id
          JOIN alert_rules scoped_rule ON scoped_rule.id = d.alert_id
            AND scoped_rule.project_id = d.project_id
          JOIN incidents root ON root.id = d.incident_id AND root.project_id = d.project_id
          WHERE d.project_id = $1::uuid AND p.organization_id = $5::uuid
          UNION ALL
          SELECT e.id AS group_id, 'email_digest'::text AS kind, e.project_id,
            NULL::uuid AS alert_id, NULL::uuid AS root_incident_id, 'email'::text AS channel,
            e.status, e.created_at, e.delivered_at
          FROM alert_email_digests e JOIN projects p ON p.id = e.project_id
          WHERE e.project_id = $1::uuid AND p.organization_id = $5::uuid
        ), page AS (
          SELECT * FROM candidate
          WHERE $2::timestamptz IS NULL OR (created_at, group_id) < ($2::timestamptz, $3::uuid)
          ORDER BY created_at DESC, group_id DESC
          LIMIT $4
        )
        SELECT page.group_id::text, page.kind, page.project_id::text,
          page.alert_id::text, page.root_incident_id::text, page.channel, page.status,
          page.created_at::text, page.delivered_at::text,
          CASE WHEN page.kind = 'direct' THEN GREATEST(1, (
            SELECT count(DISTINCT m.incident_id) FROM alert_delivery_members m
            LEFT JOIN incidents linked ON linked.id = m.incident_id
            WHERE m.delivery_id = page.group_id
              AND (linked.id IS NULL OR linked.project_id = page.project_id)
          ) + CASE WHEN NOT EXISTS (
            SELECT 1 FROM alert_delivery_members root_member
            WHERE root_member.delivery_id = page.group_id
              AND root_member.incident_id = page.root_incident_id
          ) THEN 1 ELSE 0 END) ELSE (
            SELECT count(DISTINCT i.incident_id)
            FROM alert_email_digest_items i
            JOIN incidents linked ON linked.id = i.incident_id
              AND linked.project_id = page.project_id
            JOIN alert_rules scoped_rule ON scoped_rule.id = i.alert_id
              AND scoped_rule.project_id = page.project_id
            WHERE i.digest_id = page.group_id AND i.project_id = page.project_id
          ) END::text AS member_count
        FROM page ORDER BY page.created_at DESC, page.group_id DESC
      `, [input.project_id, input.before?.created_at ?? null, input.before?.id ?? null, limit + 1, input.organization_id]);
      const groups = result.rows.slice(0, limit).map(mapGroup);
      const last = groups.at(-1);
      return {
        groups,
        next_cursor: result.rows.length > limit && last !== undefined
          ? { created_at: last.created_at, id: last.group_id } : null
      };
    },

    async getGroupForOrganization(input) {
      const direct = input.kind === "direct";
      const groupResult = await db.query<GroupRow>(direct ? `
        SELECT d.id::text AS group_id, 'direct'::text AS kind, d.project_id::text,
          d.alert_id::text, d.incident_id::text AS root_incident_id, d.channel, d.status,
          d.created_at::text, d.delivered_at::text,
          GREATEST(1, (SELECT count(DISTINCT m.incident_id)
            FROM alert_delivery_members m
            LEFT JOIN incidents linked ON linked.id = m.incident_id
            WHERE m.delivery_id = d.id
              AND (linked.id IS NULL OR linked.project_id = d.project_id))
            + CASE WHEN NOT EXISTS (
              SELECT 1 FROM alert_delivery_members root_member
              WHERE root_member.delivery_id = d.id
                AND root_member.incident_id = d.incident_id
            ) THEN 1 ELSE 0 END)::text AS member_count
        FROM alert_deliveries d
        JOIN projects p ON p.id = d.project_id
        JOIN alert_rules scoped_rule ON scoped_rule.id = d.alert_id
          AND scoped_rule.project_id = d.project_id
        JOIN incidents root ON root.id = d.incident_id AND root.project_id = d.project_id
        WHERE d.id = $1::uuid AND d.project_id = $2::uuid AND p.organization_id = $3::uuid
      ` : `
        SELECT e.id::text AS group_id, 'email_digest'::text AS kind, e.project_id::text,
          NULL::text AS alert_id, NULL::text AS root_incident_id, 'email'::text AS channel,
          e.status, e.created_at::text, e.delivered_at::text,
          (SELECT count(DISTINCT i.incident_id)
            FROM alert_email_digest_items i
            JOIN incidents linked ON linked.id = i.incident_id
              AND linked.project_id = e.project_id
            JOIN alert_rules scoped_rule ON scoped_rule.id = i.alert_id
              AND scoped_rule.project_id = e.project_id
            WHERE i.digest_id = e.id AND i.project_id = e.project_id)::text AS member_count
        FROM alert_email_digests e JOIN projects p ON p.id = e.project_id
        WHERE e.id = $1::uuid AND e.project_id = $2::uuid AND p.organization_id = $3::uuid
      `, [input.group_id, input.project_id, input.organization_id]);
      const row = groupResult.rows[0];
      if (row === undefined) return null;
      const group = mapGroup(row);
      const limit = boundedLimit(input.limit);
      const membersResult = await db.query<MemberRow>(direct ? `
        WITH scoped_delivery AS (
          SELECT delivery.* FROM alert_deliveries delivery
          JOIN projects p ON p.id = delivery.project_id AND p.organization_id = $6::uuid
          WHERE delivery.id = $1::uuid AND delivery.project_id = $5::uuid
        ), members AS (
          SELECT m.id, m.incident_id, m.condition_type, m.created_at
          FROM alert_delivery_members m
          JOIN scoped_delivery delivery ON delivery.id = m.delivery_id
          LEFT JOIN incidents linked ON linked.id = m.incident_id
          WHERE linked.id IS NULL OR linked.project_id = $5::uuid
          UNION ALL
          SELECT delivery.id, delivery.incident_id, 'legacy'::text, delivery.created_at
          FROM scoped_delivery delivery
          WHERE NOT EXISTS (
            SELECT 1 FROM alert_delivery_members root_member
            WHERE root_member.delivery_id = delivery.id
              AND root_member.incident_id = delivery.incident_id
          )
        )
        SELECT id::text, incident_id::text, condition_type, created_at::text
        FROM members
        WHERE $2::timestamptz IS NULL OR (created_at, id) > ($2::timestamptz, $3::uuid)
        ORDER BY created_at ASC, id ASC LIMIT $4
      ` : `
        SELECT i.id::text, i.incident_id::text, i.condition_type, i.created_at::text
        FROM alert_email_digest_items i
        JOIN alert_email_digests digest ON digest.id = i.digest_id
          AND digest.project_id = $5::uuid
        JOIN projects p ON p.id = digest.project_id AND p.organization_id = $6::uuid
        JOIN incidents linked ON linked.id = i.incident_id AND linked.project_id = $5::uuid
        JOIN alert_rules scoped_rule ON scoped_rule.id = i.alert_id AND scoped_rule.project_id = $5::uuid
        WHERE i.digest_id = $1::uuid AND i.project_id = $5::uuid
          AND ($2::timestamptz IS NULL OR (i.created_at, i.id) > ($2::timestamptz, $3::uuid))
        ORDER BY i.created_at ASC, i.id ASC LIMIT $4
      `, [input.group_id, input.after?.created_at ?? null, input.after?.id ?? null,
        limit + 1, input.project_id, input.organization_id]);
      const rows = membersResult.rows;
      if (direct && rows.length === 0 && input.after === undefined && group.root_incident_id !== null) {
        // Older installed deliveries predate the additive membership table.
        return { group, members: [{ incident_id: group.root_incident_id, condition_type: "legacy", created_at: group.created_at }], next_cursor: null };
      }
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        group,
        members: page.map(({ incident_id, condition_type, created_at }) => ({ incident_id, condition_type, created_at })),
        next_cursor: rows.length > limit && last !== undefined
          ? { created_at: last.created_at, id: last.id } : null
      };
    }
  };
}
