import { expect, it } from "vitest";
import { decideReferralInvoiceBenefit } from "../../../packages/referrals/src/customer-benefit.js";
const invoice = {
  invoice_id: "in_first",
  finalized: true,
  trial: false,
  amount_due_minor: 5310,
  business_base_net_minor: 5310,
  expected_discount_applied: true
};
it("reserves the first eligible invoice at finalisation regardless of whether its payment succeeds", () => {
  expect(decideReferralInvoiceBenefit({ reserved_invoice_id: null, invoice })).toEqual({
    action: "reserve_invoice",
    invoice_id: "in_first"
  });
});
it("keeps trial, zero and draft invoices from consuming the benefit", () => {
  for (const altered of [
    { trial: true },
    { amount_due_minor: 0 },
    { business_base_net_minor: 0 },
    { finalized: false }
  ])
    expect(
      decideReferralInvoiceBenefit({
        reserved_invoice_id: null,
        invoice: { ...invoice, ...altered }
      })
    ).toEqual({ action: "keep_pending" });
});
it("preserves the same invoice on retry and never grants a second eligible invoice discount", () => {
  expect(decideReferralInvoiceBenefit({ reserved_invoice_id: "in_first", invoice })).toEqual({
    action: "same_invoice",
    invoice_id: "in_first"
  });
  expect(
    decideReferralInvoiceBenefit({
      reserved_invoice_id: "in_first",
      invoice: { ...invoice, invoice_id: "in_next" }
    })
  ).toEqual({ action: "already_reserved", invoice_id: "in_first" });
});
it("does not consume an eligible invoice when the promised discount is missing", () => {
  expect(() =>
    decideReferralInvoiceBenefit({
      reserved_invoice_id: null,
      invoice: { ...invoice, expected_discount_applied: false }
    })
  ).toThrow("referral_invoice_discount_unverified");
});
