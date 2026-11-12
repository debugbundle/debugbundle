import type { MemberTokenScopeDeclaration } from "../../../../../packages/shared-types/src/index.js";
import type { ProjectRecord } from "../../lib/api.js";
import { MultiSelect } from "./multi-select.js";
import { Field, FieldDescription, FieldLabel } from "../ui/field.js";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group.js";

export function MemberTokenScopeFields({
  value,
  onChange,
  projects,
  organizationId,
  canAdministerOrganization,
  disabled = false
}: {
  value: MemberTokenScopeDeclaration;
  onChange: (value: MemberTokenScopeDeclaration) => void;
  projects: ProjectRecord[];
  organizationId: string;
  canAdministerOrganization: boolean;
  disabled?: boolean;
}): JSX.Element {
  return (
    <>
      <Field>
        <FieldLabel id="token-scope-label">Scope</FieldLabel>
        <ToggleGroup
          type="single"
          variant="outline"
          aria-labelledby="token-scope-label"
          value={value.mode}
          disabled={disabled}
          onValueChange={(mode) => {
            if (mode === "projects") {
              const permissions = value.permissions.filter(
                (permission) => permission !== "organization:admin"
              );
              onChange({
                mode,
                project_ids: [],
                permissions: permissions.length ? permissions : ["project:read"]
              });
            }
            if (mode === "organization") {
              const permissions = value.permissions.filter(
                (permission) =>
                  canAdministerOrganization ||
                  (permission !== "project:admin" && permission !== "organization:admin")
              );
              onChange({
                mode,
                organization_id: organizationId,
                permissions: permissions.length ? permissions : ["project:read"]
              });
            }
          }}
        >
          <ToggleGroupItem value="organization">Current workspace</ToggleGroupItem>
          <ToggleGroupItem value="projects">Selected projects</ToggleGroupItem>
        </ToggleGroup>
        {value.mode === "projects" ? (
          <MultiSelect
            id="token-projects"
            label="Token projects"
            options={projects
              .filter((project) => !project.shared_access_suspended)
              .map((project) => ({ value: project.project_id, label: project.name }))}
            value={value.project_ids}
            onValueChange={(project_ids) => onChange({ ...value, project_ids })}
            disabled={disabled}
          />
        ) : (
          <FieldDescription>
            Includes current and future projects in this workspace that you have access to.
          </FieldDescription>
        )}
      </Field>
      <Field>
        <FieldLabel id="token-permissions-label">Permissions</FieldLabel>
        <ToggleGroup
          type="multiple"
          variant="outline"
          className="flex-wrap"
          aria-labelledby="token-permissions-label"
          value={value.permissions}
          disabled={disabled}
          onValueChange={(permissions) => {
            if (permissions.length > 0)
              onChange({
                ...value,
                permissions: permissions as MemberTokenScopeDeclaration["permissions"]
              });
          }}
        >
          <ToggleGroupItem value="project:read">Read</ToggleGroupItem>
          <ToggleGroupItem value="project:write">Write</ToggleGroupItem>
          <ToggleGroupItem
            value="project:admin"
            disabled={value.mode === "organization" && !canAdministerOrganization}
          >
            Project settings
          </ToggleGroupItem>
          {value.mode === "organization" && canAdministerOrganization ? (
            <ToggleGroupItem value="organization:admin">People management</ToggleGroupItem>
          ) : null}
        </ToggleGroup>
        <FieldDescription>
          Read, Write and Project settings are enabled by default where your role allows. Turn off
          operations this automation does not need. Your permissions are rechecked on every request.
        </FieldDescription>
        {value.mode === "organization" && !canAdministerOrganization ? (
          <FieldDescription>
            Workspace-wide Project settings require an Owner or Admin role. Use Selected projects
            for projects you administer.
          </FieldDescription>
        ) : null}
      </Field>
    </>
  );
}
