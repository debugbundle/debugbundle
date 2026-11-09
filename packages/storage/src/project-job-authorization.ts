import { z } from "zod";
import {
  canPerformProjectAction,
  tokenAllowsProject
} from "../../auth/src/project-authorization.js";
import {
  isSelfHostMode,
  MemberTokenPolicySchema,
  ProjectRoleSchema
} from "../../shared-types/src/index.js";
import type { Queryable } from "./types.js";
export const PROJECT_JOB_AUTHORITY_PROTOCOL = "project-initiator-v1";

export const ProjectJobInitiatorSchema = z.discriminatedUnion("kind", [
  z
    .object({ version: z.literal(1), kind: z.literal("browser_session"), user_id: z.uuid() })
    .strict(),
  z
    .object({
      version: z.literal(1),
      kind: z.literal("member_token"),
      user_id: z.uuid(),
      token_id: z.uuid()
    })
    .strict()
]);
export type ProjectJobInitiator = z.infer<typeof ProjectJobInitiatorSchema>;
export interface ProjectJobRequestAuthority {
  initiating_authority?: ProjectJobInitiator;
  scope_origin_ids?: string[];
}
export type ProjectJobAction = "read" | "write" | "manage_settings";
export interface ProjectJobAuthorization {
  isAuthorized(input: {
    project_id: string;
    origin_project_ids: string[];
    initiator: unknown;
    action?: ProjectJobAction;
    require_current_full_scope?: boolean;
  }): Promise<boolean>;
}

export async function captureProjectJobAuthority(
  db: Queryable,
  input: { project_id: string; initiator: ProjectJobInitiator; action?: ProjectJobAction }
): Promise<ProjectJobRequestAuthority | null> {
  const result = await db.query<{ origins: string[] }>(
    "SELECT debugbundle_project_origins(debugbundle_canonical_project($1::uuid))::text[] AS origins",
    [input.project_id]
  );
  const origins = result.rows[0]?.origins;
  if (
    origins === undefined ||
    !(await isProjectJobInitiatorAuthorized(db, {
      project_id: input.project_id,
      origin_project_ids: origins,
      initiator: input.initiator,
      action: input.action ?? "read",
      require_current_full_scope: true
    }))
  )
    return null;
  return { initiating_authority: input.initiator, scope_origin_ids: origins };
}

/** New user-initiated work keeps the credential identity, never its secret.
 * Old persisted jobs without an initiator retain their existing execution path. */
export async function isProjectJobInitiatorAuthorized(
  db: Queryable,
  input: {
    project_id: string;
    origin_project_ids: string[];
    initiator: unknown;
    action?: ProjectJobAction;
    require_current_full_scope?: boolean;
  }
): Promise<boolean> {
  const parsed = ProjectJobInitiatorSchema.safeParse(input.initiator);
  const origins = z.array(z.uuid()).min(1).max(1000).safeParse(input.origin_project_ids);
  if (!parsed.success || !origins.success || !z.uuid().safeParse(input.project_id).success)
    return false;
  const initiator = parsed.data;
  let policy: z.infer<typeof MemberTokenPolicySchema> | undefined;
  let inherited = initiator.kind === "browser_session";
  if (initiator.kind === "member_token") {
    const token = await db.query<{ scope_policy: unknown }>(
      `SELECT mt.scope_policy FROM member_tokens mt
      JOIN organization_members om ON om.organization_id=mt.organization_id AND om.user_id=mt.user_id
      JOIN organizations issuing_org ON issuing_org.id=mt.organization_id
      WHERE mt.id=$1::uuid AND mt.user_id=$2::uuid AND mt.revoked_at IS NULL
        AND (mt.expires_at IS NULL OR mt.expires_at>now())
        AND om.suspended_at IS NULL AND issuing_org.suspended_at IS NULL`,
      [initiator.token_id, initiator.user_id]
    );
    if (token.rows[0] === undefined) return false;
    const stored = token.rows[0].scope_policy;
    if (stored !== null) {
      const value = MemberTokenPolicySchema.safeParse(stored);
      if (!value.success) return false;
      policy = value.data;
      inherited = true;
    }
  }
  const result = await db.query<{
    organization_id: string;
    role: string | null;
    origins_valid: boolean;
  }>(
    `SELECT p.organization_id,
    debugbundle_project_actor_role(p.id,$2::uuid,$3::boolean,$4::boolean) AS role,
    ($5::uuid[] <@ debugbundle_project_origins(p.id) AND (NOT $6::boolean OR debugbundle_project_origins(p.id) <@ $5::uuid[])) AS origins_valid
    FROM projects p JOIN organizations o ON o.id=p.organization_id
    WHERE p.id=debugbundle_canonical_project($1::uuid) AND o.suspended_at IS NULL`,
    [
      input.project_id,
      initiator.user_id,
      inherited,
      isSelfHostMode(),
      input.origin_project_ids,
      input.require_current_full_scope ?? false
    ]
  );
  const row = result.rows[0];
  if (row === undefined || !row.origins_valid) return false;
  const role = ProjectRoleSchema.safeParse(row.role);
  return (
    role.success &&
    canPerformProjectAction(role.data, input.action ?? "write") &&
    tokenAllowsProject(policy, {
      project_id: input.project_id,
      organization_id: row.organization_id,
      origin_project_ids: input.origin_project_ids,
      action: input.action ?? "write"
    })
  );
}
