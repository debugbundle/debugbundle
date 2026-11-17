import { useEffect, useRef, useState } from "react";
import { OfferApiError } from "../../../../../packages/referral-client/src/offer-api.js";
import { PublicOfferCodeSchema } from "../../../../../packages/referrals/src/programme-policy.js";
import { offerApi, offerErrorMessage } from "../../lib/offer-api.js";
import { useWorkspaceOffer, type WorkspaceOfferState } from "../../lib/use-workspace-offer.js";
import { usePendingAction } from "../../lib/use-pending-action.js";
import { CustomerReferralControl } from "./customer-referral-control.js";
import { PendingButton } from "./pending-button.js";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../ui/card.js";
import { FieldGroup, Field, FieldLabel, FieldError, FieldDescription } from "../ui/field.js";
import { Input } from "../ui/input.js";
import { Button } from "../ui/button.js";
import { Notice } from "../ui/notice.js";
import { Skeleton } from "../ui/skeleton.js";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel
} from "../ui/alert-dialog.js";

export function CustomerOfferControl({
  organizationId,
  onState
}: {
  organizationId: string;
  onState?: (state: WorkspaceOfferState) => void;
}): JSX.Element {
  const { data, reload } = useWorkspaceOffer(organizationId),
    { pending, run } = usePendingAction();
  const [code, setCode] = useState(""),
    [error, setError] = useState<string | null>(null),
    [confirmation, setConfirmation] = useState<"replace" | "remove" | null>(null);
  const dirty = useRef(false),
    generation = useRef(0);
  useEffect(() => {
    generation.current++;
    dirty.current = false;
    setCode("");
    setError(null);
    setConfirmation(null);
    return () => {
      generation.current++;
    };
  }, [organizationId]);
  useEffect(() => {
    onState?.(data);
    if (!dirty.current)
      setCode(
        data.claim?.code ??
          data.legacy_attribution?.partner_code ??
          data.pending?.code ??
          data.intent_code ??
          ""
      );
  }, [data, onState]);
  const apply = (explicit: boolean): void =>
    void run(async () => {
      const parsed = PublicOfferCodeSchema.safeParse(code);
      if (!parsed.success) {
        setError("Enter a valid referral or discount code.");
        return;
      }
      const current = generation.current;
      setError(null);
      try {
        await offerApi.execute("apply", {
          code: parsed.data,
          expected_organization_id: organizationId,
          explicit_correction: explicit
        });
        if (current !== generation.current) return;
        dirty.current = false;
        setConfirmation(null);
        reload();
      } catch (reason) {
        if (current !== generation.current) return;
        if (reason instanceof OfferApiError && reason.code === "offer_change_requires_confirmation")
          setConfirmation("replace");
        else setError(offerErrorMessage(reason));
      }
    });
  const remove = (): void =>
    void run(async () => {
      const current = generation.current;
      setError(null);
      try {
        await offerApi.execute("remove", {
          expected_organization_id: organizationId,
          confirmed: true
        });
        if (current !== generation.current) return;
        dirty.current = true;
        setCode("");
        setConfirmation(null);
        reload();
      } catch (reason) {
        if (current === generation.current) setError(offerErrorMessage(reason));
      }
    });
  if (data.status === "disabled")
    return <CustomerReferralControl organizationId={organizationId} />;
  if (data.status === "loading") return <Skeleton className="h-28 w-full" />;
  const saved = data.claim,
    locked = saved?.checkout_reserved === true || saved?.status === "used";
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Referral or discount code</CardTitle>
          <CardDescription>
            Save your introductory offer before your first paid subscription.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {data.status === "ready" && !data.new_claims_enabled ? (
            <Notice title="New code claims are paused">
              Your saved offer and its purchase terms remain available.
            </Notice>
          ) : null}
          {data.status === "error" ? (
            <Notice tone="warning" title="Offer details could not be loaded">
              <Button variant="outline" onClick={reload}>
                Retry offer details
              </Button>
            </Notice>
          ) : null}
          {!saved && data.legacy_attribution ? (
            <Notice
              title={
                data.legacy_discount_eligible
                  ? "Your legacy Business referral is saved"
                  : "Legacy referral history"
              }
            >
              Code {data.legacy_attribution.partner_code}.{" "}
              {data.legacy_discount_eligible
                ? "10% off your first eligible Business base invoice, monthly or yearly. Solo, Team, tax and extra capacity are excluded; your free trial does not consume it."
                : "The original agreement remains recorded. A consumed benefit does not apply again on resubscription."}
            </Notice>
          ) : null}
          {saved && saved.status !== "revoked" ? (
            <Notice
              title={
                saved.status === "used"
                  ? "Introductory offer used"
                  : saved.status === "reserved"
                    ? "Offer reserved for checkout"
                    : saved.status === "expired"
                      ? "Campaign offer expired"
                      : "Your discount is saved"
              }
            >
              {saved.version.policy.discount_basis_points / 100}% off the first eligible{" "}
              {saved.version.policy.eligible_plans
                .map((p) => p[0]!.toUpperCase() + p.slice(1))
                .join(", ")}{" "}
              base invoice. Your free trial does not consume it.
              {saved.redeem_by ? (
                <p>Use by {new Date(saved.redeem_by).toLocaleString()}.</p>
              ) : (
                <p>It stays saved to this workspace when your trial ends.</p>
              )}
            </Notice>
          ) : null}
          {data.intent_status === "pending" ? (
            <Notice title="Your signup offer is still being checked">
              Retry to finish saving the offer before purchasing.{" "}
              <Button variant="outline" onClick={reload}>
                Retry signup offer
              </Button>
            </Notice>
          ) : null}
          {data.intent_status === "rejected" || data.intent_status === "expired" ? (
            <Notice tone="warning">
              Your signup code {data.intent_code ?? ""} could not be saved automatically. You can
              enter it again or contact support.
            </Notice>
          ) : null}
          {data.early_purchase_allowed ? (
            <Notice title="Early purchase approved">
              You can choose an eligible paid plan now, or continue your free trial.
            </Notice>
          ) : null}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              apply(false);
            }}
          >
            <FieldGroup>
              <Field data-invalid={error !== null} data-disabled={pending || locked}>
                <FieldLabel htmlFor="customer-offer-code">Referral or discount code</FieldLabel>
                <Input
                  id="customer-offer-code"
                  value={code}
                  maxLength={24}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  aria-invalid={error !== null}
                  aria-describedby={
                    error ? "customer-offer-help customer-offer-error" : "customer-offer-help"
                  }
                  disabled={
                    pending || locked || !data.new_claims_enabled || data.status === "error"
                  }
                  onChange={(event) => {
                    dirty.current = true;
                    setCode(event.target.value);
                    setError(null);
                  }}
                />
                <FieldDescription id="customer-offer-help">
                  Codes work without a referral link. One introductory discount per customer; tax
                  and extra capacity are excluded.
                </FieldDescription>
                {error ? (
                  <FieldError id="customer-offer-error" role="alert">
                    {error}
                  </FieldError>
                ) : null}
              </Field>
              {!locked ? (
                <div className="flex flex-wrap gap-2">
                  <PendingButton
                    type="submit"
                    pending={pending}
                    pendingLabel="Applying code"
                    disabled={!code.trim() || !data.new_claims_enabled || data.status === "error"}
                  >
                    Apply code
                  </PendingButton>
                  {saved || data.intent_status === "pending" ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={pending}
                      onClick={() => setConfirmation("remove")}
                    >
                      Remove discount
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
      <AlertDialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setConfirmation(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmation === "remove" ? "Remove this discount?" : "Replace this offer?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation === "remove"
                ? "The introductory discount will be removed before checkout. Your referring creator and financial history remain recorded."
                : `Apply ${code} instead of the saved offer? A promotion changes the discount; a different referral can change the referring creator. This choice locks at checkout.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error ? <FieldError>{error}</FieldError> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Keep current offer</AlertDialogCancel>
            <PendingButton
              pending={pending}
              pendingLabel="Saving"
              onClick={() => (confirmation === "remove" ? remove() : apply(true))}
            >
              {confirmation === "remove" ? "Remove discount" : "Replace offer"}
            </PendingButton>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
