import { programmeTransitions as transitions } from "../../../../../packages/referrals/src/programme-lifecycle.js";
import { useState } from "react";
import type {
  ProgrammeState,
  ProgrammeVersion
} from "../../../../../packages/referrals/src/programme-policy.js";
import { offerApi, offerErrorMessage } from "../../lib/offer-api.js";
import { usePendingAction } from "../../lib/use-pending-action.js";
import { OfferPolicyDetails } from "./offer-policy-details.js";
import { OfferProgrammeDetails } from "./offer-programme-details.js";
import { PendingButton } from "./pending-button.js";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../ui/card.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import { Field, FieldLabel, FieldError, FieldGroup } from "../ui/field.js";
import { Input } from "../ui/input.js";
import { Checkbox } from "../ui/checkbox.js";
import { Notice } from "../ui/notice.js";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel
} from "../ui/alert-dialog.js";

export function OfferProgrammeVersionControl({
  version,
  claimsEnabled = true,
  onRevise,
  onChanged
}: {
  version: ProgrammeVersion;
  claimsEnabled?: boolean;
  onRevise: () => void;
  onChanged: () => void;
}): JSX.Element {
  const [code, setCode] = useState(""),
    [unlimited, setUnlimited] = useState(false),
    [target, setTarget] = useState<ProgrammeState | null>(null),
    [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState<string | null>(null);
  const { pending, run } = usePendingAction();
  const mutate = (action: () => Promise<unknown>, success: string): void =>
    void run(async () => {
      setError(null);
      setNotice(null);
      try {
        await action();
        setNotice(success);
        setTarget(null);
        onChanged();
      } catch (reason) {
        setError(offerErrorMessage(reason));
      }
    });
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{version.name}</CardTitle>
          <Badge variant="outline">Revision {version.revision}</Badge>
          <Badge variant="secondary">{version.state}</Badge>
        </div>
        <CardDescription>{version.public_description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <OfferProgrammeDetails>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <dt>Version</dt>
            <dd className="break-all">{version.version_id}</dd>
            <dt>Claims accepted</dt>
            <dd>
              {version.claims_count}
              {version.policy.max_claims === null
                ? " / unlimited"
                : ` / ${version.policy.max_claims}`}
            </dd>
            <dt>Claims start</dt>
            <dd>{new Date(version.policy.claims_start_at).toLocaleString()}</dd>
            <dt>Terms version</dt>
            <dd>{version.policy.terms_version}</dd>
          </dl>
          <OfferPolicyDetails policy={version.policy} />
        </OfferProgrammeDetails>
        <p className="text-sm text-muted-foreground">
          Payment discounts are prepared and verified automatically when you activate or schedule
          this programme.
        </p>
        {version.policy.kind === "promotion" ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              mutate(
                () => offerApi.execute("promotion_code", { version_id: version.version_id, code }),
                "Promotional code reserved. It follows this programme’s availability."
              );
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor={`promotion-${version.version_id}`}>
                  Promotional code
                </FieldLabel>
                <Input
                  id={`promotion-${version.version_id}`}
                  value={code}
                  disabled={pending}
                  maxLength={24}
                  onChange={(event) => setCode(event.target.value)}
                />
              </Field>
              <PendingButton
                type="submit"
                pending={pending}
                pendingLabel="Reserving code"
                disabled={!code.trim()}
              >
                Reserve promotional code
              </PendingButton>
            </FieldGroup>
          </form>
        ) : null}
        {error ? <FieldError role="alert">{error}</FieldError> : null}
        {notice ? <Notice>{notice}</Notice> : null}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={pending} onClick={onRevise}>
            Create revised draft
          </Button>
          {transitions[version.state].map((state) => (
            <Button
              key={state}
              variant={state === "active" ? "default" : "outline"}
              disabled={
                pending || (!claimsEnabled && (state === "active" || state === "scheduled"))
              }
              onClick={() => {
                setTarget(state);
                setUnlimited(false);
                setError(null);
              }}
            >
              {state === "active"
                ? "Activate"
                : state === "scheduled"
                  ? "Schedule"
                  : state === "paused"
                    ? "Pause"
                    : "End"}
            </Button>
          ))}
        </div>
        <AlertDialog
          open={target !== null}
          onOpenChange={(open) => {
            if (!open && !pending) setTarget(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {target === "active"
                  ? "Activate this offer?"
                  : target === "scheduled"
                    ? "Schedule this offer?"
                    : target === "paused"
                      ? "Pause new claims?"
                      : "End new claims?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {target === "active" || target === "scheduled"
                  ? `${version.name}, revision ${version.revision}: ${version.policy.discount_basis_points / 100}% first-invoice discount. New claims can be accepted within the configured window after this action. The payment discount will be prepared and verified automatically. A new referral revision requires creators to accept its terms.`
                  : "Existing promised discounts, attribution and financial obligations remain recorded. New claims stop; fraud revocation is a separate action."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {(target === "active" || target === "scheduled") &&
            version.policy.max_claims === null ? (
              <Field orientation="horizontal">
                <Checkbox
                  id={`unlimited-${version.version_id}`}
                  checked={unlimited}
                  disabled={pending}
                  onCheckedChange={(value) => setUnlimited(value === true)}
                />
                <FieldLabel htmlFor={`unlimited-${version.version_id}`}>
                  I acknowledge there is no claim limit.
                </FieldLabel>
              </Field>
            ) : null}
            {error ? <FieldError role="alert">{error}</FieldError> : null}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
              <PendingButton
                pending={pending}
                pendingLabel="Updating programme"
                disabled={
                  (target === "active" || target === "scheduled") &&
                  version.policy.max_claims === null &&
                  !unlimited
                }
                onClick={() => {
                  if (target)
                    mutate(
                      () =>
                        offerApi.execute("state", {
                          version_id: version.version_id,
                          state: target,
                          expected_state: version.state,
                          acknowledge_unlimited: unlimited
                        }),
                      "Programme state updated."
                    );
                }}
              >
                Confirm change
              </PendingButton>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
