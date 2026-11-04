export interface ProjectReadScope {
  project_id?: string;
  /** Fixed at credential creation, independent of a project's future merges. */
  origin_project_ids?: string[];
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
