import { z } from "zod";
import {
  AcceptedReportScopeSchema,
  ReportProjectIdsSchema,
  ReportRecipientIdsSchema,
  type AcceptedReportScope
} from "../../smart-reports/src/report-definition.js";
import { SmartReportError } from "../../smart-reports/src/report-errors.js";
import {
  captureProjectJobAuthority,
  isProjectJobInitiatorAuthorized,
  ProjectJobInitiatorSchema,
  type ProjectJobInitiator
} from "./project-job-authorization.js";
import type { Queryable } from "./types.js";

const ScopeActorSchema = z
  .object({
    organization_id: z.uuid(),
    scope: AcceptedReportScopeSchema,
    initiator: ProjectJobInitiatorSchema,
    manage: z.boolean()
  })
  .strict();
async function verified(db: Queryable, userId: string): Promise<boolean> {
  return (
    (
      await db.query("SELECT id FROM users WHERE id=$1::uuid AND email_verified_at IS NOT NULL", [
        userId
      ])
    ).rows.length === 1
  );
}
async function projectInOrganization(
  db: Queryable,
  projectId: string,
  organizationId: string
): Promise<string | null> {
  const row = (
    await db.query<{ project_id: string }>(
      `SELECT p.id AS project_id FROM projects p JOIN organizations o ON o.id=p.organization_id
    WHERE p.id=debugbundle_canonical_project($1::uuid) AND p.organization_id=$2::uuid AND o.suspended_at IS NULL`,
      [projectId, organizationId]
    )
  ).rows[0];
  return row?.project_id ?? null;
}
/** Admission resolves a fresh explicit origin set and requires administration,
 * including credential permission. It never adopts an organisation Owner identity. */
export async function captureReportScope(
  db: Queryable,
  raw: { organization_id: string; project_ids: string[]; initiator: ProjectJobInitiator }
): Promise<AcceptedReportScope> {
  const input = z
    .object({
      organization_id: z.uuid(),
      project_ids: ReportProjectIdsSchema,
      initiator: ProjectJobInitiatorSchema
    })
    .strict()
    .parse(raw);
  if (!(await verified(db, input.initiator.user_id)))
    throw new SmartReportError("email_verification_required");
  const scope: AcceptedReportScope = [];
  for (const requested of input.project_ids) {
    const projectId = await projectInOrganization(db, requested, input.organization_id);
    if (projectId === null) throw new SmartReportError("invalid_report_scope");
    const authority = await captureProjectJobAuthority(db, {
      project_id: projectId,
      initiator: input.initiator,
      action: "manage_settings"
    });
    if (!authority?.scope_origin_ids) throw new SmartReportError("forbidden");
    scope.push({
      project_id: projectId,
      origin_project_ids: [...authority.scope_origin_ids].sort()
    });
  }
  const accepted = AcceptedReportScopeSchema.safeParse(scope);
  if (!accepted.success) throw new SmartReportError("invalid_report_scope");
  return accepted.data.sort((a, b) => a.project_id.localeCompare(b.project_id));
}
/** Stored scopes are checked as a whole, without expanding them after merges.
 * Infrastructure errors propagate for retry; they do not become permanent access loss. */
export async function canAccessReportScope(
  db: Queryable,
  raw: { organization_id: string; scope: unknown; initiator: unknown; manage: boolean }
): Promise<boolean> {
  const parsed = ScopeActorSchema.safeParse(raw);
  if (!parsed.success) return false;
  const input = parsed.data;
  if (input.manage && !(await verified(db, input.initiator.user_id))) return false;
  for (const project of input.scope) {
    if ((await projectInOrganization(db, project.project_id, input.organization_id)) === null)
      return false;
    if (
      !(await isProjectJobInitiatorAuthorized(db, {
        project_id: project.project_id,
        origin_project_ids: project.origin_project_ids,
        initiator: input.initiator,
        action: input.manage ? "manage_settings" : "read"
      }))
    )
      return false;
  }
  return true;
}
/** Recipients are verified human identities, not arbitrary email destinations.
 * Project viewers may receive a report only when they can read every saved origin. */
export async function requireReportRecipients(
  db: Queryable,
  raw: { organization_id: string; scope: AcceptedReportScope; user_ids: string[] }
): Promise<void> {
  const input = z
    .object({
      organization_id: z.uuid(),
      scope: AcceptedReportScopeSchema,
      user_ids: ReportRecipientIdsSchema
    })
    .strict()
    .parse(raw);
  for (const userId of input.user_ids) {
    if (
      !(await verified(db, userId)) ||
      !(await canAccessReportScope(db, {
        organization_id: input.organization_id,
        scope: input.scope,
        initiator: { version: 1, kind: "browser_session", user_id: userId },
        manage: false
      }))
    )
      throw new SmartReportError("invalid_report_recipient");
  }
}
