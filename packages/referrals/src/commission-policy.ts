import { z } from "zod";
import { CommissionBasisPointsSchema } from "./programme-policy.js";

const money = z.number().int().safe().min(0).max(1_000_000_000_000);
const timestamp = z.string().datetime();
const LineSchema = z
  .object({
    id: z.string().min(1).max(255),
    plan: z.enum(["free", "solo", "team", "business"]),
    kind: z.enum(["plan", "extra_capacity", "other"]),
    net_amount_minor: z.number().int().safe().min(-1_000_000_000_000).max(1_000_000_000_000),
    tax_amount_minor: z.number().int().safe().min(-1_000_000_000_000).max(1_000_000_000_000),
    service_starts_at: timestamp,
    service_ends_at: timestamp
  })
  .strict()
  .refine((line) => {
    const duration = Date.parse(line.service_ends_at) - Date.parse(line.service_starts_at);
    return line.plan === "business" && line.kind === "plan" && line.net_amount_minor > 0
      ? duration > 0
      : duration >= 0;
  }, "invalid_service_period");
const RefundSchema = z
  .object({
    id: z.string().min(1).max(255),
    cash_minor: money,
    allocations: z
      .array(
        z
          .object({
            line_id: z.string().min(1).max(255),
            amount_minor: money,
            // Credit-note facts can distinguish a tax-only refund. Plain charge refunds
            // have no line allocation and are apportioned across the invoice instead.
            net_amount_minor: money.optional()
          })
          .strict()
      )
      .min(1)
      .max(100)
      .optional()
  })
  .strict();
export const ReferralCommissionInputSchema = z
  .object({
    first_paid_service_starts_at: timestamp,
    cash_collected_minor: money,
    lines: z.array(LineSchema).min(1).max(100),
    refunds: z.array(RefundSchema).max(1000)
  })
  .strict();
export type ReferralCommissionInput = z.infer<typeof ReferralCommissionInputSchema>;
export const ReferralCommissionPolicySchema = z
  .object({
    eligible_plans: z
      .array(z.enum(["solo", "team", "business"]))
      .min(1)
      .max(3),
    commission_basis_points: CommissionBasisPointsSchema,
    commission_months: z.number().int().min(1).max(12)
  })
  .strict();
export type ReferralCommissionPolicy = z.infer<typeof ReferralCommissionPolicySchema>;
const legacyPolicy: ReferralCommissionPolicy = {
  eligible_plans: ["business"],
  commission_basis_points: 5000,
  commission_months: 12
};

interface Fraction {
  n: bigint;
  d: bigint;
}
function fraction(n: bigint, d = 1n): Fraction {
  if (d <= 0n) throw new Error("invalid_commission_denominator");
  let a = n < 0n ? -n : n,
    b = d;
  while (b) [a, b] = [b, a % b];
  return { n: n / (a || 1n), d: d / (a || 1n) };
}
function add(a: Fraction, b: Fraction): Fraction {
  return fraction(a.n * b.d + b.n * a.d, a.d * b.d);
}
function scale(a: Fraction, n: bigint, d = 1n): Fraction {
  return fraction(a.n * n, a.d * d);
}
export function referralCommissionEndsAt(startsAt: string, months = 12): string {
  timestamp.parse(startsAt);
  z.number().int().min(1).max(12).parse(months);
  const start = new Date(startsAt),
    result = new Date(start);
  const day = start.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(start.getUTCMonth() + months);
  result.setUTCDate(
    Math.min(
      day,
      new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate()
    )
  );
  return result.toISOString();
}
function eligibleLine(
  line: z.infer<typeof LineSchema>,
  start: number,
  end: number,
  policy: ReferralCommissionPolicy
): Fraction {
  if (
    line.plan === "free" ||
    !policy.eligible_plans.includes(line.plan) ||
    line.kind !== "plan" ||
    line.net_amount_minor <= 0
  )
    return fraction(0n);
  const from = Date.parse(line.service_starts_at),
    to = Date.parse(line.service_ends_at);
  const overlap = Math.max(0, Math.min(end, to) - Math.max(start, from));
  return fraction(BigInt(line.net_amount_minor) * BigInt(overlap), BigInt(to - from));
}
/** Cumulative target, never a per-webhook earning. The ledger posts only its
 * delta from the previous target. Discounts are already netted into each line;
 * credits/negative prorations reduce collected cash across positive charges.
 * Exact service/cash fractions are rounded half up once, after the frozen rate.
 * Absent an explicit version policy, the original Business-only 50% applies.
 * No tax, add-on, uncollected credit or year-two service earns commission. */
export function calculateReferralCommission(
  raw: ReferralCommissionInput,
  rawPolicy: ReferralCommissionPolicy = legacyPolicy
): number {
  return calculateCashTarget(raw, rawPolicy, false, rawPolicy.commission_basis_points);
}
/** Reporting projection from the same exact refund/cash allocation as commission.
 * It covers all eligible base service and rounds once, without a commission rate. */
