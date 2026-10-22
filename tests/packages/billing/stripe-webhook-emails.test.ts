import { describe, expect, it, vi } from "vitest";
import {
  readBillingSnapshot,
  sendBillingEmail
} from "../../../packages/billing/src/stripe-webhook-emails.js";

describe("optional billing notification dependencies", () => {
  it("does not invent a billing snapshot when the reader or account is unavailable", async () => {
    expect(await readBillingSnapshot(undefined, "org_test")).toBeNull();
    expect(
      await readBillingSnapshot({ getBillingSummaryForOrganization: async () => null }, "org_test")
    ).toBeNull();
  });
  it("does not render or send when billing email is unconfigured or the billing contact is missing", async () => {
    const render = vi.fn(() => ({
      subject: "Billing update",
      text: "Synthetic",
      html: "<p>Synthetic</p>"
    }));
    await sendBillingEmail(undefined, "org_test", render);
    const send = vi.fn();
    const logger = { warn: vi.fn(), error: vi.fn() };
    await sendBillingEmail(
      { getBillingContactForOrganization: async () => null, send },
      "org_test",
      render,
      logger
    );
    expect(render).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      { organization_id: "org_test" },
      "stripe_billing_email_no_contact"
    );
  });
});
