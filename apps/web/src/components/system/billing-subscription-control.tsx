import { MetadataSeparator } from "./metadata-separator.js";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  classifyBillingOfferChange,
  getBillingCatalogPrice,
  getTierCapabilities,
  isPaidTier,
  type BillingOfferQuote,
  type BillingOfferSelection,
  type BillingOfferStatus,
  type BillingSubscriptionOffer,
  type PaidTierName
} from "../../../../../packages/shared-types/src/index.js";
import { canCheckoutToBillingPlan } from "../../../../../packages/billing/src/billing-offer-admission.js";
import type { BillingSummaryRecord } from "../../lib/api-types.js";
import {
  getBillingOfferStatus,
  previewBillingOfferChange,
  scheduleBillingOfferChange,
  cancelBillingOfferChange,
  previewBillingOfferUpgrade,
  startBillingOfferCheckout
} from "../../lib/billing-offer-api.js";
import {
  getBillingFirstPurchaseEligibility,
  formatPlanName
} from "../../pages/billing-page-helpers.js";
import { Button } from "../ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "../ui/dialog.js";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "../ui/field.js";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group.js";
import { PendingButton } from "./pending-button.js";
import { BillingPaymentContinuation } from "./billing-payment-continuation.js";
import { CalloutCard } from "./callout-card.js";
import {
  BillingOfferSummary,
  formatBillingAmount,
  formatBillingTerm
} from "./billing-offer-summary.js";

