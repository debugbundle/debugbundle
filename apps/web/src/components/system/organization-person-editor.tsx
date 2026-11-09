import { useState } from "react";
import type {
  OrganizationInviteBody,
  OrganizationMemberUpdate,
  OrganizationPerson
} from "../../../../../packages/shared-types/src/index.js";
import type { ProjectRecord } from "../../lib/api.js";
import { organizationApi } from "../../lib/organization-api.js";
import { usePendingAction } from "../../lib/use-pending-action.js";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "../ui/field.js";
import { Input } from "../ui/input.js";
import { Button } from "../ui/button.js";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "../ui/sheet.js";
import { Checkbox } from "../ui/checkbox.js";
import { MultiSelect } from "./multi-select.js";
import { PendingButton } from "./pending-button.js";
import {
  OrganizationGrantFields,
  type OrganizationGrantDraft
} from "./organization-grant-fields.js";

export function OrganizationPersonEditor({
  organizationId,
  person,
  projects,
  canAppointAdmin,
  onClose,
  onSaved
}: {
  organizationId: string;
  person: OrganizationPerson | null;
  projects: ProjectRecord[];
  canAppointAdmin: boolean;
  onClose: () => void;
  onSaved: () => void;
}): JSX.Element {
  const [email, setEmail] = useState("");
  const [grants, setGrants] = useState<OrganizationGrantDraft>({
    role: person?.role === "admin" ? "admin" : "member",
    project_access: person?.project_access ?? "selected",
    default_project_role: person?.default_project_role ?? "member"
  });
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [suspended, setSuspended] = useState(person?.suspended_at != null);
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = usePendingAction();
  const inviting = person === null;
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <SheetContent showCloseButton={false} className="data-[side=right]:w-full">
        <SheetHeader>
          <SheetTitle>{inviting ? "Invite person" : "Edit access"}</SheetTitle>
          <SheetDescription>
            {person?.email ??
              "Invite someone to this organisation. They’ll verify their email before accepting."}
          </SheetDescription>
        </SheetHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              setError(null);
              try {
                if (inviting) {
                  const invitation: OrganizationInviteBody = {
                    ...grants,
                    email: email.trim(),
                    project_ids:
                      grants.role === "member" && grants.project_access === "selected"
                        ? projectIds
                        : []
                  };
                  await organizationApi.invite(organizationId, invitation);
                } else {
                  const changes: OrganizationMemberUpdate = { ...grants, suspended };
                  await organizationApi.update(organizationId, person.user_id, changes);
                }
                onSaved();
                onClose();
              } catch (cause) {
                if (
                  cause instanceof Error &&
                  cause.message.includes("organization_invite_delivery_failed")
                ) {
                  setError(
                    "The invitation was saved but email delivery failed. Close this editor and use Resend in Pending invitations."
                  );
                  onSaved();
                } else
                  setError(
                    "Could not save this access. Check your current permissions and available capacity, then try again. Your choices have been kept."
                  );
              }
            });
          }}
        >
          <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            {inviting ? (
              <Field data-invalid={error !== null || undefined}>
                <FieldLabel htmlFor="organization-invite-email">Email address</FieldLabel>
                <Input
                  id="organization-invite-email"
                  type="email"
                  maxLength={320}
                  required
                  value={email}
                  disabled={pending}
                  aria-invalid={error !== null || undefined}
                  onChange={(event) => setEmail(event.currentTarget.value)}
                />
              </Field>
            ) : null}
            <OrganizationGrantFields
              value={grants}
              onChange={(next) => {
                setGrants(next);
                if (next.role === "admin" || next.project_access === "all") setProjectIds([]);
              }}
              canAppointAdmin={canAppointAdmin}
              disabled={pending}
            />
            {inviting && grants.role === "member" && grants.project_access === "selected" ? (
              <Field>
                <FieldLabel htmlFor="organization-invite-projects">Selected projects</FieldLabel>
                <MultiSelect
                  id="organization-invite-projects"
                  label="Selected projects"
                  options={projects.map((project) => ({
                    value: project.project_id,
                    label: project.name
                  }))}
                  value={projectIds}
                  onValueChange={setProjectIds}
                  disabled={pending}
                />
                <FieldDescription>
                  You can invite without projects and assign them later. Selected direct grants are
                  retained when inherited access changes.
                </FieldDescription>
              </Field>
            ) : null}
            {!inviting ? (
              <Field orientation="horizontal">
                <Checkbox
                  id="organization-person-suspended"
                  checked={suspended}
                  disabled={pending}
                  onCheckedChange={(value) => setSuspended(value === true)}
                />
                <FieldLabel htmlFor="organization-person-suspended">
                  Suspend all organisation and project access
                </FieldLabel>
              </Field>
            ) : null}
            {person?.grants_paused_at == null ? null : (
              <FieldDescription>
                Inherited access is paused. Saving these reviewed grants explicitly reactivates
                them, subject to the current plan.
              </FieldDescription>
            )}
            {error === null ? null : <FieldError>{error}</FieldError>}
          </FieldGroup>
          <SheetFooter>
            <PendingButton
              type="submit"
              pending={pending}
              pendingLabel={inviting ? "Sending…" : "Saving…"}
            >
              {inviting ? "Send invitation" : "Save access"}
            </PendingButton>
            <SheetClose asChild>
              <Button variant="outline" disabled={pending}>
                Cancel
              </Button>
            </SheetClose>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
