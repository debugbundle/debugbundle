import { useState } from "react";
import type { OrganizationPerson } from "../../../../../packages/shared-types/src/index.js";
import type { PendingOwnershipTransfer } from "../../../../../packages/organization-client/src/index.js";
import { organizationApi } from "../../lib/organization-api.js";
import { usePendingAction } from "../../lib/use-pending-action.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card.js";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "../ui/field.js";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "../ui/select.js";
import { Checkbox } from "../ui/checkbox.js";
import { PendingButton } from "./pending-button.js";

export function OrganizationOwnershipCard({
  organizationId,
  people,
  transfer,
  verified,
  onSaved
}: {
  organizationId: string;
  people: OrganizationPerson[];
  transfer: PendingOwnershipTransfer | null;
  verified: boolean;
  onSaved: () => void;
}): JSX.Element {
  const [recipient, setRecipient] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = usePendingAction();
  function mutate(action: () => Promise<unknown>): void {
    void run(async () => {
      setError(null);
      try {
        await action();
        setConfirmed(false);
        setRecipient("");
        onSaved();
      } catch {
        setError(
          "Could not update the transfer. The recipient must be a verified, active organisation member. Retry or cancel an existing request."
        );
        onSaved();
      }
    });
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ownership</CardTitle>
        <CardDescription>
          Ownership changes only when the verified recipient accepts the email. They take
          responsibility for billing and all projects; your personal credentials stay yours.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {transfer === null ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (confirmed && recipient !== "")
                mutate(() => organizationApi.requestTransfer(organizationId, recipient));
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="organization-owner-recipient">New Owner</FieldLabel>
                <Select
                  value={recipient}
                  onValueChange={setRecipient}
                  disabled={pending || !verified}
                >
                  <SelectTrigger id="organization-owner-recipient">
                    <SelectValue placeholder="Select a member" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {people
                        .filter(
                          (person) =>
                            person.role !== null &&
                            person.role !== "owner" &&
                            person.suspended_at === null
                        )
                        .map((person) => (
                          <SelectItem key={person.user_id} value={person.user_id}>
                            {person.email}
                          </SelectItem>
                        ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  {verified
                    ? "The recipient must verify this email and accept within two days. You remain Owner until then."
                    : "Verify your sign-in email before requesting an ownership transfer."}
                </FieldDescription>
              </Field>
              <Field orientation="horizontal">
                <Checkbox
                  id="organization-owner-confirm"
                  checked={confirmed}
                  disabled={pending || !verified}
                  onCheckedChange={(value) => setConfirmed(value === true)}
                />
                <FieldLabel htmlFor="organization-owner-confirm">
                  I understand that I become a selected Member after acceptance.
                </FieldLabel>
              </Field>
              <PendingButton
                type="submit"
                pending={pending}
                disabled={!verified || !confirmed || recipient === ""}
                pendingLabel="Sending request…"
              >
                Request ownership transfer
              </PendingButton>
              {error === null ? null : <FieldError>{error}</FieldError>}
            </FieldGroup>
          </form>
        ) : (
          <FieldGroup>
            <FieldDescription>
              Awaiting acceptance by{" "}
              {people.find((person) => person.user_id === transfer.recipient_user_id)?.email ??
                "the selected member"}
              . Expires {new Date(transfer.expires_at).toLocaleString()}.
            </FieldDescription>
            <PendingButton
              variant="outline"
              pending={pending}
              disabled={!verified}
              pendingLabel="Cancelling…"
              onClick={() => mutate(() => organizationApi.cancelTransfer(organizationId))}
            >
              Cancel transfer
            </PendingButton>
            {error === null ? null : <FieldError>{error}</FieldError>}
          </FieldGroup>
        )}
      </CardContent>
    </Card>
  );
}
