import { CreditCardIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CalloutCard } from "../components/system/callout-card.js";
import { PageHeader } from "../components/system/page-header.js";
import { PlanBadge } from "../components/system/plan-badge.js";
import { UsageMeter } from "../components/system/usage-meter.js";
import { Button } from "../components/ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card.js";
import { Skeleton } from "../components/ui/skeleton.js";
import {
  confirmBillingCheckout,
  getBillingSummary,
  isInvalidSessionError,
  openBillingPortal,
  startBillingCheckout,
  startBillingTrial,
  type BillingSummaryRecord
} from "../lib/api.js";
import { showErrorToast, showSuccessToast } from "../lib/notify.js";
import { useSession } from "../lib/session.js";
import { useDelayedVisibility } from "../lib/use-delayed-visibility.js";
import { RawIngestedEventsBreakdownDialog } from "./billing-usage-breakdown-dialog.js";
import { CapacityDialog, CheckoutReturnDialog, type CheckoutReturnDialogState } from "./billing-page-dialogs.js";
import {
  billingReflectsCheckout,
  clearPendingBillingCheckout,
  formatActiveProjectCount,
  formatAllowanceUnitCount,
  formatDate,
  formatPlanName,
  formatTrialDaysRemaining,
  readPendingBillingCheckout,
  resolveRequestedTrialPlan,
  writePendingBillingCheckout
} from "./billing-page-helpers.js";

const BILLING_CHECKOUT_POLL_INTERVAL_MS = 250;
const BILLING_CHECKOUT_MAX_POLL_ATTEMPTS = 6;

