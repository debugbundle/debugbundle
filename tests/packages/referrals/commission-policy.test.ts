import { describe, expect, it } from "vitest";
import {
  calculateReferralCommission,
  referralCommissionEndsAt,
  referralFundsAvailableAt,
  referralAttributionAllowed
} from "../../../packages/referrals/src/commission-policy.js";

const start = "2026-01-31T00:00:00.000Z";
const end = "2027-01-31T00:00:00.000Z";
function line(amount = 5900) {
  return {
    id: "base",
    plan: "business" as const,
    kind: "plan" as const,
    net_amount_minor: amount,
    tax_amount_minor: 0,
    service_starts_at: start,
    service_ends_at: "2026-02-28T00:00:00.000Z"
  };
}
function invoice(amount = 5900) {
  return {
    first_paid_service_starts_at: start,
    cash_collected_minor: amount,
    lines: [line(amount)],
    refunds: []
  };
}
describe("Business base referral commission", () => {
  it.each([
    [5310, 2655],
    [5900, 2950],
    [53100, 26550],
    [59000, 29500]
  ])(
    "commissions collected eligible cash %i once at the frozen 50 percent rate",
    (cash, expected) => {
      expect(calculateReferralCommission(invoice(cash))).toBe(expected);
    }
  );
  it.each(["solo", "team", "free"] as const)("excludes %s charges", (plan) => {
    expect(calculateReferralCommission({ ...invoice(), lines: [{ ...line(), plan }] })).toBe(0);
  });
  it("excludes add-ons and tax while allocating partial cash collections proportionally", () => {
    const input = {
      ...invoice(),
      cash_collected_minor: 6789,
      lines: [
        { ...line(), tax_amount_minor: 590 },
        { ...line(299), id: "extra", kind: "extra_capacity" as const }
      ]
    };
    expect(calculateReferralCommission(input)).toBe(2950);
    expect(calculateReferralCommission({ ...input, cash_collected_minor: 3394 })).toBe(1475);
  });
  it("treats credit-funded and zero invoices as no collected cash", () => {
    expect(calculateReferralCommission({ ...invoice(), cash_collected_minor: 0 })).toBe(0);
  });
  it("allocates credit and negative prorations across positive charges without paying more than cash", () => {
    expect(
      calculateReferralCommission({
        ...invoice(),
        cash_collected_minor: 5401,
        lines: [line(), { ...line(-499), id: "solo-credit", plan: "solo" }]
      })
    ).toBe(2701);
  });
  it("pays nothing for year-two service and allocates an anniversary-spanning annual line", () => {
    expect(
      calculateReferralCommission({
        ...invoice(59000),
        lines: [
          { ...line(59000), service_starts_at: end, service_ends_at: "2028-01-31T00:00:00.000Z" }
        ]
      })
    ).toBe(0);
    expect(
      calculateReferralCommission({
        ...invoice(59000),
        lines: [
          {
            ...line(59000),
            service_starts_at: "2026-07-31T00:00:00.000Z",
            service_ends_at: "2027-07-31T00:00:00.000Z"
          }
        ]
      })
    ).toBe(14871);
  });
  it("uses cumulative half-up rounding so split payments or refunds cannot manufacture commission", () => {
    const first = calculateReferralCommission(invoice(1));
    const both = calculateReferralCommission({
      ...invoice(1),
      cash_collected_minor: 2,
      lines: [line(2)]
    });
    expect(first).toBe(1);
    expect(both).toBe(1);
    expect(both - first).toBe(0);
    const refunded = calculateReferralCommission({
      ...invoice(2),
      refunds: [{ id: "refund", cash_minor: 1 }]
    });
    expect(refunded).toBe(1);
    expect(
      calculateReferralCommission({
        ...invoice(2),
        refunds: [
          { id: "a", cash_minor: 1 },
          { id: "b", cash_minor: 1 }
        ]
      })
    ).toBe(0);
  });
  it("reverses line-specific refunds without attributing capacity-only refunds to the base", () => {
    const input = {
      ...invoice(),
      cash_collected_minor: 6199,
      lines: [line(), { ...line(299), id: "extra", kind: "extra_capacity" as const }]
    };
    expect(
      calculateReferralCommission({
        ...input,
        refunds: [
          { id: "r_extra", cash_minor: 299, allocations: [{ line_id: "extra", amount_minor: 299 }] }
        ]
      })
    ).toBe(2950);
    expect(
      calculateReferralCommission({
        ...input,
        refunds: [
          { id: "r_base", cash_minor: 5900, allocations: [{ line_id: "base", amount_minor: 5900 }] }
        ]
      })
    ).toBe(0);
  });
  it("keeps tax-only refunds separate and rejects contradictory net refund facts", () => {
    const input = {
      ...invoice(),
      cash_collected_minor: 6490,
      lines: [{ ...line(), tax_amount_minor: 590 }]
    };
    expect(
      calculateReferralCommission({
        ...input,
        refunds: [
          {
            id: "tax",
            cash_minor: 590,
            allocations: [{ line_id: "base", amount_minor: 590, net_amount_minor: 0 }]
          }
        ]
      })
    ).toBe(2950);
    expect(() =>
      calculateReferralCommission({
        ...input,
        refunds: [
          {
            id: "a",
            cash_minor: 3245,
            allocations: [{ line_id: "base", amount_minor: 3245, net_amount_minor: 3245 }]
          },
          {
            id: "b",
            cash_minor: 3245,
            allocations: [{ line_id: "base", amount_minor: 3245, net_amount_minor: 3245 }]
          }
        ]
      })
    ).toThrow("referral_net_refund_exceeds_charge");
  });
  it("is independent of line order and refund splitting across cumulative partial collections", () => {
    for (const cash of [1, 3, 37, 100, 1001, 6199]) {
      const input = {
        ...invoice(),
        cash_collected_minor: cash,
        lines: [line(), { ...line(299), id: "extra", kind: "extra_capacity" as const }]
      };
      const refund = Math.floor(cash / 2),
        first = Math.floor(refund / 2);
      const together = calculateReferralCommission({
        ...input,
        refunds: [{ id: "r", cash_minor: refund }]
      });
      const split = calculateReferralCommission({
        ...input,
        lines: [...input.lines].reverse(),
        refunds: [
          { id: "r2", cash_minor: refund - first },
          { id: "r1", cash_minor: first }
        ]
      });
      expect(split).toBe(together);
    }
  });
  it("allocates retained partial cash across the remaining verified charge lines after a specific refund", () => {
    const input = {
      ...invoice(),
      cash_collected_minor: 100,
      lines: [line(100), { ...line(100), id: "extra", kind: "extra_capacity" as const }]
    };
    expect(
      calculateReferralCommission({
        ...input,
        refunds: [
          {
            id: "all-cash",
            cash_minor: 100,
            allocations: [{ line_id: "extra", amount_minor: 100 }]
          }
        ]
      })
    ).toBe(0);
    expect(
      calculateReferralCommission({
        ...input,
        refunds: [
          {
            id: "almost-all",
            cash_minor: 99,
            allocations: [{ line_id: "extra", amount_minor: 99 }]
          }
        ]
      })
    ).toBe(0);
    expect(
      calculateReferralCommission({
        ...input,
        refunds: [
          { id: "some", cash_minor: 50, allocations: [{ line_id: "extra", amount_minor: 50 }] }
        ]
      })
    ).toBe(17);
  });
  it("never commissions refunded partial cash even when the credit note identifies only tax", () => {
    const input = {
      ...invoice(),
      cash_collected_minor: 60,
      lines: [{ ...line(100), tax_amount_minor: 20 }]
    };
    expect(
      calculateReferralCommission({
        ...input,
        refunds: [
          {
            id: "tax",
            cash_minor: 20,
            allocations: [{ line_id: "base", amount_minor: 20, net_amount_minor: 0 }]
          }
        ]
      })
    ).toBe(20);
    expect(() =>
      calculateReferralCommission({
        ...input,
        refunds: [
          {
            id: "impossible-tax",
            cash_minor: 30,
            allocations: [{ line_id: "base", amount_minor: 30, net_amount_minor: 0 }]
          }
        ]
      })
    ).toThrow("referral_tax_refund_exceeds_charge");
  });
  it("keeps mixed allocated/unallocated refunds independent of order and split receipt delivery", () => {
    const input = {
      ...invoice(),
      cash_collected_minor: 200,
      lines: [line(100), { ...line(100), id: "extra", kind: "extra_capacity" as const }]
    };
    const allocated = {
      id: "allocated",
      cash_minor: 50,
      allocations: [{ line_id: "extra", amount_minor: 50 }]
    };
    const unknown = { id: "unknown", cash_minor: 50 };
    expect(calculateReferralCommission({ ...input, refunds: [allocated, unknown] })).toBe(33);
    expect(calculateReferralCommission({ ...input, refunds: [unknown, allocated] })).toBe(33);
    expect(
      calculateReferralCommission({
        ...input,
        refunds: [
          { ...allocated, cash_minor: 25, allocations: [{ line_id: "extra", amount_minor: 25 }] },
          {
            ...allocated,
            id: "second",
            cash_minor: 25,
            allocations: [{ line_id: "extra", amount_minor: 25 }]
          },
          unknown
        ]
      })
    ).toBe(33);
  });
  it("rejects duplicate identities, invalid money, over-refunds and ambiguous allocations", () => {
    expect(() => calculateReferralCommission({ ...invoice(), lines: [line(), line()] })).toThrow();
    expect(() =>
      calculateReferralCommission({ ...invoice(), cash_collected_minor: 1.5 })
    ).toThrow();
    expect(() =>
      calculateReferralCommission({ ...invoice(), refunds: [{ id: "r", cash_minor: 5901 }] })
    ).toThrow();
    expect(() =>
      calculateReferralCommission({
        ...invoice(),
        refunds: [
          { id: "r", cash_minor: 100, allocations: [{ line_id: "unknown", amount_minor: 100 }] }
        ]
      })
    ).toThrow();
  });
});
it("uses twelve calendar months with a clamped leap-day anniversary", () => {
  expect(referralCommissionEndsAt(start)).toBe(end);
  expect(referralCommissionEndsAt("2024-02-29T15:00:00.000Z")).toBe("2025-02-28T15:00:00.000Z");
});
it("holds earnings until both 30 days after collection and provider funds availability", () => {
  expect(referralFundsAvailableAt("2026-01-01T12:00:00.000Z", "2026-01-05T00:00:00.000Z")).toBe(
    "2026-01-31T12:00:00.000Z"
  );
  expect(referralFundsAvailableAt("2026-01-01T12:00:00.000Z", "2026-02-02T00:00:00.000Z")).toBe(
    "2026-02-02T00:00:00.000Z"
  );
});
it("excludes self-referrals, prior paying customers, reserved checkouts and silent reassignment", () => {
  const valid = {
    partner_user_id: "partner",
    owner_user_id: "owner",
    previously_paid: false,
    checkout_reserved: false,
    existing_partner_user_id: null,
    explicit_correction: false
  };
  expect(referralAttributionAllowed(valid)).toBe(true);
  for (const change of [
    { owner_user_id: "partner" },
    { previously_paid: true },
    { checkout_reserved: true },
    { existing_partner_user_id: "other" }
  ])
    expect(referralAttributionAllowed({ ...valid, ...change })).toBe(false);
  expect(
    referralAttributionAllowed({
      ...valid,
      existing_partner_user_id: "other",
      explicit_correction: true
    })
  ).toBe(true);
});
