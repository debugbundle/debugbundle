import type { ResolveMemberResult } from "../../../packages/storage/src/index.js";
import type { ProjectJobInitiator } from "../../../packages/storage/src/project-job-authorization.js";

export function memberJobInitiator(member: ResolveMemberResult): ProjectJobInitiator | undefined {
  if (member.credential_kind === "browser_session")
    return { version: 1, kind: "browser_session", user_id: member.member_id };
  if (member.token_id !== undefined)
    return {
      version: 1,
      kind: "member_token",
      user_id: member.member_id,
      token_id: member.token_id
    };
  if (member.token_policy !== undefined) throw new Error("scoped_credential_identity_missing");
  return undefined;
}

export function memberJobRequest(member: ResolveMemberResult): {
  initiating_authority?: ProjectJobInitiator;
} {
  const initiator = memberJobInitiator(member);
  return initiator === undefined ? {} : { initiating_authority: initiator };
}

/** Trusted request principal only: clients cannot submit these fields as query scope. */
export function memberReadScope(member: ResolveMemberResult): {
  include_organization_grants?: boolean;
  origin_project_ids?: string[];
  organization_scope_id?: string;
} {
  const inherited =
    member.credential_kind === "browser_session" || member.token_policy !== undefined;
  const policy = member.token_policy;
  if (policy === undefined) return inherited ? { include_organization_grants: true } : {};
  if (policy.mode === "organization")
    return { include_organization_grants: true, organization_scope_id: policy.organization_id };
  return {
    include_organization_grants: true,
    origin_project_ids: [
      ...new Set(policy.projects.flatMap((project) => project.origin_project_ids))
    ]
  };
}