interface Props {
  billing: BillingSummaryRecord;
  requestedPlan?: {
    plan: PaidTierName;
    interval?: BillingOfferSelection["interval"];
    sequence: number;
  } | null;
  onBeforeCheckout?(plan: PaidTierName): void;
  onSubscriptionChange?: (subscription: BillingSubscriptionOffer | null) => void;
  onNavigate(url: string): void;
  onRefresh(): void | Promise<void>;
}
/** One plan/interval form and canonical quote across the paid catalogue. */
export function BillingSubscriptionControl(props: Props): JSX.Element {
  const { billing } = props;
  const paid =
    billing.plan !== "free" && !billing.trial.active && billing.stripe_customer_id !== null;
  const [status, setStatus] = useState<BillingOfferStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(paid);
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<BillingOfferSelection>({
    target_plan: isPaidTier(billing.plan) ? billing.plan : "solo",
    interval: "month"
  });
  const [intervalTouched, setIntervalTouched] = useState(false);
  const [quote, setQuote] = useState<BillingOfferQuote | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attemptConfirmed, setAttemptConfirmed] = useState(false);
  const attemptSource = useRef<string | null>(null);
  const [phase, setPhase] = useState<"preview" | "confirm" | "checkout" | "cancel" | null>(null);
  const mounted = useRef(true),
    reads = useRef(0),
    dialogVersion = useRef(0),
    inFlight = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      reads.current += 1;
      dialogVersion.current += 1;
    };
  }, []);
  const loadStatus = useCallback(async (): Promise<void> => {
    const revision = ++reads.current;
    if (!paid) {
      setStatus({ subscription: null, pending_change: null });
      setStatusError(null);
      setLoadingStatus(false);
      return;
    }
    setLoadingStatus(true);
    try {
      const next = await getBillingOfferStatus();
      if (mounted.current && revision === reads.current) {
        setStatus(next);
        setStatusError(null);
      }
    } catch {
      if (mounted.current && revision === reads.current)
        setStatusError("Subscription terms could not be refreshed.");
    } finally {
      if (mounted.current && revision === reads.current) setLoadingStatus(false);
    }
  }, [paid]);
  useEffect(() => {
    void loadStatus();
    return () => {
      reads.current += 1;
    };
  }, [loadStatus, billing]);
  const subscription = status?.subscription ?? null;
  const currentInterval = subscription?.interval;
  useEffect(() => {
    props.onSubscriptionChange?.(subscription);
  }, [subscription, props.onSubscriptionChange]);
  useEffect(() => {
    if (open && !intervalTouched && currentInterval)
      setSelection((previous) => ({ ...previous, interval: currentInterval }));
  }, [open, intervalTouched, currentInterval]);
  const billingSource = `${billing.plan}:${billing.trial.active}`;
  useEffect(() => {
    if (
      attemptSource.current &&
      attemptSource.current !== billingSource &&
      billing.billing_state === "active" &&
      !billing.trial.active
    ) {
      attemptSource.current = null;
      setAttemptConfirmed(false);
      setQuote(null);
      setPaymentUrl(null);
      setError(null);
    }
  }, [billingSource, billing.billing_state, billing.trial.active]);
  const openForPlan = useCallback(
    (plan?: PaidTierName, interval?: BillingOfferSelection["interval"]): void => {
      dialogVersion.current += 1;
      // Closing an uncertain confirmation must not discard its immutable quote.
      if (attemptConfirmed) {
        setOpen(true);
        return;
      }
      setSelection({
        target_plan: plan ?? (isPaidTier(billing.plan) ? billing.plan : "solo"),
        interval: interval ?? currentInterval ?? "month"
      });
      setIntervalTouched(interval !== undefined);
      setQuote(null);
      setPaymentUrl(null);
      setError(null);
      setAttemptConfirmed(false);
      setOpen(true);
    },
    [billing.plan, currentInterval, attemptConfirmed]
  );
  const handledRequest = useRef<number | null>(null);
  useEffect(() => {
    if (props.requestedPlan && handledRequest.current !== props.requestedPlan.sequence) {
      handledRequest.current = props.requestedPlan.sequence;
      openForPlan(props.requestedPlan.plan, props.requestedPlan.interval);
    }
  }, [props.requestedPlan, openForPlan]);
  const pending = status?.pending_change ?? null;
  const action = paid && subscription ? classifyBillingOfferChange(subscription, selection) : null;
  const purchaseAllowed =
    !paid &&
    getBillingFirstPurchaseEligibility(billing).allowed &&
    canCheckoutToBillingPlan(billing, selection.target_plan);
  const busy = phase !== null;
  const blocked =
    busy ||
    (paid && (loadingStatus || statusError !== null || subscription === null || pending !== null));
  const fieldsLocked = blocked || paymentUrl !== null || attemptConfirmed;
  const price = getBillingCatalogPrice(selection.target_plan, selection.interval, "plan");
  const intervalWord = selection.interval === "year" ? "year" : "month";
  const close = (): void => {
    if (inFlight.current) return;
    dialogVersion.current += 1;
    setOpen(false);
  };
  const refreshParent = (): void => {
    void Promise.resolve()
      .then(() => props.onRefresh())
      .catch(() => undefined);
  };
  const alive = (version: number): boolean => mounted.current && version === dialogVersion.current;

  async function preview(): Promise<void> {
    if (inFlight.current || !action || blocked) return;
    inFlight.current = true;
    const version = dialogVersion.current;
    setPhase("preview");
    setError(null);
    try {
      const result =
        action === "upgrade"
          ? await previewBillingOfferUpgrade(selection)
          : await previewBillingOfferChange(selection);
      if (!alive(version)) return;
      if ("payment_url" in result) {
        setPaymentUrl(result.payment_url);
        setQuote(null);
      } else if (
        result.quote.target_plan === selection.target_plan &&
        result.quote.interval === selection.interval &&
        result.quote.action === action
      )
        setQuote(result.quote);
      else setError("The offer changed. Review the selection and refresh the quote.");
    } catch {
      if (alive(version))
        setError(
          "Could not prepare this change. Resolve an existing payment or scheduled change, then retry."
        );
    } finally {
      inFlight.current = false;
      if (alive(version)) setPhase(null);
    }
  }
  async function checkout(): Promise<void> {
    if (inFlight.current || !purchaseAllowed) return;
    inFlight.current = true;
    const version = dialogVersion.current;
    setPhase("checkout");
    setError(null);
    try {
      props.onBeforeCheckout?.(selection.target_plan);
      attemptSource.current = billingSource;
      setAttemptConfirmed(true);
      const url = await startBillingOfferCheckout(selection);
      if (alive(version)) props.onNavigate(url);
    } catch {
      if (alive(version))
        setError(
          "Checkout could not be confirmed. Retry the same selected offer to reconcile the original request."
        );
    } finally {
      inFlight.current = false;
      if (alive(version)) setPhase(null);
    }
  }
  async function confirm(): Promise<void> {
    if (!quote || inFlight.current) return;
    if (!quote.resume_required && Date.parse(quote.expires_at) <= Date.now()) {
      setQuote(null);
      setError("The quote expired. Review the change again before confirming.");
      return;
    }
    inFlight.current = true;
    const version = dialogVersion.current;
    setPhase("confirm");
    setError(null);
    try {
      attemptSource.current = billingSource;
      setAttemptConfirmed(true);
      if (quote.action === "upgrade") {
        props.onBeforeCheckout?.(quote.target_plan);
        const url = await startBillingOfferCheckout(
          { target_plan: quote.target_plan, interval: quote.interval },
          quote.confirmation_token
        );
        if (!alive(version)) return;
        if (new URL(url).hostname === "invoice.stripe.com") {
          setQuote(null);
          setPaymentUrl(url);
        } else props.onNavigate(url);
      } else {
        const result = await scheduleBillingOfferChange(quote.confirmation_token);
        if (!alive(version)) return;
        setStatus((previous) =>
          previous ? { ...previous, pending_change: result.pending_change } : previous
        );
        setOpen(false);
        setAttemptConfirmed(false);
        setQuote(null);
        attemptSource.current = null;
        dialogVersion.current += 1;
        refreshParent();
      }
    } catch (reason) {
      if (alive(version)) {
        if (
          reason instanceof Error &&
          ["upgrade_confirmation_required", "plan_change_confirmation_required"].includes(
            reason.message
          )
        ) {
          setQuote(null);
          setError("The quote changed or expired. Review the change again.");
          setAttemptConfirmed(false);
        } else setError("Confirmation is uncertain. Retry to check the same saved request.");
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setPhase(null);
    }
  }
  async function cancelPending(): Promise<void> {
    if (!pending || inFlight.current) return;
    inFlight.current = true;
    setPhase("cancel");
    setError(null);
    reads.current += 1;
    try {
      const result = await cancelBillingOfferChange(pending.schedule_id);
      if (!mounted.current) return;
      setStatus((previous) =>
        previous ? { ...previous, pending_change: result.pending_change } : previous
      );
      setQuote(null);
      setAttemptConfirmed(false);
      attemptSource.current = null;
      refreshParent();
    } catch {
      if (mounted.current)
        setError("Cancellation could not be confirmed. Retry to reconcile the same schedule.");
    } finally {
      inFlight.current = false;
      if (mounted.current) {
        setPhase(null);
        setLoadingStatus(false);
      }
    }
  }
  const pendingNotice = pending ? (
    <CalloutCard
      eyebrow="Scheduled change"
      title={`${formatPlanName(pending.target_plan)}, billed ${pending.interval === "year" ? "yearly" : "monthly"}, from ${formatBillingTerm(pending.effective_at)}`}
      description="Your current plan remains active until the paid term ends."
      tone="neutral"
    >
      <PendingButton
        variant="outline"
        pending={phase === "cancel"}
        pendingLabel="Checking cancellation…"
        disabled={busy || loadingStatus}
        onClick={() => void cancelPending()}
      >
        Keep current plan
      </PendingButton>
    </CalloutCard>
  ) : null;
  const statusFailure = statusError ? (
    <div>
      <p role="alert">{statusError}</p>
      <PendingButton
        variant="outline"
        pending={loadingStatus}
        pendingLabel="Refreshing terms…"
        onClick={() => void loadStatus()}
      >
        Retry subscription terms
      </PendingButton>
    </div>
  ) : null;
  return (
    <div className="flex flex-col gap-3">
      {subscription ? (
        <div className="flex flex-col gap-1 text-sm">
          <p>
            Billed {subscription.interval === "year" ? "yearly" : "monthly"}
            {subscription.base_amount_minor === null ? (
              ""
            ) : (
              <>
                <MetadataSeparator />
                {formatBillingAmount(subscription.base_amount_minor)}/
                {subscription.interval === "year" ? "year" : "month"} base
              </>
            )}
          </p>
          <p className="text-muted-foreground">
            Paid term: {formatBillingTerm(subscription.term_starts_at)} –{" "}
            {formatBillingTerm(subscription.term_ends_at)}. Allowances reset monthly.
          </p>
          {subscription.additional_capacity_units > 0 &&
          subscription.capacity_unit_amount_minor !== null ? (
            <p className="text-muted-foreground">
              {subscription.additional_capacity_units} extra units at{" "}
              {formatBillingAmount(subscription.capacity_unit_amount_minor)}/
              {subscription.interval === "year" ? "year" : "month"} each, before tax.
            </p>
          ) : null}
        </div>
      ) : null}
      {!open ? statusFailure : null}
      {!open && error ? <p role="alert">{error}</p> : null}
      {!open ? pendingNotice : null}
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!value) close();
        }}
      >
        <DialogTrigger asChild>
          <Button
            variant="outline"
            disabled={busy}
            className="self-start"
            onClick={() => openForPlan()}
          >
            {paid ? "Change plan or billing interval" : "Choose a paid plan"}
          </Button>
        </DialogTrigger>
        <DialogContent
          size="lg"
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain"
        >
          <DialogHeader>
            <DialogTitle>Change subscription</DialogTitle>
            <DialogDescription>
              Choose a plan and payment interval. Monthly allowances stay the same with yearly
              billing.
            </DialogDescription>
          </DialogHeader>
          {pendingNotice ?? (
            <>
              <FieldGroup>
                <Field data-disabled={fieldsLocked}>
                  <FieldLabel id="billing-offer-plan-label">Plan</FieldLabel>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    aria-labelledby="billing-offer-plan-label"
                    value={selection.target_plan}
                    disabled={fieldsLocked}
                    onValueChange={(value) => {
                      if (isPaidTier(value)) {
                        setSelection((previous) => ({ ...previous, target_plan: value }));
                        setQuote(null);
                        setError(null);
                      }
                    }}
                  >
                    <ToggleGroupItem value="solo">Solo</ToggleGroupItem>
                    <ToggleGroupItem value="team">Team</ToggleGroupItem>
                    <ToggleGroupItem value="business">Business</ToggleGroupItem>
                  </ToggleGroup>
                  {paid ? (
                    <FieldDescription>
                      To return to Free, cancel through Manage subscription. Saved configuration is
                      retained; data remains subject to Free limits and normal retention.
                    </FieldDescription>
                  ) : null}
                </Field>
                <Field data-disabled={fieldsLocked}>
                  <FieldLabel id="billing-offer-interval-label">Billing interval</FieldLabel>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    aria-labelledby="billing-offer-interval-label"
                    value={selection.interval}
                    disabled={fieldsLocked}
                    onValueChange={(value) => {
                      if (value === "month" || value === "year") {
                        setIntervalTouched(true);
                        setSelection((previous) => ({ ...previous, interval: value }));
                        setQuote(null);
                        setError(null);
                      }
                    }}
                  >
                    <ToggleGroupItem value="month">Monthly</ToggleGroupItem>
                    <ToggleGroupItem value="year">Yearly</ToggleGroupItem>
                  </ToggleGroup>
                  <FieldDescription>
                    Save with yearly billing. Prices exclude applicable tax.
                  </FieldDescription>
                </Field>
              </FieldGroup>
              {!quote && !paymentUrl ? (
                <div className="flex flex-col gap-2">
                  <p className="font-medium">
                    {formatBillingAmount(price.amount_minor)}/{intervalWord} base
                    {selection.interval === "year" ? (
                      <>
                        <MetadataSeparator />
                        equivalent to {formatBillingAmount(price.amount_minor / 12)}/month
                      </>
                    ) : (
                      ""
                    )}
                  </p>
                  <p>
                    {getTierCapabilities(selection.target_plan).included_capacity_units} included
                    capacity units.{" "}
                    {paid
                      ? "Existing extra units are retained; the quote includes their new price."
                      : "Add extra units after paid conversion."}
                  </p>
                  {paid && action === null && !blocked ? (
                    <p>Choose a different plan or billing interval to review a change.</p>
                  ) : null}
                  {!paid && !purchaseAllowed ? (
                    <p>
                      Paid purchases open after seven full trial days. Eligible plan options are
                      shown above.
                    </p>
                  ) : null}
                </div>
              ) : null}
              {quote ? <BillingOfferSummary quote={quote} currentPlan={billing.plan} /> : null}
              {paymentUrl ? (
                <>
                  <p>
                    Your payment is waiting. Current access stays active until payment completes.
                  </p>
                  <BillingPaymentContinuation url={paymentUrl} onContinue={() => setOpen(false)} />
                </>
              ) : null}
            </>
          )}
          {statusFailure}
          {loadingStatus && paid ? <p role="status">Checking subscription terms…</p> : null}
          {error ? <p role="alert">{error}</p> : null}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={close}>
              {paymentUrl ? "Close" : "Cancel"}
            </Button>
            {pending || paymentUrl ? null : quote ? (
              <PendingButton
                pending={phase === "confirm"}
                pendingLabel="Checking confirmed change…"
                disabled={blocked}
                onClick={() => void confirm()}
              >
                {quote.action === "upgrade" ? "Confirm upgrade" : "Schedule change"}
              </PendingButton>
            ) : paid ? (
              <PendingButton
                pending={phase === "preview"}
                pendingLabel="Preparing quote…"
                disabled={blocked || action === null}
                onClick={() => void preview()}
              >
                Review change
              </PendingButton>
            ) : (
              <PendingButton
                pending={phase === "checkout"}
                pendingLabel="Opening checkout…"
                disabled={busy || !purchaseAllowed}
                onClick={() => void checkout()}
              >
                Continue to Stripe
              </PendingButton>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
