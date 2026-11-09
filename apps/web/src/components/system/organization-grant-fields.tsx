import { useId } from "react";
import { Field, FieldDescription, FieldLabel } from "../ui/field.js";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group.js";

export interface OrganizationGrantDraft {
  role: "admin" | "member";
  project_access: "selected" | "all";
  default_project_role: "member" | "viewer";
}
/** Fixed role choices shared by invitations and explicit grant reviews. */
export function OrganizationGrantFields({
  value,
  onChange,
  canAppointAdmin,
  disabled = false
}: {
  value: OrganizationGrantDraft;
  onChange: (value: OrganizationGrantDraft) => void;
  canAppointAdmin: boolean;
  disabled?: boolean;
}): JSX.Element {
  const id = useId();
  return (
    <>
      <Field>
        <FieldLabel id={`${id}-role`}>Organisation role</FieldLabel>
        <ToggleGroup
          className="max-w-full flex-wrap"
          type="single"
          variant="outline"
          aria-labelledby={`${id}-role`}
          value={value.role}
          disabled={disabled}
          onValueChange={(role) => {
            if (role === "member" || role === "admin")
              onChange({ ...value, role, project_access: role === "admin" ? "all" : "selected" });
          }}
        >
          <ToggleGroupItem value="member">Member</ToggleGroupItem>
          {canAppointAdmin ? <ToggleGroupItem value="admin">Admin</ToggleGroupItem> : null}
        </ToggleGroup>
        <FieldDescription>
          {value.role === "admin"
            ? "Admin manages people and every current and future project. Billing and ownership remain with the Owner."
            : "Members use the project access selected below."}
        </FieldDescription>
      </Field>
      {value.role === "member" ? (
        <>
          <Field>
            <FieldLabel id={`${id}-scope`}>Project access</FieldLabel>
            <ToggleGroup
              className="max-w-full flex-wrap"
              type="single"
              variant="outline"
              aria-labelledby={`${id}-scope`}
              value={value.project_access}
              disabled={disabled}
              onValueChange={(project_access) => {
                if (project_access === "all" || project_access === "selected")
                  onChange({ ...value, project_access });
              }}
            >
              <ToggleGroupItem value="selected">Selected projects</ToggleGroupItem>
              <ToggleGroupItem value="all">All current and future</ToggleGroupItem>
            </ToggleGroup>
            <FieldDescription>
              {value.project_access === "all"
                ? "This explicitly grants access to projects added later."
                : "Direct project roles are managed in each project's People settings. Choosing selected does not remove those roles."}
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel id={`${id}-default-role`}>Project role</FieldLabel>
            <ToggleGroup
              className="max-w-full flex-wrap"
              type="single"
              variant="outline"
              aria-labelledby={`${id}-default-role`}
              value={value.default_project_role}
              disabled={disabled}
              onValueChange={(default_project_role) => {
                if (default_project_role === "member" || default_project_role === "viewer")
                  onChange({ ...value, default_project_role });
              }}
            >
              <ToggleGroupItem value="member">Member</ToggleGroupItem>
              <ToggleGroupItem value="viewer">Viewer · read only</ToggleGroupItem>
            </ToggleGroup>
            <FieldDescription>
              A stronger direct project role still applies. Suspension denies all access.
            </FieldDescription>
          </Field>
        </>
      ) : null}
    </>
  );
}
