import { CreditCardIcon } from "lucide-react";
import { useEffect, useState } from "react";
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
  getBillingSummary,
  increaseBillingCapacity,
  openBillingPortal,
  scheduleBillingCapacityReduction,
  startBillingCheckout,
  type BillingSummaryRecord
} from "../lib/api.js";
import { showErrorToast, showSuccessToast } from "../lib/notify.js";
import { useDelayedVisibility } from "../lib/use-delayed-visibility.js";
import { useSession } from "../lib/session.js";

interface CapacityDialogProps {
  billing: BillingSummaryRecord;
  canChangeBilling: boolean;
  open: boolean;
  onOpenChange(nextOpen: boolean): void;
  onBillingChange(nextBilling: BillingSummaryRecord): void;
}

function CapacityDialog(props: CapacityDialogProps): JSX.Element {
  const [increaseTarget, setIncreaseTarget] = useState(String(props.billing.capacity_units.additional_purchased + 1));
  const [reductionTarget, setReductionTarget] = useState(String(Math.max(props.billing.capacity_units.additional_purchased - 1, 0)));
  const [activeAction, setActiveAction] = useState<"increase" | "reduce" | "cancel" | null>(null);

  useEffect(() => {
    if (!props.open) {
      return;
    }

    setIncreaseTarget(String(props.billing.capacity_units.additional_purchased + 1));
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
                    step={1}
                    value={increaseTarget}
                    onChange={(event) => setIncreaseTarget(event.currentTarget.value)}
                  />
                  <FieldDescription>
                    Enter the total purchased extra units you want active right away.
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

export function BillingPage(): JSX.Element {
  const { session } = useSession();
  const [billing, setBilling] = useState<BillingSummaryRecord | null>(null);
  const [isForbidden, setIsForbidden] = useState(false);
  const [activeCheckoutPlan, setActiveCheckoutPlan] = useState<"solo" | "team" | null>(null);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [isCapacityDialogOpen, setIsCapacityDialogOpen] = useState(false);
  const showBillingLoading = useDelayedVisibility(billing === null && !isForbidden);

  useEffect(() => {
    void (async () => {
      try {
        const nextBilling = await getBillingSummary();
        setBilling(nextBilling);
      } catch (error) {
        if (error instanceof Error && error.message === "forbidden") {
          setIsForbidden(true);
          return;
        }

        throw error;
      }
    })();
  }, []);

  async function handleCheckout(targetPlan: "solo" | "team"): Promise<void> {
    setActiveCheckoutPlan(targetPlan);

    try {
      const url = await startBillingCheckout(targetPlan);
      window.location.assign(url);
    } catch {
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

  const canChangeBilling = session?.email_verified_at !== null && billing?.email_verification_required === false;
  const pendingReduction = billing?.capacity_units.pending_reduction ?? null;

  return (
    <div className="space-y-8">
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
          {!canChangeBilling ? (
            <CalloutCard
              eyebrow="Verification required"
              title="Verify your email before enabling billing changes"
              description="You can review billing now, but upgrades and subscription changes stay disabled until your email is verified."
              tone="warning"
            />
          ) : null}

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
                    ) : billing.plan === "solo" ? (
                      <>
                        <Button type="button" disabled={!canChangeBilling || isOpeningPortal} onClick={() => void handlePortal()}>
                          <CreditCardIcon data-icon="inline-start" />
                          {isOpeningPortal ? "Opening portal..." : "Manage subscription"}
                        </Button>
                        <Button type="button" variant="outline" disabled={!canChangeBilling || activeCheckoutPlan !== null} onClick={() => void handleCheckout("team")}>
                          Upgrade to Team
                        </Button>
                      </>
                    ) : (
                      <Button type="button" disabled={!canChangeBilling || isOpeningPortal} onClick={() => void handlePortal()}>
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
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1.5">
                  <CardTitle>Allowance capacity</CardTitle>
                  <CardDescription>Included and purchased units set the size of the hosted allowance.</CardDescription>
                </div>
                {billing.plan === "free" ? null : (
                  <CapacityDialog
                    billing={billing}
                    canChangeBilling={canChangeBilling}
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
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

function formatActiveProjectCount(value: number): string {
  return `${value} active ${value === 1 ? "project" : "projects"}`;
}

function formatAllowanceUnitCount(value: number): string {
  return `${value} allowance ${value === 1 ? "unit" : "units"}`;
}