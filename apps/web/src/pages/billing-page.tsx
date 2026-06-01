import { CheckCircle2Icon, CreditCardIcon, InfoIcon, LoaderCircleIcon, XCircleIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MAX_BILLING_ADDITIONAL_CAPACITY_UNITS } from "../../../../packages/shared-types/src/index.js";
import { CalloutCard } from "../components/system/callout-card.js";
import { PageHeader } from "../components/system/page-header.js";
import { PlanBadge } from "../components/system/plan-badge.js";
import { UsageMeter } from "../components/system/usage-meter.js";
import { Button } from "../components/ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card.js";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog.js";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "../components/ui/field.js";
import { Input } from "../components/ui/input.js";
import { Skeleton } from "../components/ui/skeleton.js";
import {
  cancelBillingCapacityReduction,
  confirmBillingCheckout,
  getBillingSummary,
  isInvalidSessionError,
  increaseBillingCapacity,
  openBillingPortal,
  scheduleBillingCapacityReduction,
  startBillingCheckout,
  type BillingSummaryRecord
} from "../lib/api.js";
import { showErrorToast, showSuccessToast } from "../lib/notify.js";
import { useDelayedVisibility } from "../lib/use-delayed-visibility.js";
import { useSession } from "../lib/session.js";

interface PendingBillingCheckout {
  previousPlan: BillingSummaryRecord["plan"];
  targetPlan: "solo" | "team";
}

const BILLING_CHECKOUT_STORAGE_KEY = "debugbundle.billing.checkout";
const BILLING_CHECKOUT_POLL_INTERVAL_MS = 250;
const BILLING_CHECKOUT_MAX_POLL_ATTEMPTS = 6;

type CheckoutReturnStatus = "syncing" | "success" | "delayed" | "canceled" | "error";

interface CheckoutReturnDialogState {
  status: CheckoutReturnStatus;
  plan?: BillingSummaryRecord["plan"];
}

export function readPendingBillingCheckout(): PendingBillingCheckout | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.sessionStorage.getItem(BILLING_CHECKOUT_STORAGE_KEY);
  if (rawValue === null) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as Partial<PendingBillingCheckout>;
    if (
      (parsedValue.previousPlan === "free" || parsedValue.previousPlan === "solo" || parsedValue.previousPlan === "team") &&
      (parsedValue.targetPlan === "solo" || parsedValue.targetPlan === "team")
    ) {
      return {
        previousPlan: parsedValue.previousPlan,
        targetPlan: parsedValue.targetPlan
      };
    }
  } catch {
    return null;
  }

  return null;
}

export function writePendingBillingCheckout(checkout: PendingBillingCheckout): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(BILLING_CHECKOUT_STORAGE_KEY, JSON.stringify(checkout));
}

export function clearPendingBillingCheckout(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(BILLING_CHECKOUT_STORAGE_KEY);
}

export function billingReflectsCheckout(
  billing: BillingSummaryRecord,
  pendingCheckout: PendingBillingCheckout | null,
  baseline: BillingSummaryRecord | null
): boolean {
  if (pendingCheckout !== null) {
    return billing.plan === pendingCheckout.targetPlan;
  }

  if (baseline === null) {
    return false;
  }

  return billing.plan !== baseline.plan || billing.stripe_customer_id !== baseline.stripe_customer_id;
}

export function formatPlanName(plan: BillingSummaryRecord["plan"]): string {
  switch (plan) {
    case "solo":
      return "Solo";
    case "team":
      return "Team";
    default:
      return "Free";
  }
}

interface CapacityDialogProps {
  billing: BillingSummaryRecord;
  canChangeBilling: boolean;
  open: boolean;
  onOpenChange(nextOpen: boolean): void;
  onBillingChange(nextBilling: BillingSummaryRecord): void;
}

