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
            if (mode === "projects")
              onChange({
                mode,
                project_ids: [],
                permissions: value.permissions.filter(
                  (permission) => permission !== "organization:admin"
                )
              });
            if (mode === "organization")
              onChange({ mode, organization_id: organizationId, permissions: value.permissions });
          }}
        >
          <ToggleGroupItem value="projects">Selected projects</ToggleGroupItem>
          <ToggleGroupItem value="organization">Current organisation</ToggleGroupItem>
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
            Includes current and future projects in this organisation, limited by your live access.
            It never includes another organisation.
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
          <ToggleGroupItem value="project:admin">Project settings</ToggleGroupItem>
          {value.mode === "organization" && canAdministerOrganization ? (
            <ToggleGroupItem value="organization:admin">People management</ToggleGroupItem>
          ) : null}
        </ToggleGroup>
        <FieldDescription>
          Read is selected by default. Add only the operations this automation needs. Your current
          permissions are rechecked on every request.
        </FieldDescription>
      </Field>
    </>
  );
}
