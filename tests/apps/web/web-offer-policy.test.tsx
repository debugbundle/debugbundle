// @vitest-environment jsdom
import { expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { OfferPolicyDetails } from "../../../apps/web/src/components/system/offer-policy-details.js";
import { ReferralProgrammeCard } from "../../../apps/web/src/components/system/referral-programme-card.js";
import { offerDefinition } from "../../helpers/offer-fixtures.js";
import type { OfferPolicy } from "../../../packages/referrals/src/programme-policy.js";
const policy: OfferPolicy = {
  kind: "referral",
  discount_basis_points: 2000,
  eligible_plans: ["solo", "team", "business"],
  eligible_intervals: ["month", "year"],
  commission_basis_points: 5000,
  commission_months: 12,
  claims_start_at: "2026-11-16T00:00:00.000Z",
  claims_end_at: null,
  redeem_by: null,
  max_claims: 100,
  allow_early_purchase_grants: true,
  terms_version: "referrals-2026-11"
};
it("shows actual initial and renewal totals and collected-cash commission for all six offers", () => {
  render(<OfferPolicyDetails policy={policy} />);
  const rows = screen.getAllByRole("row");
  for (const [label, total, commission] of [
    ["Solo monthly", "$4.00", "$2.00"],
    ["Team monthly", "$15.20", "$7.60"],
    ["Business monthly", "$47.20", "$23.60"],
    ["Solo yearly", "$38.40", "$19.20"],
    ["Team yearly", "$153.60", "$76.80"],
    ["Business yearly", "$470.40", "$235.20"]
  ]) {
    const row = rows.find((item) => item.textContent?.includes(label!));
    expect(row).toBeDefined();
    expect(within(row!).getByText(total!)).toBeVisible();
    expect(within(row!).getByText(commission!)).toBeVisible();
  }
  expect(screen.getByText(/first 12 calendar months/)).toBeVisible();
  expect(screen.getByText(/Tax, extra capacity/)).toBeVisible();
  expect(screen.getByText(/monthly from a \$50 USD available balance/)).toBeVisible();
});
it("does not claim creator earnings for a promotion", () => {
  render(
    <OfferPolicyDetails policy={{ ...policy, kind: "promotion", commission_basis_points: 0 }} />
  );
  expect(screen.queryByText("Example commission")).toBeNull();
  expect(screen.getByText(/does not replace an existing referring creator/)).toBeVisible();
});
it("does not quote a full annual commission for a shorter programme window", () => {
  render(<OfferPolicyDetails policy={{ ...policy, commission_months: 1 }} />);
  expect(screen.getByText(/first 1 calendar month from/)).toBeVisible();
  expect(screen.getAllByText("Prorated to 1 month")).toHaveLength(3);
  const annual = screen
    .getAllByRole("row")
    .find((row) => row.textContent?.includes("Business yearly"))!;
  expect(annual).not.toHaveTextContent("235.20");
});
it("shows the selected rate instead of an annual maximum when only one month can earn", () => {
  render(
    <ReferralProgrammeCard
      programme={{
        ...offerDefinition,
        policy: {
          ...policy,
          eligible_plans: ["business"],
          eligible_intervals: ["year"],
          commission_months: 1,
          commission_basis_points: 4567
        }
      }}
    />
  );
  expect(screen.getAllByText("45.67%")).toHaveLength(2);
  expect(screen.getByText(/up to 1 month of paid service/)).toBeVisible();
  expect(screen.getByText(/Yearly billing/)).toBeVisible();
  expect(screen.queryByText("Earn up to")).toBeNull();
  expect(screen.queryByText(/235\.20/)).toBeNull();
});

it("uses the same referral accent for the programme icon and earnings amount", () => {
  render(<ReferralProgrammeCard programme={{ ...offerDefinition, policy }} />);
  const card = screen.getByRole("article");
  expect(card.querySelector(".lucide-users")?.parentElement).toHaveClass("text-referral-accent");
  expect(within(card).getByText("$235.20").parentElement).toHaveClass("text-referral-accent");
});
