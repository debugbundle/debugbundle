import { useEffect, useRef, useState } from "react";
import { Button } from "../components/ui/button.js";
import { PendingButton } from "../components/system/pending-button.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../components/ui/dialog.js";
import {
  getBillingPlanChange,
  previewBillingPlanChange,
  scheduleBillingPlanChange,
  cancelBillingPlanChange
} from "../lib/api-plan-change.js";
import type {
  BillingPlanChangeQuote,
  BillingPlanChangeState
} from "../../../../packages/billing-client/src/plan-change.js";

/** Paid Team self-service; status stays separate from the existing billing response. */
export function BillingPlanChangeControl(): JSX.Element {
  const [state, setState] = useState<BillingPlanChangeState | null>(null);
  const [open, setOpen] = useState(false);
  const [quote, setQuote] = useState<BillingPlanChangeQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const inFlight = useRef(false);
  // Retain an already confirmed token after an uncertain response. Reopening
  // must reconcile that exact operation instead of creating a different intent.
  const confirmed = useRef(false);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getBillingPlanChange()
      .then((result) => {
        if (!cancelled && "pending_change" in result) {
          setState(result);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not load scheduled plan changes.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refresh]);
  async function preview(): Promise<void> {
    if (inFlight.current) return;
    setOpen(true);
    if (confirmed.current && quote) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    setQuote(null);
    try {
      const result = await previewBillingPlanChange();
      if ("quote" in result) {
        setQuote(result.quote);
        confirmed.current = result.quote.resume_required === true;
      }
    } catch {
      setError(
        "Could not prepare this change. Resolve any pending payment, cancellation or capacity change in Manage subscription first."
      );
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }
  async function confirm(): Promise<void> {
    if (!quote || inFlight.current) return;
    if (!confirmed.current && Date.parse(quote.expires_at) <= Date.now()) {
      setQuote(null);
      setError("This quote expired. Refresh it before confirming.");
      return;
    }
    inFlight.current = true;
    confirmed.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const result = await scheduleBillingPlanChange(quote.confirmation_token);
      if ("pending_change" in result) {
        setState(result);
        setOpen(false);
        setQuote(null);
        confirmed.current = false;
      }
    } catch (reason) {
      if (reason instanceof Error && reason.message === "plan_change_confirmation_required") {
        confirmed.current = false;
        setQuote(null);
        setError("This quote changed or expired. Refresh it before confirming.");
      } else
        setError("We could not confirm the switch yet. Retry to check the same scheduled change.");
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }
  async function cancel(): Promise<void> {
    if (!state?.pending_change || inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const result = await cancelBillingPlanChange(state.pending_change.schedule_id);
      if ("pending_change" in result) setState(result);
    } catch {
      setError("Could not cancel this scheduled change yet. Retry to check its status.");
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }
  const date = (value: string): string =>
    new Date(value).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  const money = (value: number): string =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: quote?.currency ?? "usd"
    }).format(value / 100);
  return (
    <>
      {state?.pending_change ? (
        <div className="flex flex-col gap-2" role="status">
          <p>
            Switch to Solo on {date(state.pending_change.effective_at)}. Team remains active until
            then.
          </p>
          <PendingButton
            variant="outline"
            pending={submitting}
            pendingLabel="Cancelling switch…"
            onClick={() => void cancel()}
          >
            Keep Team
          </PendingButton>
        </div>
      ) : (
        <PendingButton
          variant="outline"
          pending={loading}
          pendingLabel="Loading plan change…"
          disabled={!state}
          onClick={() => void preview()}
        >
          Switch to Solo
        </PendingButton>
      )}
      {!open && error ? (
        <div>
          <p role="alert">{error}</p>
          <Button variant="outline" onClick={() => setRefresh((value) => value + 1)}>
            Retry
          </Button>
        </div>
      ) : null}
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!inFlight.current) setOpen(value);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Switch to Solo</DialogTitle>
            <DialogDescription>
              Your current subscription changes at renewal. You keep Team until then.
            </DialogDescription>
          </DialogHeader>
          {loading ? <p role="status">Calculating your new monthly total…</p> : null}
          {quote ? (
            <div className="flex flex-col gap-3">
              {quote.resume_required ? (
                <p>
                  Your previous switch is still being checked. Confirm to resume that same request.
                </p>
              ) : null}
              <dl className="grid grid-cols-2 gap-2">
                <dt>Effective date</dt>
                <dd>{date(quote.effective_at)}</dd>
                <dt>Due now</dt>
                <dd>{money(0)}</dd>
                <dt>New monthly total</dt>
                <dd>{money(quote.monthly_total)}</dd>
                <dt>Tax included</dt>
                <dd>{money(quote.tax)}</dd>
              </dl>
              <p>
                {quote.additional_capacity_units} extra capacity units will be retained. Included
                units change from 15 to 3.
              </p>
              <p>
                Team features, including collaboration and Slack, will pause. Your saved setup is
                retained. Solo limits apply from the effective date.
              </p>
              <p className="text-sm text-muted-foreground">
                No charge or refund now. Taxes and discounts at renewal can change the final
                invoice.
              </p>
            </div>
          ) : null}
          {error ? <p role="alert">{error}</p> : null}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={submitting || loading}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            {!loading && !quote ? (
              <Button onClick={() => void preview()}>Refresh quote</Button>
            ) : (
              <PendingButton
                pending={submitting}
                pendingLabel="Confirming switch…"
                disabled={loading || !quote}
                onClick={() => void confirm()}
              >
                Confirm switch
              </PendingButton>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
