import { useEffect, useRef, useState } from "react";
import type { PublicOfferPreview } from "../../../../../packages/referrals/src/programme-policy.js";
import { PublicOfferCodeSchema } from "../../../../../packages/referrals/src/programme-policy.js";
import { OfferApiError } from "../../../../../packages/referral-client/src/offer-api.js";
import {
  offerApi,
  setSignupOfferHint,
  clearSignupOfferHint,
  offerErrorMessage
} from "../../lib/offer-api.js";
import { usePendingAction } from "../../lib/use-pending-action.js";
import { Field, FieldLabel, FieldDescription, FieldError, FieldGroup } from "../ui/field.js";
import { Input } from "../ui/input.js";
import { Notice } from "../ui/notice.js";
import { PendingButton } from "./pending-button.js";
import { Button } from "../ui/button.js";

export function SignupOfferControl({
  presentedCode,
  autoLoad = true,
  onLoading,
  onCodeCleared
}: {
  presentedCode: string | null;
  autoLoad?: boolean;
  onLoading: (loading: boolean) => void;
  onCodeCleared?: () => void;
}): JSX.Element | null {
  const [offer, setOffer] = useState<PublicOfferPreview | null>(null),
    [code, setCode] = useState(presentedCode ?? ""),
    [enabled, setEnabled] = useState(false),
    [initializing, setInitializing] = useState(true),
    [error, setError] = useState<string | null>(null),
    [replace, setReplace] = useState(false),
    [clearing, setClearing] = useState(false);
  const { pending, run } = usePendingAction();
  const generation = useRef(0);
  useEffect(() => {
    onLoading((autoLoad && presentedCode !== null && initializing) || pending);
  }, [initializing, pending, onLoading, autoLoad, presentedCode]);
  useEffect(() => {
    if (!autoLoad) {
      setInitializing(false);
      return;
    }
    const current = ++generation.current;
    setInitializing(true);
    void (async () => {
      try {
        const capabilities = await offerApi.execute("capabilities", {});
        if (current !== generation.current) return;
        setEnabled(capabilities.enabled);
        const parsed = PublicOfferCodeSchema.safeParse(presentedCode);
        let next: PublicOfferPreview | null;
        if (presentedCode && parsed.success) {
          try {
            next = await setSignupOfferHint(parsed.data);
          } catch (reason) {
            if (
              reason instanceof OfferApiError &&
              reason.code === "offer_change_requires_confirmation"
            )
              next = (await offerApi.execute("context", {})).offer;
            else throw reason;
          }
        } else next = (await offerApi.execute("context", {})).offer;
        if (current === generation.current) {
          setOffer(next);
          setEnabled(capabilities.enabled || next !== null);
          setCode(next?.code ?? presentedCode ?? "");
        }
      } catch {
        if (current === generation.current && presentedCode) {
          setEnabled(true);
          setError(
            "Your code could not be checked. Keep it and apply it in Billing after signing in; your account can still be created."
          );
        }
      } finally {
        if (current === generation.current) setInitializing(false);
      }
    })();
    return () => {
      generation.current++;
    };
  }, [presentedCode, autoLoad]);
  const apply = (explicit = false): void =>
    void run(async () => {
      const current = generation.current;
      setError(null);
      const parsed = PublicOfferCodeSchema.safeParse(code);
      if (!parsed.success) {
        setError("Enter a valid referral or discount code.");
        return;
      }
      try {
        const next = await setSignupOfferHint(parsed.data, explicit);
        if (current !== generation.current) return;
        setOffer(next);
        setReplace(false);
      } catch (reason) {
        if (current !== generation.current) return;
        if (reason instanceof OfferApiError && reason.code === "offer_change_requires_confirmation")
          setReplace(true);
        else setError(offerErrorMessage(reason));
      }
    });
  const clear = (): void =>
    void run(async () => {
      const current = generation.current;
      setError(null);
      setClearing(true);
      try {
        await clearSignupOfferHint();
        if (current !== generation.current) return;
        setOffer(null);
        setCode("");
        setReplace(false);
        onCodeCleared?.();
      } catch (reason) {
        if (current === generation.current) setError(offerErrorMessage(reason));
      } finally {
        setClearing(false);
      }
    });
  if (!enabled) return null;
  return (
    <div className="flex flex-col gap-3">
      {offer?.available ? (
        <Notice
          title={`${offer.code}: ${offer.version.policy.discount_basis_points / 100}% introductory offer available`}
        >
          Eligibility is checked when your new account is verified. Your trial does not consume the
          offer. Once saved, the discount stays with your workspace for its first eligible paid
          invoice.{" "}
          {offer.version.policy.redeem_by
            ? "Campaign claims include a recorded redemption deadline."
            : ""}{" "}
          Existing accounts can apply a code explicitly in Billing.
        </Notice>
      ) : offer ? (
        <Notice title="This code is unavailable for new claims">
          Choose another code below, or continue with your free account. Saved workspace benefits
          remain recorded and can be checked in Billing after signing in.
        </Notice>
      ) : null}
      <details>
        <summary className="cursor-pointer rounded-sm text-sm text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          Referral or discount code
        </summary>
        <div className="pt-3">
          <FieldGroup>
            <Field data-invalid={error !== null} data-disabled={pending || initializing}>
              <FieldLabel htmlFor="signup-offer-code">Code</FieldLabel>
              <Input
                id="signup-offer-code"
                value={code}
                maxLength={24}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                aria-invalid={error !== null}
                aria-describedby={
                  error ? "signup-offer-help signup-offer-error" : "signup-offer-help"
                }
                disabled={pending || initializing}
                onChange={(event) => {
                  setCode(event.target.value);
                  setReplace(false);
                  setError(null);
                }}
              />
              <FieldDescription id="signup-offer-help">
                Codes can be entered directly, without a referral link.
              </FieldDescription>
            </Field>
            <div className="flex flex-wrap gap-2">
              <PendingButton
                type="button"
                pending={pending && !clearing}
                pendingLabel="Checking code"
                disabled={pending || !code.trim() || initializing}
                onClick={() => apply()}
              >
                Check code
              </PendingButton>
              {offer || code.trim() || presentedCode ? (
                <PendingButton
                  type="button"
                  variant="ghost"
                  pending={pending && clearing}
                  pendingLabel="Clearing code"
                  disabled={pending || initializing}
                  onClick={clear}
                >
                  Clear code
                </PendingButton>
              ) : null}
            </div>
          </FieldGroup>
        </div>
      </details>
      {replace ? (
        <Notice title="Replace pending offer?">
          <p>
            Use {code.trim().toUpperCase()} instead of {offer?.code ?? "the current code"} before
            signup?
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" disabled={pending} onClick={() => apply(true)}>
              Replace pending offer
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setReplace(false)}
            >
              Keep current offer
            </Button>
          </div>
        </Notice>
      ) : null}
      {error ? (
        <FieldError id="signup-offer-error" role="alert">
          {error}
        </FieldError>
      ) : null}
    </div>
  );
}
