import { describe, expect, it } from "vitest";

import {
  renderTrialStartedEmail,
  renderTrialEndingSoonEmail,
  renderTrialExpiredEmail,
  renderTrialConvertedEmail,
  renderPurchaseConfirmationEmail,
  renderRenewalSuccessEmail,
  renderPaymentFailureEmail,
  renderPaymentFailureReminderEmail,
  renderEntitlementDowngradeWarningEmail,
  renderEntitlementDowngradeConfirmationEmail,
  renderPlanChangeConfirmationEmail,
  renderCapacityQuantityChangeEmail
} from "../../../packages/email/src/billing-emails.js";

describe("billing email templates", () => {
  describe("trial lifecycle emails", () => {
    it("renders trial started email", () => {
      const result = renderTrialStartedEmail({
        organizationName: "Acme Corp",
        trialPlan: "team",
        trialEndsAt: "2026-07-01T00:00:00.000Z",
        billingUrl: "https://app.debugbundle.test/billing"
      });

      expect(result.subject).toContain("trial has started");
      expect(result.text).toContain("30-day team trial");
      expect(result.text).toContain("2026-07-01T00:00:00.000Z");
      expect(result.html).toContain("Trial started");
    });

    it("renders trial ending soon email", () => {
      const result = renderTrialEndingSoonEmail({
        organizationName: "Acme Corp",
        trialPlan: "solo",
        trialEndsAt: "2026-07-01T00:00:00.000Z",
        daysRemaining: 7,
        billingUrl: "https://app.debugbundle.test/billing"
      });

      expect(result.subject).toContain("7 day(s) left");
      expect(result.text).toContain("ends in 7 day(s)");
      expect(result.text).toContain("DebugBundle will pause:");
      expect(result.text).toContain("generated hosted improvement bundle artifacts");
      expect(result.html).toContain("Convert to paid");
    });

    it("renders trial expired email", () => {
      const result = renderTrialExpiredEmail({
        organizationName: "Acme Corp",
        trialPlan: "solo",
        trialEndedAt: "2026-07-01T00:00:00.000Z",
        billingUrl: "https://app.debugbundle.test/billing"
      });

      expect(result.subject).toContain("trial has ended");
      expect(result.text).toContain("free tier");
      expect(result.text).toContain("paid-feature setup remain saved");
      expect(result.text).toContain("DebugBundle paused:");
      expect(result.text).toContain("generated hosted improvement bundle artifacts");
      expect(result.html).toContain("Trial ended");
    });

    it("renders trial converted email", () => {
      const result = renderTrialConvertedEmail({
        organizationName: "Acme Corp",
        trialPlan: "team",
        paidPlan: "team",
        billingUrl: "https://app.debugbundle.test/billing"
      });

      expect(result.subject).toContain("plan activated");
      expect(result.text).toContain("converted from a team trial");
      expect(result.html).toContain("Trial converted");
    });
  });

  describe("renderPurchaseConfirmationEmail", () => {
    it("should render purchase confirmation with plan and extra capacity", () => {
      const result = renderPurchaseConfirmationEmail({
        organizationName: "Acme Corp",
        plan: "team",
        extraCapacity: 3,
        portalUrl: "https://billing.stripe.com/session/abc"
      });

      expect(result.subject).toContain("team");
      expect(result.text).toContain("Acme Corp");
      expect(result.text).toContain("team");
      expect(result.text).toContain("3 extra capacity unit(s)");
      expect(result.text).toContain("https://billing.stripe.com/session/abc");
      expect(result.html).toContain("Your team plan is active for Acme Corp + 3 extra capacity unit(s).");
      expect(result.html.indexOf("Your team plan is active")).toBeLessThan(result.html.indexOf('class="db-email-frame"'));
      expect(result.html).toContain("Acme Corp");
      expect(result.html).toContain("team");
      expect(result.html).toContain("<svg");
      expect(result.html).not.toContain("billing.stripe.com/email/debugbundle-mark.png");
    });

    it("should omit capacity text when no extra capacity is purchased", () => {
      const result = renderPurchaseConfirmationEmail({
        organizationName: "Solo Dev",
        plan: "solo",
        extraCapacity: 0,
        portalUrl: "https://billing.stripe.com/session/def"
      });

      expect(result.text).not.toContain("extra capacity unit");
    });
  });

  describe("renderRenewalSuccessEmail", () => {
    it("should render renewal with next date", () => {
      const result = renderRenewalSuccessEmail({
        organizationName: "Acme Corp",
        plan: "team",
        extraCapacity: 2,
        nextRenewalDate: "2026-05-01"
      });

      expect(result.subject).toContain("renewed");
      expect(result.text).toContain("team");
      expect(result.text).toContain("Acme Corp");
      expect(result.text).toContain("2026-05-01");
      expect(result.text).toContain("2 extra capacity unit(s)");
      expect(result.html).toContain("Your team plan renewed; next renewal is 2026-05-01.");
      expect(result.html).toContain("<svg");
    });
  });

  describe("renderPaymentFailureEmail", () => {
    it("should render payment failure with grace period info", () => {
      const result = renderPaymentFailureEmail({
        organizationName: "Acme Corp",
        plan: "team",
        portalUrl: "https://billing.stripe.com/session/fail"
      });

      expect(result.subject).toContain("payment failed");
      expect(result.html).toContain("Payment failed for Acme Corp; paid features remain active while Stripe retries.");
      expect(result.text).toContain("remain active");
      expect(result.text).toContain("free tier");
      expect(result.text).toContain("https://billing.stripe.com/session/fail");
    });
  });

  describe("renderPaymentFailureReminderEmail", () => {
    it("should render reminder with days until downgrade", () => {
      const result = renderPaymentFailureReminderEmail({
        organizationName: "Acme Corp",
        plan: "team",
        portalUrl: "https://billing.stripe.com/session/remind",
        daysUntilDowngrade: 5
      });

      expect(result.subject).toContain("unresolved");
      expect(result.html).toContain("Resolve payment within 5 day(s) to avoid a downgrade.");
      expect(result.text).toContain("5 day(s)");
      expect(result.text).toContain("free tier");
    });
  });

  describe("renderEntitlementDowngradeWarningEmail", () => {
    it("should render warning with current plan and effective date", () => {
      const result = renderEntitlementDowngradeWarningEmail({
        organizationName: "Acme Corp",
        currentPlan: "team",
        currentCapacityUnits: 5,
        effectiveDate: "2026-04-15",
        portalUrl: "https://billing.stripe.com/session/warn"
      });

      expect(result.subject).toContain("downgrade pending");
      expect(result.html).toContain("Acme Corp will move from team to the free tier on 2026-04-15.");
      expect(result.text).toContain("team");
      expect(result.text).toContain("5 capacity unit(s)");
      expect(result.text).toContain("2026-04-15");
      expect(result.text).toContain("allowance limits");
      expect(result.text).not.toContain("archived");
    });
  });

  describe("renderEntitlementDowngradeConfirmationEmail", () => {
    it("should render confirmation with previous and new capacity totals", () => {
      const result = renderEntitlementDowngradeConfirmationEmail({
        organizationName: "Acme Corp",
        previousPlan: "team",
        previousCapacityUnits: 5,
        newCapacityUnits: 1,
        brandMarkUrl: "https://app.debugbundle.test/email/debugbundle-mark.png"
      });

      expect(result.subject).toContain("reduced");
      expect(result.html).toContain("Acme Corp moved from team to the free tier with 1 capacity unit(s).");
      expect(result.text).toContain("team");
      expect(result.text).toContain("5 capacity unit(s)");
      expect(result.text).toContain("1 capacity unit(s)");
      expect(result.text).toContain("allowance capacity");
      expect(result.text).not.toContain("archived");
      expect(result.html).toContain('src="https://app.debugbundle.test/email/debugbundle-mark.png"');
    });
  });

  describe("renderPlanChangeConfirmationEmail", () => {
    it("should render plan change from solo to team", () => {
      const result = renderPlanChangeConfirmationEmail({
        organizationName: "Acme Corp",
        previousPlan: "solo",
        newPlan: "team",
        extraCapacity: 2,
        brandMarkUrl: "https://app.debugbundle.test/email/debugbundle-mark.png"
      });

      expect(result.subject).toContain("team");
      expect(result.html).toContain("Acme Corp changed from solo to team with 2 extra capacity unit(s).");
      expect(result.text).toContain("solo");
      expect(result.text).toContain("team");
      expect(result.text).toContain("2 extra capacity unit(s)");
      expect(result.html).toContain('src="https://app.debugbundle.test/email/debugbundle-mark.png"');
    });

    it("should render plan change without extra slots", () => {
      const result = renderPlanChangeConfirmationEmail({
        organizationName: "Acme Corp",
        previousPlan: "free",
        newPlan: "solo",
        extraCapacity: 0
      });

      expect(result.text).not.toContain("extra capacity unit");
    });
  });

  describe("renderCapacityQuantityChangeEmail", () => {
    it("should render capacity quantity change with allowance capacity", () => {
      const result = renderCapacityQuantityChangeEmail({
        organizationName: "Acme Corp",
        plan: "team",
        previousCapacity: 2,
        newCapacity: 5,
        totalCapacityUnits: 8
      });

      expect(result.subject).toContain("capacity quantity");
      expect(result.html).toContain("Extra capacity changed from 2 to 5; total capacity is 8.");
      expect(result.text).toContain("2");
      expect(result.text).toContain("5");
      expect(result.text).toContain("8");
    });
  });

  describe("XSS safety", () => {
    it("should escape HTML in organization name", () => {
      const result = renderPurchaseConfirmationEmail({
        organizationName: '<script>alert("xss")</script>',
        plan: "solo",
        extraCapacity: 0,
        portalUrl: "https://example.com"
      });

      expect(result.html).not.toContain("<script>");
      expect(result.html).toContain("&lt;script&gt;");
      expect(result.html).toContain("DebugBundle");
    });
  });
});
