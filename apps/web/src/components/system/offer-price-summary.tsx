import type { OfferPurchaseQuote } from "../../../../../packages/referrals/src/offer-quote.js";
import { formatBillingAmount } from "./billing-offer-summary.js";

export function OfferPriceSummary({
  quote
}: {
  quote: Pick<
    OfferPurchaseQuote,
    | "interval"
    | "base_minor"
    | "discount_minor"
    | "capacity_minor"
    | "initial_total_minor"
    | "renewal_total_minor"
  >;
}): JSX.Element {
  const period = quote.interval === "year" ? "year" : "month";
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 [&>dd]:text-right [&>dd]:tabular-nums">
        <dt>Normal base price</dt>
        <dd>
          <del>{formatBillingAmount(quote.base_minor)}</del>
        </dd>
        <dt>Introductory discount</dt>
        <dd>−{formatBillingAmount(quote.discount_minor)}</dd>
        {quote.capacity_minor > 0 ? (
          <>
            <dt>Extra capacity</dt>
            <dd>{formatBillingAmount(quote.capacity_minor)}</dd>
          </>
        ) : null}
        <dt>First {period}, before tax</dt>
        <dd className="font-medium">{formatBillingAmount(quote.initial_total_minor)}</dd>
        <dt>Renewal, before tax</dt>
        <dd>
          {formatBillingAmount(quote.renewal_total_minor)}/{period}
        </dd>
      </dl>
      <p className="text-sm text-muted-foreground">
        Prices are in USD. {quote.interval === "year" ? "The annual amount is paid upfront. " : ""}
        Tax is calculated at secure checkout. The discount applies only to the first eligible
        invoice, even after a trial.
      </p>
    </div>
  );
}
