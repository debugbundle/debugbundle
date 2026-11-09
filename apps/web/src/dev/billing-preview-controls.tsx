import { useEffect, useState } from "react";
import { z } from "zod";
import {
  BillingPreviewScenarioSchema,
  BillingPreviewStateSchema,
  type BillingPreviewScenario
} from "./billing-preview-contract.js";
import { buildBrowserSessionHeaders } from "../lib/api-client.js";
import { clearPendingBillingCheckout } from "../pages/billing-page-helpers.js";
import { CollapsibleCard } from "../components/ui/collapsible-card.js";
import { Field, FieldError, FieldGroup, FieldLabel } from "../components/ui/field.js";
import { Input } from "../components/ui/input.js";
import { Button } from "../components/ui/button.js";
import { ToggleGroup, ToggleGroupItem } from "../components/ui/toggle-group.js";
import { PendingButton } from "../components/system/pending-button.js";

const modes = {
  paid: "Paid",
  complimentary: "Complimentary",
  trial: "Trial: day 8",
  trial_locked: "Trial: day 1"
} as const;
const reloadBilling = (): void => {
  window.location.assign("/billing");
};

/** Synthetic Vite state, isolated from the local database and every provider. */
export function BillingPreviewControls({
  onReload = reloadBilling
}: {
  onReload?: () => void;
}): JSX.Element {
  const [state, setState] = useState<z.infer<typeof BillingPreviewStateSchema> | null>(null);
  const [scenario, setScenario] = useState<BillingPreviewScenario | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/v1/__dev/billing", {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("preview_unavailable");
        const value = BillingPreviewStateSchema.parse(await response.json());
        if (!controller.signal.aborted) {
          setState(value);
          setScenario(value.scenario);
          setError(null);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("Local preview controls could not be loaded.");
      });
    return () => controller.abort();
  }, [revision]);
  async function update(next: "configure" | "renew" | "cancel" | "resume"): Promise<void> {
    if (action || !scenario) return;
    setError(null);
    setAction(next);
    try {
      const response = await fetch("/v1/__dev/billing", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: buildBrowserSessionHeaders(true),
        body: JSON.stringify(
          next === "configure"
            ? { action: next, scenario: BillingPreviewScenarioSchema.parse(scenario) }
            : { action: next }
        )
      });
      if (!response.ok) throw new Error("preview_change_refused");
      BillingPreviewStateSchema.parse(await response.json());
      clearPendingBillingCheckout();
      onReload();
    } catch {
      setError(
        "The preview change could not be applied. Cancel any scheduled plan change before simulating cancellation, then retry."
      );
    } finally {
      setAction(null);
    }
  }
  const paid = state?.scenario.mode === "paid" && state.scenario.plan !== "free";
  const portal = new URLSearchParams(window.location.search).get("mock_portal") === "1";
  return (
    <CollapsibleCard
      title="Local billing preview"
      defaultOpen={portal}
      description="Synthetic data only. No charges, emails or database changes. Amounts are simulated; restart mock mode to reset."
    >
      {scenario ? (
        <div className="flex flex-col gap-4">
          {portal ? (
            <p className="text-sm text-muted-foreground">
              This simulates the Stripe portal. Use the cancellation controls below to test
              returning to Free at renewal.
            </p>
          ) : null}
          <FieldGroup className="grid gap-4 lg:grid-cols-2">
            <Field>
              <FieldLabel id="preview-plan-label">Preview tier</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                aria-labelledby="preview-plan-label"
                value={scenario.plan}
                disabled={action !== null}
                onValueChange={(value) => {
                  const plan = BillingPreviewScenarioSchema.shape.plan.safeParse(value);
                  if (plan.success)
                    setScenario({
                      ...scenario,
                      plan: plan.data,
                      ...(plan.data === "free"
                        ? { mode: "paid", additional_capacity_units: 0 }
                        : {})
                    });
                }}
              >
                {(["free", "solo", "team", "business"] as const).map((plan) => (
                  <ToggleGroupItem key={plan} value={plan}>
                    {plan.charAt(0).toUpperCase() + plan.slice(1)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>
            <Field>
              <FieldLabel id="preview-mode-label">Account state</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                className="flex-wrap"
                aria-labelledby="preview-mode-label"
                value={scenario.mode}
                disabled={action !== null || scenario.plan === "free"}
                onValueChange={(value) => {
                  const mode = BillingPreviewScenarioSchema.shape.mode.safeParse(value);
                  if (mode.success)
                    setScenario({
                      ...scenario,
                      mode: mode.data,
                      ...(mode.data.startsWith("trial") ? { additional_capacity_units: 0 } : {})
                    });
                }}
              >
                {Object.entries(modes).map(([value, label]) => (
                  <ToggleGroupItem key={value} value={value}>
                    {label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>
            <Field>
              <FieldLabel id="preview-interval-label">Billing interval</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                aria-labelledby="preview-interval-label"
                value={scenario.interval}
                disabled={action !== null || scenario.plan === "free"}
                onValueChange={(value) => {
                  if (value === "month" || value === "year")
                    setScenario({ ...scenario, interval: value });
                }}
              >
                <ToggleGroupItem value="month">Monthly</ToggleGroupItem>
                <ToggleGroupItem value="year">Yearly</ToggleGroupItem>
              </ToggleGroup>
            </Field>
            <Field>
              <FieldLabel htmlFor="preview-extra-units">Extra capacity units</FieldLabel>
              <Input
                id="preview-extra-units"
                type="number"
                min={0}
                max={99}
                value={scenario.additional_capacity_units}
                disabled={
                  action !== null || scenario.plan === "free" || scenario.mode.startsWith("trial")
                }
                onChange={(event) =>
                  setScenario({
                    ...scenario,
                    additional_capacity_units: Number(event.target.value)
                  })
                }
              />
            </Field>
          </FieldGroup>
          <div className="flex flex-wrap gap-2">
            <PendingButton
              pending={action === "configure"}
              pendingLabel="Applying preview"
              disabled={action !== null}
              onClick={() => void update("configure")}
            >
              Apply preview
            </PendingButton>
            <PendingButton
              variant="outline"
              pending={action === "renew"}
              pendingLabel="Advancing renewal"
              disabled={action !== null || !paid}
              onClick={() => void update("renew")}
            >
              Advance to renewal
            </PendingButton>
            <PendingButton
              variant="outline"
              pending={action === "cancel" || action === "resume"}
              pendingLabel="Updating cancellation"
              disabled={action !== null || !paid}
              onClick={() => void update(state?.cancellation_scheduled ? "resume" : "cancel")}
            >
              {state?.cancellation_scheduled ? "Keep subscription" : "Cancel at renewal"}
            </PendingButton>
          </div>
          {state?.cancellation_scheduled ? (
            <p role="status" className="text-sm text-muted-foreground">
              Cancellation is scheduled. Advance to renewal to apply Free limits.
            </p>
          ) : null}
        </div>
      ) : !error ? (
        <p role="status">Loading preview scenarios…</p>
      ) : null}
      {error ? (
        <div className="flex flex-col gap-2">
          <FieldError role="alert">{error}</FieldError>
          <Button variant="outline" onClick={() => setRevision((value) => value + 1)}>
            Retry controls
          </Button>
        </div>
      ) : null}
    </CollapsibleCard>
  );
}
