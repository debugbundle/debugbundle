import { useEffect, useRef, useState } from "react";
import {
  ReferralCodeSchema,
  type ReferralCustomerResponse
} from "../../../../../packages/referrals/src/referral-contracts.js";
import { ReferralApiError } from "../../../../../packages/referral-client/src/index.js";
import { referralApi, referralErrorMessage } from "../../lib/referral-api.js";
import { usePendingAction } from "../../lib/use-pending-action.js";
import { PendingButton } from "./pending-button.js";
import { Button } from "../ui/button.js";
import { CollapsibleCard } from "../ui/collapsible-card.js";
import { Field, FieldLabel, FieldError } from "../ui/field.js";
import { Input } from "../ui/input.js";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel
} from "../ui/alert-dialog.js";

export function CustomerReferralControl({
  organizationId
}: {
  organizationId: string;
}): JSX.Element | null {
  const [record, setRecord] = useState<ReferralCustomerResponse | null>(null),
    [code, setCode] = useState(""),
    [loading, setLoading] = useState(true),
    [available, setAvailable] = useState(true),
    [revision, setRevision] = useState(0),
    [error, setError] = useState<string | null>(null),
    [replacement, setReplacement] = useState<string | null>(null),
    [saved, setSaved] = useState(false);
  const generation = useRef(0),
    dirty = useRef(false),
    previousOrganization = useRef(organizationId),
    { pending, run } = usePendingAction();
  useEffect(() => {
    const current = ++generation.current;
    setLoading(true);
    setError(null);
    if (previousOrganization.current !== organizationId) {
      previousOrganization.current = organizationId;
      dirty.current = false;
      setCode("");
      setRecord(null);
      setReplacement(null);
      setSaved(false);
      setAvailable(true);
    }
    void referralApi
      .customer()
      .then((result) => {
        if (current !== generation.current) return;
        setRecord(result);
        setAvailable(true);
        if (!dirty.current) setCode(result.attribution?.partner_code ?? result.pending_code ?? "");
      })
      .catch((reason: unknown) => {
        if (current !== generation.current) return;
        if (
          reason instanceof ReferralApiError &&
          (reason.code === "program_unavailable" || reason.status === 404)
        )
          setAvailable(false);
        else setError(referralErrorMessage(reason));
      })
      .finally(() => {
        if (current === generation.current) setLoading(false);
      });
    return () => {
      generation.current++;
    };
  }, [organizationId, revision]);
  const save = (proposed: string, explicit: boolean): void => {
    void run(async () => {
      const current = ++generation.current;
      setError(null);
      setSaved(false);
      try {
        const attribution = await referralApi.apply(organizationId, proposed, explicit);
        if (current !== generation.current) return;
        setRecord({ attribution, pending_code: null });
        setCode(attribution.partner_code);
        setReplacement(null);
        setSaved(true);
        dirty.current = false;
      } catch (reason) {
        if (current !== generation.current) return;
        if (
          reason instanceof ReferralApiError &&
          reason.code === "attribution_change_requires_confirmation"
        )
          setReplacement(proposed);
        else setError(referralErrorMessage(reason));
      }
    });
  };
  const submit = (): void => {
    const parsed = ReferralCodeSchema.safeParse(code);
    if (!parsed.success) {
      setError("Enter a valid referral code.");
      return;
    }
    if (record?.attribution && record.attribution.partner_code !== parsed.data) {
      setError(null);
      setReplacement(parsed.data);
      return;
    }
    save(parsed.data, false);
  };
  if (!available) return null;
  return (
    <>
      <CollapsibleCard
        title="Have a Business referral code?"
        description={
          record?.attribution
            ? `Referred by ${record.attribution.partner_code}`
            : "New Business customers receive 10% off their first eligible Business base invoice."
        }
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <p className="text-sm text-muted-foreground">
            Business base subscriptions only. Capacity, tax and previously paid subscriptions do not
            qualify. Codes are locked once checkout is reserved.
          </p>
          <Field>
            <FieldLabel htmlFor="business-referral-code">Business referral code</FieldLabel>
            <Input
              id="business-referral-code"
              value={code}
              maxLength={32}
              autoComplete="off"
              disabled={loading || pending || record?.attribution?.checkout_reserved === true}
              onChange={(event) => {
                dirty.current = true;
                setSaved(false);
                setCode(event.target.value);
              }}
            />
          </Field>
          {record?.attribution?.checkout_reserved ? (
            <p role="status" className="text-sm text-muted-foreground">
              This referral is locked for your checkout.
            </p>
          ) : (
            <PendingButton
              type="submit"
              pending={pending}
              pendingLabel="Applying code"
              disabled={loading || !code.trim()}
            >
              Apply code
            </PendingButton>
          )}
          {error && replacement === null ? <FieldError role="alert">{error}</FieldError> : null}
          {error && record === null ? (
            <Button variant="outline" onClick={() => setRevision((value) => value + 1)}>
              Retry
            </Button>
          ) : null}
          {saved ? (
            <p role="status" className="text-sm text-muted-foreground">
              Referral code applied.
            </p>
          ) : null}
        </form>
      </CollapsibleCard>
      <AlertDialog
        open={replacement !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setReplacement(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace referral?</AlertDialogTitle>
            <AlertDialogDescription>
              Replace the current referral with {replacement}? This choice will be locked when
              checkout is reserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error ? <FieldError role="alert">{error}</FieldError> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Keep current referral</AlertDialogCancel>
            <AlertDialogAction asChild>
              <PendingButton
                pending={pending}
                pendingLabel="Applying code"
                onClick={(event) => {
                  event.preventDefault();
                  if (replacement) save(replacement, true);
                }}
              >
                Replace referral
              </PendingButton>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
