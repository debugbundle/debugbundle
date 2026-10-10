import { randomBytes, randomUUID } from "node:crypto";
import {
  PublicStatusSettingsSchema,
  type PublicStatusPage,
  type PublicStatusSettings,
  type PublicStatusOptions,
  type PublicStatusOptionsQuery
} from "../../shared-types/src/public-status.js";
import { buildAvailabilityChecksListQuery } from "./availability-check-store-queries.js";
import { mapAvailabilityCheckRow } from "./availability-check-store-helpers.js";
import {
  projectPublicStatus,
  sanitizePublicStatusText,
  type PublicStatusSource
} from "./public-status-projection.js";
import { runInTransaction } from "./transaction.js";
import type { Queryable } from "./types.js";

type Scope = { project_id: string; organization_id: string; owner_user_id: string };
type StoredSettings = { public_id: string | null; settings: PublicStatusSettings };
export interface PublicStatusPageStore {
  getSettings(scope: Scope): Promise<StoredSettings>;
  saveSettings(scope: Scope, input: PublicStatusSettings): Promise<StoredSettings>;
  listOptions(scope: Scope, query?: PublicStatusOptionsQuery): Promise<PublicStatusOptions>;
  getPublicPage(publicId: string): Promise<PublicStatusPage | null>;
  preview(scope: Scope): Promise<PublicStatusPage | null>;
}
type PageRow = { id: string; public_id: string; title: string; enabled: boolean } & Record<
  string,
  unknown
