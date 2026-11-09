import { z } from "zod";
import { isSelfHostMode, ProjectRoleSchema } from "../../shared-types/src/index.js";
import { canPerformProjectAction } from "../../auth/src/project-authorization.js";
import {
  OPENAI_CIMD_CLIENT_ID,
  OPENAI_MCP_RESOURCE
} from "../../auth/src/openai-oauth-constants.js";
import { AcceptedReportScopeSchema } from "../../smart-reports/src/report-definition.js";
import { ProjectJobInitiatorSchema } from "./project-job-authorization.js";
import { canAccessReportScope } from "./report-authorization.js";
import { isOpenAiOAuthGrantActive } from "./openai-oauth-store.js";
import type { Queryable } from "./types.js";

/** OAuth readers stay distinct from browser sessions/member credentials and
 * never become report initiators, recipients or durable job authorities. */
export const ReportReadInitiatorSchema = z.union([
  ProjectJobInitiatorSchema,
  z
    .object({
      version: z.literal(1),
      kind: z.literal("openai_oauth"),
      user_id: z.uuid(),
      grant_id: z.uuid(),
      organization_id: z.uuid()
    })
    .strict()
]);
export type ReportReadInitiator = z.infer<typeof ReportReadInitiatorSchema>;
export async function canReadReportScope(
  db: Queryable,
  raw: { organization_id: string; scope: unknown; initiator: unknown }
): Promise<boolean> {
  const parsed = z
    .object({
      organization_id: z.uuid(),
      scope: AcceptedReportScopeSchema,
      initiator: ReportReadInitiatorSchema
    })
    .strict()
    .safeParse(raw);
  if (!parsed.success) return false;
  const { organization_id, scope, initiator } = parsed.data;
  if (initiator.kind !== "openai_oauth")
    return canAccessReportScope(db, { organization_id, scope, initiator, manage: false });
  if (initiator.organization_id !== organization_id) return false;
  const grant = {
    grantId: initiator.grant_id,
    userId: initiator.user_id,
    organizationId: organization_id,
    clientId: OPENAI_CIMD_CLIENT_ID,
    resource: OPENAI_MCP_RESOURCE,
    scopes: ["debugbundle:reports:read"]
  };
  if (!(await isOpenAiOAuthGrantActive(db, grant))) return false;
  for (const project of scope) {
    const result = await db.query<{ role: string | null; origins_valid: boolean }>(
      `SELECT debugbundle_project_actor_role(p.id,$2::uuid,true,$5::boolean) AS role,
      ($4::uuid[] <@ debugbundle_project_origins(p.id)) AS origins_valid FROM projects p
      JOIN organizations o ON o.id=p.organization_id WHERE p.id=debugbundle_canonical_project($1::uuid)
      AND p.organization_id=$3::uuid AND o.suspended_at IS NULL`,
      [
        project.project_id,
        initiator.user_id,
        organization_id,
        project.origin_project_ids,
        isSelfHostMode()
      ]
    );
    const row = result.rows[0],
      role = ProjectRoleSchema.safeParse(row?.role);
    if (!row?.origins_valid || !role.success || !canPerformProjectAction(role.data, "read"))
      return false;
  }
  return isOpenAiOAuthGrantActive(db, grant);
}