export function BillingPage(): JSX.Element {
  const { refreshSession } = useSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const [billing, setBilling] = useState<BillingSummaryRecord | null>(null);
  const [isForbidden, setIsForbidden] = useState(false);
  const [activeCheckoutPlan, setActiveCheckoutPlan] = useState<"solo" | "team" | null>(null);
  const [activeTrialStartPlan, setActiveTrialStartPlan] = useState<"solo" | "team" | null>(null);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [isCapacityDialogOpen, setIsCapacityDialogOpen] = useState(false);
  const [isRawIngestBreakdownOpen, setIsRawIngestBreakdownOpen] = useState(false);
  const [checkoutReturnDialog, setCheckoutReturnDialog] = useState<CheckoutReturnDialogState | null>(null);
  const showBillingLoading = useDelayedVisibility(billing === null && !isForbidden);
  const checkoutStatus = searchParams.get("checkout");
  const checkoutSessionId = searchParams.get("session_id");
  const requestedTrialPlan = resolveRequestedTrialPlan(searchParams.get("trial"));

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

  async function handleStartTrial(targetPlan: "solo" | "team"): Promise<void> {
    setActiveTrialStartPlan(targetPlan);

    try {
      const nextBilling = await startBillingTrial(targetPlan);
      setBilling(nextBilling);
      showSuccessToast(`${formatPlanName(targetPlan)} trial started successfully.`);
      setSearchParams((currentParams) => {
        const nextParams = new URLSearchParams(currentParams);
        nextParams.set("trial", targetPlan);
        return nextParams;
      }, { replace: true });
    } catch (error) {
      if (error instanceof Error && error.message === "trial_unavailable") {
        showErrorToast("This account can no longer start a free trial.");
      } else if (error instanceof Error && error.message === "billing_not_found") {
        showErrorToast("Billing details could not be loaded for this organization.");
      } else {
        showErrorToast("Trial start is unavailable right now.");
      }
    } finally {
      setActiveTrialStartPlan(null);
    }
  }

  const canChangeBilling = billing !== null;
  const isTrialActive = billing?.trial.active === true;
  const activeTrialPlan = billing?.trial.plan;
  const trialDaysRemaining = formatTrialDaysRemaining(billing?.trial.days_remaining ?? null);
  const preferredTrialPlan = requestedTrialPlan ?? "solo";
  const alternateTrialPlan = preferredTrialPlan === "solo" ? "team" : "solo";
  const isBillingManagedInternally =
    billing !== null &&
    billing.plan !== "free" &&
    billing.stripe_customer_id === null &&
    !isTrialActive;
  const canManageStripeBilling = canChangeBilling && !isBillingManagedInternally;
  const canManageCapacity = billing !== null && billing.plan !== "free" && !isTrialActive;
  const pendingReduction = billing?.capacity_units.pending_reduction ?? null;
  const primaryTrialCheckoutPlan = activeTrialPlan === "team" ? "team" : billing?.plan === "team" ? "team" : "solo";
  const trialCallout = billing === null ? null : isTrialActive ? (
    <CalloutCard
      eyebrow="Trial active"
      title={`${trialDaysRemaining ?? "Active"} in your ${formatPlanName(activeTrialPlan ?? billing.plan)} trial`}
      description={`Trial access stays active through ${formatDate(billing.trial.ends_at ?? billing.usage_window.ends_at)}. No credit card is required until you convert, and extra capacity remains locked during the trial.`}
      tone="neutral"
    >
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={activeCheckoutPlan !== null} onClick={() => void handleCheckout(primaryTrialCheckoutPlan)}>
          <CreditCardIcon data-icon="inline-start" />
          {activeCheckoutPlan === primaryTrialCheckoutPlan
            ? "Opening checkout..."
            : `Convert to ${formatPlanName(primaryTrialCheckoutPlan)} paid`}
        </Button>
        {activeTrialPlan === "solo" ? (
          <Button type="button" variant="outline" disabled={activeCheckoutPlan !== null} onClick={() => void handleCheckout("team")}>
            {activeCheckoutPlan === "team" ? "Opening checkout..." : "Upgrade to Team"}
          </Button>
        ) : null}
      </div>
    </CalloutCard>
  ) : billing.plan === "free" && billing.trial.available ? (
    <CalloutCard
      eyebrow="30-day no-card trial"
      title={
        requestedTrialPlan === null
          ? "Start a paid-plan trial before you subscribe"
          : `${formatPlanName(preferredTrialPlan)} trial ready to start`
      }
      description="Trials include the full paid allowance for the selected plan. No credit card is required, and extra capacity stays unavailable until you convert to paid."
      tone="neutral"
    >
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={activeTrialStartPlan !== null} onClick={() => void handleStartTrial(preferredTrialPlan)}>
          {activeTrialStartPlan === preferredTrialPlan ? "Starting trial..." : `Start ${formatPlanName(preferredTrialPlan)} trial`}
        </Button>
        <Button type="button" variant="outline" disabled={activeTrialStartPlan !== null} onClick={() => void handleStartTrial(alternateTrialPlan)}>
          {activeTrialStartPlan === alternateTrialPlan ? "Starting trial..." : `Start ${formatPlanName(alternateTrialPlan)} trial`}
        </Button>
      </div>
    </CalloutCard>
  ) : billing.plan === "free" && requestedTrialPlan !== null ? (
    <CalloutCard
      eyebrow="Trial unavailable"
      title="This account has already used its free trial"
      description={
        billing.trial.plan === null
          ? `A new ${formatPlanName(requestedTrialPlan)} trial cannot be started here. Paid checkout is still available.`
          : `This account already used the ${formatPlanName(billing.trial.plan)} trial. Paid checkout is still available${billing.trial.expired_at === null ? "." : ` after it ended on ${formatDate(billing.trial.expired_at)}.`}`
      }
      tone="neutral"
    >
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={activeCheckoutPlan !== null} onClick={() => void handleCheckout(requestedTrialPlan)}>
          <CreditCardIcon data-icon="inline-start" />
          {activeCheckoutPlan === requestedTrialPlan ? "Opening checkout..." : `Upgrade to ${formatPlanName(requestedTrialPlan)}`}
        </Button>
      </div>
    </CalloutCard>
  ) : null;

  return (
    <div className="space-y-8">
      <CheckoutReturnDialog
        state={checkoutReturnDialog}
        onOpenChange={(open) => {
          if (!open) {
            setCheckoutReturnDialog(null);
          }
        }}
      />

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
          {trialCallout}

          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <Card>
              <CardHeader>
                <CardTitle>Current plan</CardTitle>
                <CardDescription>Current plan and allowance capacity for this account.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-2">
                    {/* <p className="text-sm text-muted-foreground">Current plan</p> */}
                    <div className="flex items-center gap-3">
                      <PlanBadge plan={billing.plan} />
                      <span className="text-sm text-muted-foreground">
                        {[trialDaysRemaining, formatActiveProjectCount(billing.active_projects), formatAllowanceUnitCount(billing.capacity_units.total)]
                          .filter((value) => value !== null)
                          .join(" • ")}
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
                        <Button
                          type="button"
                          variant="outline"
                          disabled={!canChangeBilling || activeCheckoutPlan !== null}
                          onClick={() => void handleCheckout("team")}
                        >
                          Upgrade to Team
                        </Button>
                      </>
                    ) : isTrialActive ? null : isBillingManagedInternally ? null : billing.plan === "solo" ? (
                      <>
                        <Button type="button" disabled={!canManageStripeBilling || isOpeningPortal} onClick={() => void handlePortal()}>
                          <CreditCardIcon data-icon="inline-start" />
                          {isOpeningPortal ? "Opening portal..." : "Manage subscription"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={!canManageStripeBilling || activeCheckoutPlan !== null}
                          onClick={() => void handleCheckout("team")}
                        >
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
                    description="This account has an internal plan override, so Stripe checkout and subscription management are not used. Allowance capacity is still managed here."
                    tone="neutral"
                  />
                ) : isTrialActive ? (
                  <CalloutCard
                    eyebrow="Capacity locked during trial"
                    title="Convert to paid to add extra capacity"
                    description={`The ${formatPlanName(activeTrialPlan ?? billing.plan)} trial includes only its built-in allowance. Extra purchased units stay unavailable until you convert${trialDaysRemaining === null ? "." : `, with ${trialDaysRemaining} remaining.`}`}
                    tone="neutral"
                  />
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1.5">
                  <CardTitle>Allowance capacity</CardTitle>
                  <CardDescription>
                    {isTrialActive
                      ? "Trial capacity is active now. Extra purchased units unlock after paid conversion."
                      : "Included and purchased units set the size of the hosted allowance."}
                  </CardDescription>
                </div>
                {billing.plan === "free" ? null : (
                  <CapacityDialog
                    billing={billing}
                    canChangeBilling={canManageCapacity}
                    managementMode={isBillingManagedInternally ? "internal" : "stripe"}
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
                    <p className="font-medium">
                      {pendingReduction.total} total units on {formatDate(pendingReduction.effective_at)}
                    </p>
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
                actionLabel="Details"
                actionAriaLabel="View raw ingested events breakdown"
                onAction={() => setIsRawIngestBreakdownOpen(true)}
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

          <RawIngestedEventsBreakdownDialog
            billing={billing}
            open={isRawIngestBreakdownOpen}
            onOpenChange={setIsRawIngestBreakdownOpen}
          />
        </>
      )}
    </div>
  );
}

export {
  billingReflectsCheckout,
  CapacityDialog,
  CheckoutReturnDialog,
  clearPendingBillingCheckout,
  formatActiveProjectCount,
  formatAllowanceUnitCount,
  formatDate,
  formatPlanName,
  readPendingBillingCheckout,
  writePendingBillingCheckout
};
