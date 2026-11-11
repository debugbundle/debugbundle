import {
  getTierCapabilities,
  type BillingOfferQuote,
  type TierName
} from "../../../../../packages/shared-types/src/index.js";

export function formatBillingAmount(amount: number): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "usd" }).format(
    amount / 100
  );
}
export function formatBillingTerm(value: string | null): string {
  return value === null
    ? "Unavailable"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}
export function BillingOfferSummary({
  quote,
  currentPlan
}: {
  quote: BillingOfferQuote;
  currentPlan: TierName;
}): JSX.Element {
  const intervalLabel = quote.interval === "year" ? "yearly" : "monthly";
  return (
    <div className="flex flex-col gap-3">
      {quote.resume_required ? (
        <p>
          Your previous request is still being checked. This resumes the same confirmed request.
        </p>
      ) : null}
      <dl className="grid grid-cols-2 gap-2">
        <dt>Due now</dt>
        <dd>{formatBillingAmount(quote.amount_due)}</dd>
        <dt>Effective date</dt>
        <dd>{formatBillingTerm(quote.effective_at)}</dd>
        <dt>Recurring {intervalLabel} total</dt>
        <dd>{formatBillingAmount(quote.recurring_total)}</dd>
        <dt>{quote.action === "upgrade" ? "Tax included now" : "Estimated renewal tax"}</dt>
        <dd>{formatBillingAmount(quote.tax)}</dd>
      </dl>
      <p>
        {quote.additional_capacity_units} extra capacity units will be retained. Included units:{" "}
        {getTierCapabilities(currentPlan).included_capacity_units} →{" "}
        {getTierCapabilities(quote.target_plan).included_capacity_units}.
      </p>
      {quote.action === "renewal" ? (
        <p>
          Your current plan stays active until {formatBillingTerm(quote.effective_at)}. No charge or
          refund now.
        </p>
      ) : (
        <p>
          The amount due includes proration for the current paid term. New access starts after
          payment applies.
        </p>
      )}
      {currentPlan === "business" && quote.target_plan !== "business" ? (
        <p>
          Organisation-wide grants and AI reports will pause. Factual reports and weekly reviews
          follow the new plan limits; incompatible schedules need Owner review. Saved grants need
          Owner review before they resume on a later Business upgrade.
        </p>
      ) : null}
      {currentPlan !== "free" && currentPlan !== "solo" && quote.target_plan === "solo" ? (
        <p>Collaboration and Slack will pause. Saved setup is retained.</p>
      ) : null}
      <p className="text-sm text-muted-foreground">
        Allowances reset monthly with either payment interval. Taxes and discounts can change the
        final renewal invoice.
      </p>
    </div>
  );
}
