import { CheckCircle2Icon, InfoIcon, LoaderCircleIcon, XCircleIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { MAX_BILLING_ADDITIONAL_CAPACITY_UNITS } from "../../../../packages/shared-types/src/index.js";
import { CalloutCard } from "../components/system/callout-card.js";
import { Button } from "../components/ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card.js";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog.js";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "../components/ui/field.js";
import { Input } from "../components/ui/input.js";
import {
  cancelBillingCapacityReduction,
  increaseBillingCapacity,
  scheduleBillingCapacityReduction,
  type BillingSummaryRecord
} from "../lib/api.js";
import { showErrorToast, showSuccessToast } from "../lib/notify.js";
import { formatActiveProjectCount, formatDate, formatPlanName } from "./billing-page-helpers.js";

export type CapacityManagementMode = "stripe" | "internal";

interface CapacityDialogProps {
  billing: BillingSummaryRecord;
  canChangeBilling: boolean;
  managementMode: CapacityManagementMode;
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
  const isInternalManagement = props.managementMode === "internal";
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
      showSuccessToast(isInternalManagement ? "Allowance capacity reduced successfully." : "Capacity reduction scheduled successfully.");
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
      <DialogContent
        size="lg"
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain"
      >
        <DialogHeader>
          <DialogTitle>Manage allowance capacity</DialogTitle>
          <DialogDescription>
            {isInternalManagement
              ? "Internal admin-managed accounts update purchased allowance units immediately."
              : "Extra units expand shared allowance capacity immediately. Reductions stay active until the current paid window ends."}
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

        {isInternalManagement || pendingReduction === null ? null : (
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
              <CardDescription>
                {isInternalManagement
                  ? "Increase the purchased extra-unit count immediately for this internally managed account."
                  : "Charge the prorated difference now and expand allowance capacity immediately."}
              </CardDescription>
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
              {isInternalManagement || pendingReduction === null ? null : (
                <p className="text-sm text-muted-foreground">
                  Cancel the scheduled reduction first if you want to add more capacity immediately.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{isInternalManagement ? "Reduce capacity now" : "Reduce on renewal"}</CardTitle>
              <CardDescription>
                {isInternalManagement
                  ? "Lower the purchased extra-unit count immediately for this internally managed account."
                  : `Keep your current allowance until ${formatDate(props.billing.usage_window.ends_at)}, then lower it at renewal.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="billing-slot-reduction">
                    {isInternalManagement ? "Purchased extra units after update" : "Purchased extra units after renewal"}
                  </FieldLabel>
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
                    {isInternalManagement
                      ? "The total purchased extra-unit count updates as soon as you save it."
                      : "The current subscription stays unchanged until the next paid period begins."}
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
                  {activeAction === "reduce"
                    ? isInternalManagement
                      ? "Updating units..."
                      : "Saving schedule..."
                    : isInternalManagement
                      ? "Reduce capacity now"
                      : pendingReduction === null
                        ? "Schedule reduction"
                        : "Update scheduled reduction"}
                </Button>
                {isInternalManagement || pendingReduction === null ? null : (
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

type CheckoutReturnStatus = "syncing" | "success" | "delayed" | "canceled" | "error";

export interface CheckoutReturnDialogState {
  status: CheckoutReturnStatus;
  plan?: BillingSummaryRecord["plan"];
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
