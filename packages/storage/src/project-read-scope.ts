import { isSelfHostMode } from "../../shared-types/src/index.js";
export interface ProjectReadScope {
  project_id?: string;
  include_organization_grants?: boolean;
  organization_scope_id?: string;
  /** Fixed at credential creation, independent of a project's future merges. */
  origin_project_ids?: string[];
}

export interface ProjectActorReadScope extends ProjectReadScope {
  user_id?: string;
}

export function appendActorProjectReadScope(
  params: unknown[],
  conditions: string[],
  input: ProjectActorReadScope,
  originColumn: string,
  projectColumn: string
): void {
  appendProjectReadScope(params, conditions, input, originColumn);
  if (input.user_id !== undefined) {
    params.push(input.user_id);
    conditions.push(projectActorAllowedSql(projectColumn, `$${params.length}::uuid`, input));
  }
}

export function projectReadScopeSql(
  params: unknown[],
  input: ProjectReadScope,
  originColumn: string
): string {
  const conditions: string[] = [];
  appendProjectReadScope(params, conditions, input, originColumn);
  return conditions.map((condition) => `AND ${condition}`).join("\n");
}

/** Column expressions are static implementation constants, never request text. */
export function appendProjectReadScope(
  params: unknown[],
  conditions: string[],
  input: ProjectReadScope,
  originColumn: string
): number | undefined {
  let projectParameter: number | undefined;
  if (input.project_id !== undefined) {
    params.push(input.project_id);
    projectParameter = params.length;
    conditions.push(`${originColumn}=ANY(debugbundle_project_origins($${params.length}::uuid))`);
  }
  if (input.origin_project_ids !== undefined) {
    if (input.origin_project_ids.length > 1000) throw new Error("project_scope_limit_exceeded");
    params.push(input.origin_project_ids);
    conditions.push(`${originColumn}=ANY($${params.length}::uuid[])`);
  }
  if (input.organization_scope_id !== undefined) {
    params.push(input.organization_scope_id);
    conditions.push(`EXISTS(SELECT 1 FROM projects scope_project
      WHERE scope_project.id=debugbundle_canonical_project(${originColumn})
        AND scope_project.organization_id=$${params.length}::uuid)`);
  }
  return projectParameter;
}

export function appendServiceDefinitionFilter(
  params: unknown[],
  conditions: string[],
  input: ProjectReadScope & { service?: string },
  projectParameter?: number,
  unattributedNameSql?: string
): void {
  if (input.service === undefined) return;
  params.push(input.service);
  const serviceParam = `$${params.length}`;
  // Explicit views retain their own names; global filters use current logical
  // names. Captured names on unattributed records remain literal.
  const unattributed =
    unattributedNameSql === undefined
      ? ""
      : ` OR (sd.id IS NULL AND ${unattributedNameSql}=${serviceParam})`;
  if (projectParameter === undefined) {
    conditions.push(`(sd.name=${serviceParam}${unattributed})`);
    return;
  }
  const projectParam = `$${projectParameter}::uuid`;
  conditions.push(`(EXISTS(SELECT 1 FROM service_project_aliases a WHERE a.project_id=${projectParam}
    AND a.service_definition_id=sd.id AND a.name=${serviceParam})${unattributed})`);
}

/** Repository-owned expressions and a trusted server principal context only. */
export function inheritedProjectActorSql(
  project: string,
  actor: string,
  input: object,
  write = false
): string {
  if (!("include_organization_grants" in input) || input.include_organization_grants !== true)
    return "false";
  const role = `debugbundle_project_actor_role(${project},${actor},true,${isSelfHostMode() ? "true" : "false"})`;
  return write ? `${role} IN ('owner','admin','member')` : `${role} IS NOT NULL`;
}

/** Shared live policy for data reads and operational writes, including legacy
 * credentials. Direct grants do not bypass account/member suspension. */
export function projectActorRoleSql(project: string, actor: string, input: object): string {
  const inherited =
    "include_organization_grants" in input && input.include_organization_grants === true;
  return `debugbundle_project_actor_role(${project},${actor},${inherited ? "true" : "false"},${isSelfHostMode() ? "true" : "false"})`;
}
export function projectActorAllowedSql(
  project: string,
  actor: string,
  input: object,
  write = false
): string {
  const role = projectActorRoleSql(project, actor, input);
  return write ? `${role} IN ('owner','admin','member')` : `${role} IS NOT NULL`;
}