export function CapacityDialog(props: CapacityDialogProps): JSX.Element {
  const [increaseTarget, setIncreaseTarget] = useState(
    String(Math.min(props.billing.capacity_units.additional_purchased + 1, MAX_BILLING_ADDITIONAL_CAPACITY_UNITS))
  );
  const [reductionTarget, setReductionTarget] = useState(String(Math.max(props.billing.capacity_units.additional_purchased - 1, 0)));
  const [activeAction, setActiveAction] = useState<"increase" | "reduce" | "cancel" | null>(null);

  useEffect(() => {
    if (!props.open) {
      return;
    }

    setIncreaseTarget(String(Math.min(props.billing.capacity_units.additional_purchased + 1, MAX_BILLING_ADDITIONAL_CAPACITY_UNITS)));
    setReductionTarget(
      String(props.billing.capacity_units.pending_reduction?.additional_purchased ?? Math.max(props.billing.capacity_units.additional_purchased - 1, 0))
    );
  }, [props.billing, props.open]);

  const currentAdditionalCapacityUnits = props.billing.capacity_units.additional_purchased;
  const pendingReduction = props.billing.capacity_units.pending_reduction ?? null;
  const parsedIncreaseTarget = Number.parseInt(increaseTarget, 10);
  const parsedReductionTarget = Number.parseInt(reductionTarget, 10);

  async function handleIncrease(): Promise<void> {
    if (!props.canChangeBilling) {
      return;
    }

    setActiveAction("increase");

    try {
      const nextBilling = await increaseBillingCapacity(parsedIncreaseTarget);
      props.onBillingChange(nextBilling);
      showSuccessToast("Allowance capacity increased successfully.");
    } catch (error) {
      if (error instanceof Error && error.message === "pending_capacity_reduction_exists") {
        showErrorToast("Cancel the scheduled reduction before adding more capacity units.");
      } else if (error instanceof Error && error.message === "invalid_target_quantity") {
        showErrorToast("Choose a unit count above your current purchased quantity.");
      } else {
        showErrorToast("Could not update allowance capacity right now.");
      }
    } finally {
      setActiveAction(null);
    }
  }

  async function handleScheduleReduction(): Promise<void> {
    if (!props.canChangeBilling) {
      return;
    }

    setActiveAction("reduce");

    try {
      const nextBilling = await scheduleBillingCapacityReduction(parsedReductionTarget);
      props.onBillingChange(nextBilling);
      showSuccessToast("Capacity reduction scheduled successfully.");
    } catch (error) {
      if (error instanceof Error && error.message === "invalid_target_quantity") {
        showErrorToast("Choose a unit count below your current purchased quantity.");
      } else {
        showErrorToast("Could not schedule the capacity reduction.");
      }
    } finally {
      setActiveAction(null);
    }
  }

  async function handleCancelReduction(): Promise<void> {
    setActiveAction("cancel");

    try {
      const nextBilling = await cancelBillingCapacityReduction();
      props.onBillingChange(nextBilling);
      showSuccessToast("Scheduled capacity reduction cancelled successfully.");
    } catch {
      showErrorToast("Could not cancel the scheduled reduction.");
    } finally {
      setActiveAction(null);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={(open) => props.onOpenChange(open)}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" disabled={!props.canChangeBilling}>
          Manage capacity
        </Button>
      </DialogTrigger>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Manage allowance capacity</DialogTitle>
          <DialogDescription>
            Extra units expand shared allowance capacity immediately. Reductions stay active until the current paid window ends.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardContent className="space-y-1 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Included</p>
              <p className="text-xl font-semibold">{props.billing.capacity_units.included}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-1 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Purchased now</p>
              <p className="text-xl font-semibold">{currentAdditionalCapacityUnits}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-1 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Allowance units</p>
              <p className="text-xl font-semibold">{props.billing.capacity_units.total}</p>
              <p className="text-xs text-muted-foreground">{formatActiveProjectCount(props.billing.active_projects)}</p>
            </CardContent>
          </Card>
        </div>

        {pendingReduction === null ? null : (
          <CalloutCard
            eyebrow="Scheduled reduction"
            title={`Dropping to ${pendingReduction.total} total units on ${formatDate(pendingReduction.effective_at)}`}
            description={`Your current allowance stays active until renewal. After that, you will keep ${pendingReduction.additional_purchased} purchased units.`}
            tone="neutral"
          />
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Add capacity now</CardTitle>
              <CardDescription>Charge the prorated difference now and expand allowance capacity immediately.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="billing-slot-increase">Purchased extra units</FieldLabel>
                  <Input
                    id="billing-slot-increase"
                    type="number"
                    min={currentAdditionalCapacityUnits + 1}
                    max={MAX_BILLING_ADDITIONAL_CAPACITY_UNITS}
                    step={1}
                    value={increaseTarget}
                    onChange={(event) => setIncreaseTarget(event.currentTarget.value)}
                  />
                  <FieldDescription>
                    Enter the total purchased extra units you want active right away, up to {MAX_BILLING_ADDITIONAL_CAPACITY_UNITS}.
                  </FieldDescription>
                </Field>
              </FieldGroup>
              <Button
                type="button"
                className="w-full"
                disabled={
                  !props.canChangeBilling ||
                  pendingReduction !== null ||
                  activeAction !== null ||
                  Number.isNaN(parsedIncreaseTarget) ||
                  parsedIncreaseTarget > MAX_BILLING_ADDITIONAL_CAPACITY_UNITS ||
                  parsedIncreaseTarget <= currentAdditionalCapacityUnits
                }
                onClick={() => void handleIncrease()}
              >
                {activeAction === "increase" ? "Updating units..." : "Increase capacity now"}
              </Button>
              {pendingReduction === null ? null : (
                <p className="text-sm text-muted-foreground">
                  Cancel the scheduled reduction first if you want to add more capacity immediately.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Reduce on renewal</CardTitle>
              <CardDescription>Keep your current allowance until {formatDate(props.billing.usage_window.ends_at)}, then lower it at renewal.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="billing-slot-reduction">Purchased extra units after renewal</FieldLabel>
                  <Input
                    id="billing-slot-reduction"
                    type="number"
                    min={0}
                    max={Math.max(currentAdditionalCapacityUnits - 1, 0)}
                    step={1}
                    value={reductionTarget}
                    onChange={(event) => setReductionTarget(event.currentTarget.value)}
                    disabled={currentAdditionalCapacityUnits === 0}
                  />
                  <FieldDescription>
                    The current subscription stays unchanged until the next paid period begins.
                  </FieldDescription>
                </Field>
              </FieldGroup>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  type="button"
                  className="flex-1"
                  disabled={
                    !props.canChangeBilling ||
                    currentAdditionalCapacityUnits === 0 ||
                    activeAction !== null ||
                    Number.isNaN(parsedReductionTarget) ||
                    parsedReductionTarget < 0 ||
                    parsedReductionTarget >= currentAdditionalCapacityUnits
                  }
                  onClick={() => void handleScheduleReduction()}
                >
                  {activeAction === "reduce" ? "Saving schedule..." : pendingReduction === null ? "Schedule reduction" : "Update scheduled reduction"}
                </Button>
                {pendingReduction === null ? null : (
                  <Button type="button" variant="outline" disabled={activeAction !== null} onClick={() => void handleCancelReduction()}>
                    {activeAction === "cancel" ? "Cancelling..." : "Keep current units"}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}

export function CheckoutReturnDialog(props: {
  state: CheckoutReturnDialogState | null;
  onOpenChange(open: boolean): void;
}): JSX.Element | null {
  const state = props.state;
  if (state === null) {
    return null;
  }

  const iconClassName = "size-5";
  const content = (() => {
    switch (state.status) {
      case "syncing":
        return {
          icon: <LoaderCircleIcon className={`${iconClassName} animate-spin`} aria-hidden="true" />,
          title: "Confirming your subscription",
          description: "Stripe accepted the payment. DebugBundle is verifying the Checkout Session and updating your account.",
          primary: "This usually finishes in a few seconds."
        };
      case "success":
        return {
          icon: <CheckCircle2Icon className={iconClassName} aria-hidden="true" />,
          title: `${formatPlanName(state.plan ?? "free")} is active`,
          description: "Your billing state is updated and the new tier is available across this account.",
          primary: "You can keep working with the updated allowances now."
        };
      case "delayed":
        return {
          icon: <InfoIcon className={iconClassName} aria-hidden="true" />,
          title: "Payment received",
          description: "Stripe accepted the payment, but the subscription update has not reached DebugBundle yet.",
          primary: "Keep this page open and refresh billing in a moment. If the tier still does not change, the Stripe webhook needs attention."
        };
      case "canceled":
        return {
          icon: <XCircleIcon className={iconClassName} aria-hidden="true" />,
          title: "Checkout canceled",
          description: "No payment was completed and your plan has not changed.",
          primary: "You can start checkout again whenever you are ready."
        };
      case "error":
        return {
          icon: <InfoIcon className={iconClassName} aria-hidden="true" />,
          title: "Could not confirm billing yet",
          description: "Stripe redirected back successfully, but DebugBundle could not verify the Checkout Session right now.",
          primary: "Your payment may still be valid. Refresh billing shortly, or check the Stripe webhook configuration."
        };
    }
  })();

  return (
    <Dialog open={state !== null} onOpenChange={(open) => props.onOpenChange(open)}>
      <DialogContent size="md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
              {content.icon}
            </div>
            <div className="space-y-2">
              <DialogTitle>{content.title}</DialogTitle>
              <DialogDescription>{content.description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
          {content.primary}
        </div>

        {state.status === "syncing" ? null : <DialogFooter showCloseButton />}
      </DialogContent>
    </Dialog>
  );
}

export function BillingPage(): JSX.Element {
  const { refreshSession } = useSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const [billing, setBilling] = useState<BillingSummaryRecord | null>(null);
  const [isForbidden, setIsForbidden] = useState(false);
  const [activeCheckoutPlan, setActiveCheckoutPlan] = useState<"solo" | "team" | null>(null);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [isCapacityDialogOpen, setIsCapacityDialogOpen] = useState(false);
  const [checkoutReturnDialog, setCheckoutReturnDialog] = useState<CheckoutReturnDialogState | null>(null);
  const showBillingLoading = useDelayedVisibility(billing === null && !isForbidden);
  const checkoutStatus = searchParams.get("checkout");
  const checkoutSessionId = searchParams.get("session_id");

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;

    const clearCheckoutReturn = (): void => {
      clearPendingBillingCheckout();
      setSearchParams((currentParams) => {
        const nextParams = new URLSearchParams(currentParams);
        nextParams.delete("checkout");
        nextParams.delete("session_id");
        return nextParams;
      }, { replace: true });
    };

    const loadBillingSummary = async (): Promise<BillingSummaryRecord | null> => {
      try {
        const nextBilling = await getBillingSummary();
        if (cancelled) {
          return null;
        }

        setBilling(nextBilling);
        setIsForbidden(false);
        return nextBilling;
      } catch (error) {
        if (cancelled) {
          return null;
        }

        if (error instanceof Error && error.message === "forbidden") {
          setIsForbidden(true);
          return null;
        }

        if (isInvalidSessionError(error)) {
          return null;
        }

        throw error;
      }
    };

    const pendingCheckout = checkoutStatus === "success" ? readPendingBillingCheckout() : null;

    const completeCheckoutReturn = (nextBilling: BillingSummaryRecord): void => {
      setBilling(nextBilling);
      if (cancelled) {
        return;
      }

      setCheckoutReturnDialog({ status: "success", plan: nextBilling.plan });
      clearCheckoutReturn();
      void refreshSession().catch(() => undefined);
    };

    const pollForCheckoutUpdate = async (baseline: BillingSummaryRecord, attemptsRemaining: number): Promise<void> => {
      const nextBilling = await loadBillingSummary();
      if (cancelled || nextBilling === null) {
        clearCheckoutReturn();
        return;
      }

      if (billingReflectsCheckout(nextBilling, pendingCheckout, baseline)) {
        completeCheckoutReturn(nextBilling);
        return;
      }

      if (attemptsRemaining <= 0) {
        setCheckoutReturnDialog({ status: "delayed" });
        clearCheckoutReturn();
        return;
      }

      pollTimer = setTimeout(() => {
        void pollForCheckoutUpdate(baseline, attemptsRemaining - 1);
      }, BILLING_CHECKOUT_POLL_INTERVAL_MS);
    };

    void (async () => {
      const initialBilling = await loadBillingSummary();
      if (cancelled || checkoutStatus === null) {
        return;
      }

      if (checkoutStatus === "canceled") {
        setCheckoutReturnDialog({ status: "canceled" });
        clearCheckoutReturn();
        return;
      }

      if (checkoutStatus !== "success" || initialBilling === null) {
        clearCheckoutReturn();
        return;
      }

      setCheckoutReturnDialog({ status: "syncing" });

      if (checkoutSessionId !== null) {
        try {
          const confirmedBilling = await confirmBillingCheckout(checkoutSessionId);
          if (cancelled) {
            return;
          }

          completeCheckoutReturn(confirmedBilling);
          return;
        } catch {
          if (cancelled) {
            return;
          }
        }
      }

      if (billingReflectsCheckout(initialBilling, pendingCheckout, null)) {
        completeCheckoutReturn(initialBilling);
        return;
      }

      await pollForCheckoutUpdate(initialBilling, BILLING_CHECKOUT_MAX_POLL_ATTEMPTS);
    })();

    return () => {
      cancelled = true;
      if (pollTimer !== undefined) {
        clearTimeout(pollTimer);
      }
    };
  }, [checkoutSessionId, checkoutStatus, refreshSession, setSearchParams]);

  async function handleCheckout(targetPlan: "solo" | "team"): Promise<void> {
    setActiveCheckoutPlan(targetPlan);

    if (billing !== null) {
      writePendingBillingCheckout({
        previousPlan: billing.plan,
        targetPlan
      });
    }

    try {
      const url = await startBillingCheckout(targetPlan);
      window.location.assign(url);
    } catch {
      clearPendingBillingCheckout();
      showErrorToast("Billing checkout is unavailable right now.");
    } finally {
      setActiveCheckoutPlan(null);
    }
  }

  async function handlePortal(): Promise<void> {
    setIsOpeningPortal(true);

    try {
      const url = await openBillingPortal();
      window.location.assign(url);
    } catch {
      showErrorToast("Subscription management is unavailable right now.");
    } finally {
      setIsOpeningPortal(false);
    }
  }

  const canChangeBilling = billing !== null;
  const isBillingManagedInternally = billing !== null && billing.plan !== "free" && billing.stripe_customer_id === null;
  const canManageStripeBilling = canChangeBilling && !isBillingManagedInternally;
  const pendingReduction = billing?.capacity_units.pending_reduction ?? null;

  return (
    <div className="space-y-8">
      <CheckoutReturnDialog state={checkoutReturnDialog} onOpenChange={(open) => {
        if (!open) {
          setCheckoutReturnDialog(null);
        }
      }} />

      <PageHeader description="" />

      {isForbidden ? (
        <CalloutCard
          eyebrow="Owner scope"
          title="Owner permissions are required to manage billing"
          description="Members can keep using incidents, projects, and tokens, but billing stays owner-only."
          tone="warning"
        />
      ) : billing === null ? (
        showBillingLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : null
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <Card>
              <CardHeader>
                <CardTitle>Current plan</CardTitle>
                <CardDescription>Current plan and allowance capacity for this account.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Current plan</p>
                    <div className="flex items-center gap-3">
                      <PlanBadge plan={billing.plan} />
                      <span className="text-sm text-muted-foreground">
                        {formatActiveProjectCount(billing.active_projects)} • {formatAllowanceUnitCount(billing.capacity_units.total)}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {billing.plan === "free" ? (
                      <>
                        <Button type="button" disabled={!canChangeBilling || activeCheckoutPlan !== null} onClick={() => void handleCheckout("solo")}>
                          <CreditCardIcon data-icon="inline-start" />
                          {activeCheckoutPlan === "solo" ? "Opening checkout..." : "Upgrade to Solo"}
                        </Button>
                        <Button type="button" variant="outline" disabled={!canChangeBilling || activeCheckoutPlan !== null} onClick={() => void handleCheckout("team")}>
                          Upgrade to Team
                        </Button>
                      </>
                    ) : isBillingManagedInternally ? null : billing.plan === "solo" ? (
                      <>
                        <Button type="button" disabled={!canManageStripeBilling || isOpeningPortal} onClick={() => void handlePortal()}>
                          <CreditCardIcon data-icon="inline-start" />
                          {isOpeningPortal ? "Opening portal..." : "Manage subscription"}
                        </Button>
                        <Button type="button" variant="outline" disabled={!canManageStripeBilling || activeCheckoutPlan !== null} onClick={() => void handleCheckout("team")}>
                          Upgrade to Team
                        </Button>
                      </>
                    ) : (
                      <Button type="button" disabled={!canManageStripeBilling || isOpeningPortal} onClick={() => void handlePortal()}>
                        <CreditCardIcon data-icon="inline-start" />
                        {isOpeningPortal ? "Opening portal..." : "Manage subscription"}
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <CalloutCard
                    eyebrow="Allowance units"
                    title="Allowance capacity"
                    description={`Projects stay unlimited. This account currently has ${formatActiveProjectCount(billing.active_projects)}. Included and purchased units expand the shared monthly allowance.`}
                    tone="neutral"
                  />
                  <CalloutCard
                    eyebrow="Usage window"
                    title="Billing window"
                    description={`Current window: ${formatDate(billing.usage_window.starts_at)} to ${formatDate(billing.usage_window.ends_at)}.`}
                    tone="neutral"
                  />
                </div>

                {pendingReduction === null ? null : (
                  <CalloutCard
                    eyebrow="Scheduled reduction"
                    title={`Dropping to ${pendingReduction.total} total units on ${formatDate(pendingReduction.effective_at)}`}
                    description={`Projects stay unlimited. After renewal, you will keep ${pendingReduction.additional_purchased} purchased units and the shared allowance will shrink.`}
                    tone="neutral"
                  />
                )}
                {isBillingManagedInternally ? (
                  <CalloutCard
                    eyebrow="Internal plan"
                    title="Billing is managed internally"
                    description="This account has an internal plan override, so Stripe checkout and subscription management are not used."
                    tone="neutral"
                  />
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1.5">
                  <CardTitle>Allowance capacity</CardTitle>
                  <CardDescription>Included and purchased units set the size of the hosted allowance.</CardDescription>
                </div>
                {billing.plan === "free" || isBillingManagedInternally ? null : (
                  <CapacityDialog
                    billing={billing}
                    canChangeBilling={canManageStripeBilling}
                    open={isCapacityDialogOpen}
                    onOpenChange={setIsCapacityDialogOpen}
                    onBillingChange={setBilling}
                  />
                )}
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Included units</p>
                  <p className="font-medium">{billing.capacity_units.included}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Additional purchased units</p>
                  <p className="font-medium">{billing.capacity_units.additional_purchased}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Active projects</p>
                  <p className="font-medium">{billing.active_projects}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Total allowance units</p>
                  <p className="font-medium">{billing.capacity_units.total}</p>
                </div>
                {pendingReduction === null ? null : (
                  <div>
                    <p className="text-muted-foreground">Scheduled allowance</p>
                    <p className="font-medium">{pendingReduction.total} total units on {formatDate(pendingReduction.effective_at)}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Allowance usage</CardTitle>
              <CardDescription>Monthly usage across the full account.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 lg:grid-cols-2">
              <UsageMeter
                label="Bundle requests"
                used={billing.allowances.monthly_bundle_requests.used}
                limit={billing.allowances.monthly_bundle_requests.limit}
                description="Generated bundle requests in the current billing window."
              />
              <UsageMeter
                label="Raw ingested events"
                used={billing.allowances.monthly_raw_ingested_events.used}
                limit={billing.allowances.monthly_raw_ingested_events.limit}
                description="Accepted event volume counting against the shared allowance."
              />
              <UsageMeter
                label="Retained bundles"
                used={billing.allowances.retained_bundle_cap.used}
                limit={billing.allowances.retained_bundle_cap.limit}
                description="Current retained bundle inventory for the account."
              />
              <UsageMeter
                label="Remote activations"
                used={billing.allowances.monthly_remote_activations.used}
                limit={billing.allowances.monthly_remote_activations.limit}
                description="Remote probe activations issued this month."
              />
              <UsageMeter
                label="Alert deliveries"
                used={billing.allowances.monthly_alert_deliveries.used}
                limit={billing.allowances.monthly_alert_deliveries.limit}
                description="Alert deliveries sent this month."
              />
              <UsageMeter
                label="Webhook deliveries"
                used={billing.allowances.monthly_webhook_deliveries.used}
                limit={billing.allowances.monthly_webhook_deliveries.limit}
                description="Lifecycle webhook deliveries created this month."
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

export function formatActiveProjectCount(value: number): string {
  return `${value} active ${value === 1 ? "project" : "projects"}`;
}

export function formatAllowanceUnitCount(value: number): string {
  return `${value} allowance ${value === 1 ? "unit" : "units"}`;
}