export function calculateCollectedBaseCash(
  raw: Omit<ReferralCommissionInput, "first_paid_service_starts_at">,
  eligiblePlans: ReferralCommissionPolicy["eligible_plans"]
): number {
  return calculateCashTarget(
    { ...raw, first_paid_service_starts_at: "1970-01-01T00:00:00.000Z" },
    { ...legacyPolicy, eligible_plans: eligiblePlans },
    true,
    10000
  );
}
function calculateCashTarget(
  raw: ReferralCommissionInput,
  rawPolicy: ReferralCommissionPolicy,
  allService: boolean,
  rate: number
): number {
  const input = ReferralCommissionInputSchema.parse(raw);
  const policy = ReferralCommissionPolicySchema.parse(rawPolicy);
  const start = Date.parse(input.first_paid_service_starts_at),
    end = Date.parse(
      referralCommissionEndsAt(input.first_paid_service_starts_at, policy.commission_months)
    );
  const lines = new Map(input.lines.map((line) => [line.id, line]));
  if (
    lines.size !== input.lines.length ||
    new Set(input.refunds.map((refund) => refund.id)).size !== input.refunds.length
  )
    throw new Error("duplicate_referral_fact");
  const positiveGross = (line: z.infer<typeof LineSchema>): bigint =>
    BigInt(Math.max(0, line.net_amount_minor)) + BigInt(Math.max(0, line.tax_amount_minor));
  const gross = input.lines.reduce((total, line) => total + positiveGross(line), 0n);
  const collected = BigInt(input.cash_collected_minor);
  if (collected > gross) throw new Error("referral_cash_exceeds_invoice");
  const refunded = input.refunds.reduce((total, refund) => total + BigInt(refund.cash_minor), 0n);
  if (refunded > collected) throw new Error("referral_refund_exceeds_collection");
  if (gross === 0n) return 0;
  const lineRefunds = new Map<string, bigint>();
  const lineNetRefunds = new Map<string, Fraction>();
  for (const refund of input.refunds) {
    if (!refund.allocations) continue;
    if (
      new Set(refund.allocations.map((value) => value.line_id)).size !==
        refund.allocations.length ||
      refund.allocations.reduce((total, value) => total + BigInt(value.amount_minor), 0n) !==
        BigInt(refund.cash_minor)
    )
      throw new Error("invalid_referral_refund_allocation");
    for (const allocation of refund.allocations) {
      const line = lines.get(allocation.line_id);
      if (!line) throw new Error("unknown_referral_refund_line");
      const lineGross = positiveGross(line),
        cash = BigInt(allocation.amount_minor);
      const total = (lineRefunds.get(line.id) ?? 0n) + cash;
      if (
        lineGross === 0n ||
        total > lineGross ||
        (allocation.net_amount_minor ?? 0) > allocation.amount_minor
      )
        throw new Error("referral_line_refund_exceeds_charge");
      lineRefunds.set(line.id, total);
      const netRefund =
        allocation.net_amount_minor === undefined
          ? fraction(cash * BigInt(Math.max(0, line.net_amount_minor)), lineGross)
          : fraction(BigInt(allocation.net_amount_minor));
      const totalNetRefund = add(lineNetRefunds.get(line.id) ?? fraction(0n), netRefund);
      if (totalNetRefund.n > BigInt(Math.max(0, line.net_amount_minor)) * totalNetRefund.d)
        throw new Error("referral_net_refund_exceeds_charge");
      const totalTaxRefund = add(fraction(total), scale(totalNetRefund, -1n));
      if (totalTaxRefund.n > BigInt(Math.max(0, line.tax_amount_minor)) * totalTaxRefund.d)
        throw new Error("referral_tax_refund_exceeds_charge");
      lineNetRefunds.set(line.id, totalNetRefund);
    }
  }
  // Specific credit-note facts reduce the remaining charge mix first. Allocate
  // retained cash across that mix; subtracting a refund from the original cash
  // shares can commission refunded money on partially paid/tax-only invoices.
  const remainingGross = input.lines.reduce(
    (total, line) => total + positiveGross(line) - (lineRefunds.get(line.id) ?? 0n),
    0n
  );
  if (remainingGross === 0n) return 0;
  const remainingEligible = input.lines.reduce((total, line) => {
    if (line.net_amount_minor <= 0) return total;
    const netRemaining = add(
      fraction(BigInt(line.net_amount_minor)),
      scale(lineNetRefunds.get(line.id) ?? fraction(0n), -1n)
    );
    return add(
      total,
      scale(
        allService
          ? fraction(
              line.kind === "plan" &&
                line.plan !== "free" &&
                policy.eligible_plans.includes(line.plan)
                ? BigInt(line.net_amount_minor)
                : 0n
            )
          : eligibleLine(line, start, end, policy),
        netRemaining.n,
        netRemaining.d * BigInt(line.net_amount_minor)
      )
    );
  }, fraction(0n));
  const remaining = scale(remainingEligible, collected - refunded, remainingGross);
  if (remaining.n <= 0n) return 0;
  const target = scale(remaining, BigInt(rate), 10000n);
  return Number((target.n * 2n + target.d) / (target.d * 2n));
}
export function referralFundsAvailableAt(collectedAt: string, providerAvailableAt: string): string {
  timestamp.parse(collectedAt);
  timestamp.parse(providerAvailableAt);
  return new Date(
    Math.max(Date.parse(collectedAt) + 30 * 86400_000, Date.parse(providerAvailableAt))
  ).toISOString();
}
export function referralAttributionAllowed(input: {
  partner_user_id: string;
  owner_user_id: string;
  previously_paid: boolean;
  checkout_reserved: boolean;
  existing_partner_user_id: string | null;
  explicit_correction: boolean;
}): boolean {
  return (
    input.partner_user_id !== input.owner_user_id &&
    !input.previously_paid &&
    !input.checkout_reserved &&
    (input.existing_partner_user_id === null ||
      input.existing_partner_user_id === input.partner_user_id ||
      input.explicit_correction)
  );
}