>;
export class PublicStatusError extends Error {
  constructor(public readonly code: "not_found" | "invalid_selection") {
    super(code);
  }
}
async function ownedAnchor(db: Queryable, scope: Scope): Promise<string> {
  const result = await db.query<{ name: string }>(
    `SELECT name FROM projects WHERE id=$1::uuid AND organization_id=$2::uuid AND owner_user_id=$3::uuid`,
    [scope.project_id, scope.organization_id, scope.owner_user_id]
  );
  if (!result.rows[0]) throw new PublicStatusError("not_found");
  return result.rows[0].name;
}
async function pageRow(db: Queryable, scope: Scope): Promise<PageRow | undefined> {
  return (
    await db.query<PageRow>(
      `SELECT id::text,public_id,title,enabled FROM public_status_pages WHERE anchor_project_id=$1::uuid AND organization_id=$2::uuid AND owner_user_id=$3::uuid`,
      [scope.project_id, scope.organization_id, scope.owner_user_id]
    )
  ).rows[0];
}
async function settings(db: Queryable, scope: Scope): Promise<StoredSettings> {
  const name = await ownedAnchor(db, scope);
  const page = await pageRow(db, scope);
  if (!page)
    return {
      public_id: null,
      settings: {
        title: `${name} status`.slice(0, 120),
        enabled: false,
        projects: [{ project_id: scope.project_id, check_ids: [] }]
      } satisfies PublicStatusSettings
    };
  const rows = await db.query<{ project_id: string; check_ids: string[] }>(
    `SELECT pp.project_id::text,
    COALESCE(array_agg(pc.check_id::text ORDER BY pc.check_id) FILTER (WHERE c.id IS NOT NULL), ARRAY[]::text[]) AS check_ids
    FROM public_status_page_projects pp JOIN projects p ON p.id=pp.project_id
    LEFT JOIN public_status_page_checks pc ON pc.page_id=pp.page_id AND pc.project_id=pp.project_id
    LEFT JOIN availability_checks c ON c.id=pc.check_id AND c.project_id=p.id AND c.deleted_at IS NULL
    WHERE pp.page_id=$1::uuid AND p.organization_id=$2::uuid AND p.owner_user_id=$3::uuid
    GROUP BY pp.project_id,pp.position ORDER BY pp.position`,
    [page.id, scope.organization_id, scope.owner_user_id]
  );
  // Deleted/reassigned checks stop publishing immediately. Keep the anchor in management even if empty.
  const projects = rows.rows;
  if (!projects.some((p) => p.project_id === scope.project_id))
    projects.unshift({ project_id: scope.project_id, check_ids: [] });
  return {
    public_id: page.public_id,
    settings: { title: page.title, enabled: page.enabled, projects }
  };
}
async function validateSelection(
  db: Queryable,
  scope: Scope,
  value: PublicStatusSettings
): Promise<void> {
  if (value.projects[0]?.project_id !== scope.project_id)
    throw new PublicStatusError("invalid_selection");
  const ids = value.projects.map((p) => p.project_id);
  // Lock all selected projects, including the anchor, in one global order. Locking each
  // anchor first deadlocks when two pages include one another. Ownership stays stable
  // through commit; NO KEY UPDATE still permits unrelated foreign-key reference reads.
  const projects = await db.query<{ project_id: string }>(
    `SELECT id::text AS project_id FROM projects
    WHERE id=ANY($1::uuid[]) AND organization_id=$2::uuid AND owner_user_id=$3::uuid ORDER BY id FOR NO KEY UPDATE`,
    [ids, scope.organization_id, scope.owner_user_id]
  );
  if (projects.rows.length !== ids.length) throw new PublicStatusError("invalid_selection");
  const requested = value.projects.flatMap((p) =>
    p.check_ids.map((check_id) => ({ check_id, project_id: p.project_id }))
  );
  const checks = await db.query<{ check_id: string; project_id: string }>(
    `SELECT id::text AS check_id,project_id::text FROM availability_checks
    WHERE id=ANY($1::uuid[]) AND deleted_at IS NULL FOR SHARE`,
    [requested.map((c) => c.check_id)]
  );
  if (
    checks.rows.length !== requested.length ||
    requested.some(
      (c) =>
        !checks.rows.some((row) => row.check_id === c.check_id && row.project_id === c.project_id)
    )
  ) {
    throw new PublicStatusError("invalid_selection");
  }
}
const eligibleQuery = buildAvailabilityChecksListQuery(
  "p.organization_id IN (SELECT organization_id FROM page)",
  "c.project_id IN (SELECT project_id FROM public_status_page_projects WHERE page_id IN (SELECT id FROM page)) AND c.id IN (SELECT check_id FROM public_status_page_checks WHERE page_id IN (SELECT id FROM page))",
  "500",
  "NULL"
);
async function source(
  db: Queryable,
  input: { public_id?: string; scope?: Scope }
): Promise<Record<string, unknown>[]> {
  // One statement gives a consistent publication/ownership/check snapshot. No customer write or probe.
  const rows = await db.query<Record<string, unknown>>(
    `WITH page AS (
      SELECT page.* FROM public_status_pages page JOIN projects anchor ON anchor.id=page.anchor_project_id
      WHERE ${input.public_id !== undefined ? "page.public_id=$1 AND page.enabled=true" : "page.anchor_project_id=$1::uuid AND page.owner_user_id=$2::uuid AND page.organization_id=$3::uuid"}
      AND anchor.owner_user_id=page.owner_user_id AND anchor.organization_id=page.organization_id
      AND ($2::uuid IS NULL OR page.owner_user_id=$2::uuid) AND ($3::uuid IS NULL OR page.organization_id=$3::uuid)
    ), eligible AS (${eligibleQuery})
    SELECT page.title,p.id::text AS project_id,p.name AS project_name,eligible.*,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('day',r.day::text,'state',r.state,'total_checks',r.total_checks,
      'successful_checks',r.successful_checks,'failed_checks',r.failed_checks,'degraded_checks',r.degraded_checks,
      'downtime_seconds',r.downtime_seconds,'incident_ids',r.incident_ids,'last_checked_at',r.last_checked_at)
      ORDER BY r.day) FROM availability_check_daily_rollups r WHERE r.check_id=eligible.check_id::uuid
      AND r.project_id=p.id AND r.day >= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date - 29
      AND r.day <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date), '[]'::jsonb) AS rollups
    FROM page LEFT JOIN public_status_page_projects pp ON pp.page_id=page.id
    LEFT JOIN projects p ON p.id=pp.project_id AND p.owner_user_id=page.owner_user_id AND p.organization_id=page.organization_id
    LEFT JOIN public_status_page_checks pc ON pc.page_id=pp.page_id AND pc.project_id=p.id
    LEFT JOIN eligible ON eligible.check_id=pc.check_id::text AND eligible.project_id=p.id::text
    ORDER BY pp.position,eligible.created_at,eligible.check_id`,
    [
      input.public_id ?? input.scope?.project_id,
      input.scope?.owner_user_id ?? null,
      input.scope?.organization_id ?? null
    ]
  );
  // The public path obtains eligible IDs from publication metadata, not caller-controlled project IDs.
  return rows.rows;
}
export function createPublicStatusPageStore(db: Queryable): PublicStatusPageStore {
  return {
    getSettings: (scope: Scope) => settings(db, scope),
    async saveSettings(scope: Scope, input: PublicStatusSettings) {
      const value = PublicStatusSettingsSchema.parse(input);
      if (value.enabled && !value.projects.some((p) => p.check_ids.length > 0))
        throw new PublicStatusError("invalid_selection");
      return runInTransaction(db, async (tx) => {
        await ownedAnchor(tx, scope);
        await validateSelection(tx, scope, value);
        const page = (
          await tx.query<PageRow>(
            `INSERT INTO public_status_pages(id,anchor_project_id,organization_id,owner_user_id,public_id,title,enabled)
          VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7)
          ON CONFLICT(anchor_project_id) DO UPDATE SET title=EXCLUDED.title,enabled=EXCLUDED.enabled,updated_at=now()
          WHERE public_status_pages.owner_user_id=EXCLUDED.owner_user_id AND public_status_pages.organization_id=EXCLUDED.organization_id
          RETURNING id::text,public_id,title,enabled`,
            [
              randomUUID(),
              scope.project_id,
              scope.organization_id,
              scope.owner_user_id,
              randomBytes(12).toString("hex"),
              sanitizePublicStatusText(value.title),
              value.enabled
            ]
          )
        ).rows[0];
        if (!page) throw new PublicStatusError("not_found");
        await tx.query("DELETE FROM public_status_page_projects WHERE page_id=$1::uuid", [page.id]);
        for (const [position, p] of value.projects.entries()) {
          await tx.query(
            "INSERT INTO public_status_page_projects(page_id,project_id,position) VALUES($1::uuid,$2::uuid,$3)",
            [page.id, p.project_id, position]
          );
          await tx.query(
            "INSERT INTO public_status_page_checks(page_id,project_id,check_id) SELECT $1::uuid,$2::uuid,unnest($3::uuid[])",
            [page.id, p.project_id, p.check_ids]
          );
        }
        return settings(tx, scope);
      });
    },
    async listOptions(
      scope: Scope,
      query: PublicStatusOptionsQuery = {}
    ): Promise<PublicStatusOptions> {
      await ownedAnchor(db, scope);
      const rows = await db.query<{
        project_id: string;
        name: string;
        checks: Array<{ check_id: string; name: string }>;
      }>(
        `SELECT p.id::text AS project_id,p.name,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('check_id',c.id::text,'name',c.name) ORDER BY c.id)
        FROM (SELECT id,name FROM availability_checks WHERE project_id=p.id AND deleted_at IS NULL
          AND ($5::uuid IS NULL OR id>$5::uuid) ORDER BY id LIMIT 51) c), '[]'::jsonb) AS checks
        FROM projects p WHERE p.organization_id=$1::uuid AND p.owner_user_id=$2::uuid AND ($3::uuid IS NULL OR p.id>$3::uuid)
          AND ($4::uuid IS NULL OR p.id=$4::uuid)
        ORDER BY p.id LIMIT 51`,
        [
          scope.organization_id,
          scope.owner_user_id,
          query.cursor ?? null,
          query.check_project_id ?? null,
          query.check_cursor ?? null
        ]
      );
      if (query.check_project_id && !rows.rows[0]) throw new PublicStatusError("invalid_selection");
      return {
        projects: rows.rows.slice(0, 50).map((p) => ({
          ...p,
          checks: p.checks.slice(0, 50),
          next_check_cursor: p.checks.length > 50 ? p.checks[49]!.check_id : null
        })),
        next_cursor: rows.rows.length > 50 ? rows.rows[49]!.project_id : null
      };
    },
    async getPublicPage(public_id: string) {
      return readPublicStatus(db, { public_id });
    },
    async preview(scope: Scope) {
      await ownedAnchor(db, scope);
      return readPublicStatus(db, { scope });
    }
  };
}
async function readPublicStatus(
  db: Queryable,
  input: { public_id?: string; scope?: Scope }
): Promise<PublicStatusPage | null> {
  const rows = await source(db, input);
  if (!rows[0]) return null;
  const projects = new Map<string, PublicStatusSource>();
  for (const row of rows) {
    if (
      typeof row["project_id"] !== "string" ||
      typeof row["project_name"] !== "string" ||
      !row["check_id"]
    )
      continue;
    const p = projects.get(row["project_id"]) ?? {
      project_id: row["project_id"],
      name: row["project_name"],
      checks: []
    };
    p.checks.push({
      ...mapAvailabilityCheckRow(row),
      rollups: row["rollups"] as PublicStatusSource["checks"][number]["rollups"]
    });
    projects.set(p.project_id, p);
  }
  return projectPublicStatus(String(rows[0]["title"]), [...projects.values()], new Date());
}
