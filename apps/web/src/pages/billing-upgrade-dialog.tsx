import { useEffect, useRef, useState } from "react";
import { BillingPaymentContinuation } from "../components/system/billing-payment-continuation.js";
import { Button } from "../components/ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../components/ui/dialog.js";
import {
  previewBillingUpgrade,
  startBillingCheckout,
  type BillingUpgradeQuote
} from "../lib/api-billing.js";

export function BillingUpgradeDialog(props: {
  open: boolean;
  onOpenChange(open: boolean): void;
  onNavigate(url: string): void;
}): JSX.Element {
  const [quote, setQuote] = useState<BillingUpgradeQuote | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const inFlight = useRef(false);
  useEffect(() => {
    if (!props.open) return;
    let cancelled = false;
    setQuote(null);
    setPaymentUrl(null);
    setError(null);
    setLoading(true);
    void previewBillingUpgrade()
      .then((result) => {
        if (cancelled) return;
        if ("quote" in result) setQuote(result.quote);
        else setPaymentUrl(result.payment_url);
      })
      .catch(() => {
        if (!cancelled)
          setError(
            "Could not prepare this upgrade. If you have a scheduled change or unpaid invoice, manage your subscription first."
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [props.open, refresh]);
  async function confirm(): Promise<void> {
    if (inFlight.current) return;
    if (!quote) return;
    if (Date.parse(quote.expires_at) <= Date.now()) {
      setQuote(null);
      setError("The quote has changed or expired. Refresh it before confirming.");
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const url = await startBillingCheckout("team", quote.confirmation_token);
      if (url.startsWith("https://invoice.stripe.com/")) {
        setQuote(null);
        setPaymentUrl(url);
      } else props.onNavigate(url);
    } catch (reason) {
      if (reason instanceof Error && reason.message === "upgrade_confirmation_required") {
        setQuote(null);
        setError("The quote has changed or expired. Refresh it before confirming.");
      } else
        setError("We could not confirm the upgrade yet. Retry to check the same payment attempt.");
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }
  const money = (amount: number): string =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: quote?.currency ?? "usd"
    }).format(amount / 100);
  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!inFlight.current) props.onOpenChange(open);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upgrade to Team</DialogTitle>
          <DialogDescription>
            Your existing subscription will move to Team. Stripe may ask you to authenticate the
            payment.
          </DialogDescription>
        </DialogHeader>
        {loading ? <p role="status">Calculating your upgrade…</p> : null}
        {quote ? (
          <div className="flex flex-col gap-3">
            <dl className="grid grid-cols-2 gap-2">
              <dt>Due now</dt>
              <dd>{money(quote.amount_due)}</dd>
              <dt>Tax included now</dt>
              <dd>{money(quote.tax)}</dd>
              <dt>New monthly total</dt>
              <dd>{money(quote.monthly_total)}</dd>
            </dl>
            <p>{quote.additional_capacity_units} extra capacity units will be retained.</p>
            <p className="text-sm text-muted-foreground">
              The amount due includes proration for this billing period. Your billing date stays the
              same.
            </p>
          </div>
        ) : null}
        {paymentUrl ? (
          <>
            <p>
              Your upgrade payment is waiting. Your current plan stays active until payment
              completes.
            </p>
            <BillingPaymentContinuation
              url={paymentUrl}
              onContinue={() => props.onOpenChange(false)}
            />
          </>
        ) : null}
        {error ? <p role="alert">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" disabled={submitting} onClick={() => props.onOpenChange(false)}>
            {paymentUrl ? "Close" : "Cancel"}
          </Button>
          {paymentUrl ? null : !loading && !quote ? (
            <Button onClick={() => setRefresh((value) => value + 1)}>Refresh quote</Button>
          ) : (
            <Button disabled={loading || submitting || !quote} onClick={() => void confirm()}>
              {submitting ? "Confirming…" : "Confirm upgrade"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
