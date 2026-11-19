import { programmeTransitions as transitions } from "../../../../../packages/referrals/src/programme-lifecycle.js";
import { useState, type ReactNode } from "react";
import type {
  ProgrammeState,
  ProgrammeVersion
} from "../../../../../packages/referrals/src/programme-policy.js";
import { offerApi, offerErrorMessage } from "../../lib/offer-api.js";
import { usePendingAction } from "../../lib/use-pending-action.js";
import { OfferPolicyDetails } from "./offer-policy-details.js";
import { OfferProgrammeDetails } from "./offer-programme-details.js";
import { OfferPromotionCodes } from "./offer-promotion-codes.js";
import { PendingButton } from "./pending-button.js";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../ui/card.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import { Field, FieldLabel, FieldError } from "../ui/field.js";
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
  onChanged,
  children,
  readOnly = false,
  embedded = false
}: {
  version: ProgrammeVersion;
  claimsEnabled?: boolean;
  onRevise: () => void;
  onChanged: () => void;
  children?: ReactNode;
  readOnly?: boolean;
  embedded?: boolean;
}): JSX.Element {
  const [unlimited, setUnlimited] = useState(false),
    [target, setTarget] = useState<ProgrammeState | null>(null),
    [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState<string | null>(null);
  const { pending, run } = usePendingAction();
  const Container = embedded ? "section" : Card;
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
    <Container className={embedded ? "flex flex-col gap-4" : undefined}>
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
        {!readOnly && version.state !== "ended" ? (
          <p className="text-sm text-muted-foreground">
            Payment discounts are prepared and verified automatically when you activate or schedule
            this programme. Promotional offers appear in the shared public banner during their claim
            window.
          </p>
        ) : null}
        {version.policy.kind === "promotion" ? (
          <OfferPromotionCodes versionId={version.version_id} state={version.state} />
        ) : null}
        {error ? <FieldError role="alert">{error}</FieldError> : null}
        {notice ? <Notice>{notice}</Notice> : null}
        {!readOnly ? (
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
                      : version.state === "draft"
                        ? "Discard draft"
                        : "End and archive"}
              </Button>
            ))}
          </div>
        ) : null}
        {children}
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
                      : version.state === "draft"
                        ? "Discard this draft?"
                        : "End and archive this programme?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {target === "active" || target === "scheduled"
                  ? `${version.name}, revision ${version.revision}: ${version.policy.discount_basis_points / 100}% first-invoice discount. New claims can be accepted within the configured window after this action. The payment discount will be prepared and verified automatically. A new referral revision requires creators to accept its terms.`
                  : target === "paused"
                    ? `${version.name}, revision ${version.revision}. New claims pause. Existing promised discounts, attribution and financial obligations remain recorded.`
                    : `${version.name}, revision ${version.revision}. This revision moves to history. Existing promised discounts, attribution and financial obligations remain recorded. New claims stop; fraud revocation is a separate action.`}
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
    </Container>
  );
}
