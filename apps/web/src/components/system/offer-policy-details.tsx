import type { OfferPolicy } from "../../../../../packages/referrals/src/programme-policy.js";
import { programmeEarningsExamples } from "../../../../../packages/referrals/src/programme-policy.js";
import { getBillingCatalogPrice } from "../../../../../packages/shared-types/src/index.js";
import { formatReferralAmount } from "../../lib/referral-api.js";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableCaption
} from "../ui/table.js";

/** One commercial policy presentation for enrolment, saved offers and operator review. */
export function OfferPolicyDetails({
  policy,
  examples = true
}: {
  policy: OfferPolicy;
  examples?: boolean;
}): JSX.Element {
  const referral = policy.kind === "referral";
  const prices = programmeEarningsExamples(
    policy,
    (plan, interval) => getBillingCatalogPrice(plan, interval, "plan").amount_minor
  );
  return (
    <div className="flex flex-col gap-4 text-sm">
      <ul className="flex list-disc flex-col gap-2 pl-5 text-muted-foreground">
        <li>
          New eligible customers receive {policy.discount_basis_points / 100}% off their first
          positive base invoice on{" "}
          {policy.eligible_plans.map((plan) => plan[0]!.toUpperCase() + plan.slice(1)).join(", ")}.{" "}
          {policy.eligible_intervals
            .map((interval) => (interval === "year" ? "Yearly" : "Monthly"))
            .join(" and ")}{" "}
          billing is eligible. Renewal is at the normal price.
        </li>
        <li>
          The free trial does not consume the discount or start commission. A saved workspace offer
          works across devices without a cookie.
        </li>
        {referral ? (
          <li>
            You earn {policy.commission_basis_points / 100}% of eligible collected base cash for the
            first {policy.commission_months} calendar{" "}
            {policy.commission_months === 1 ? "month" : "months"} from the first eligible paid
            service. Plan changes do not restart the window.
          </li>
        ) : (
          <li>
            This promotion changes the customer discount and does not replace an existing referring
            creator.
          </li>
        )}
        <li>
          Tax, extra capacity and non-cash credits are excluded. Refunds and disputes adjust
          earnings; payment failure earns no commission.
        </li>
        <li>
          Prior paid subscriptions, self-referrals and reuse through another account or workspace
          are ineligible. Customer discounts do not stack.
        </li>
        {referral ? (
          <li>
            Payments are manually reviewed, normally monthly from a $50 USD available balance, after
            at least 30 days, cleared funds and dispute checks. Smaller balances carry forward;
            contact support for a final balance.
          </li>
        ) : null}
        {policy.claims_end_at ? (
          <li>
            New claims close {new Date(policy.claims_end_at).toLocaleString()}. Saved claims retain
            their recorded terms.
          </li>
        ) : null}
        {policy.redeem_by ? (
          <li>
            Campaign redemption deadline: {new Date(policy.redeem_by).toLocaleString()}. Each
            accepted claim is extended to cover its remaining trial plus seven days where needed.
          </li>
        ) : null}
      </ul>
      {examples ? (
        <Table>
          <TableCaption>
            USD examples before tax and extra capacity, assuming full cash collection and no
            refunds. Annual amounts are paid upfront. Commission follows the programme window;
            shorter annual windows require allocation using actual service dates.
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Plan</TableHead>
              <TableHead>Normal / renewal</TableHead>
              <TableHead>First invoice</TableHead>
              {referral ? <TableHead>Example commission</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {prices.map(({ plan, interval, baseMinor, payableMinor, commissionMinor }) => (
              <TableRow key={`${plan}:${interval}`}>
                <TableCell>
                  {plan[0]!.toUpperCase() + plan.slice(1)}{" "}
                  {interval === "year" ? "yearly" : "monthly"}
                </TableCell>
                <TableCell>
                  {formatReferralAmount(baseMinor)}/{interval === "year" ? "year" : "month"}
                </TableCell>
                <TableCell>{formatReferralAmount(payableMinor)}</TableCell>
                {referral ? (
                  <TableCell>
                    {commissionMinor === null
                      ? `Prorated to ${policy.commission_months} ${policy.commission_months === 1 ? "month" : "months"}`
                      : formatReferralAmount(commissionMinor)}
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </div>
  );
}
