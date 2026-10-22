import { describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { registerBillingRoutes } from "../../../apps/api/src/routes/billing.js";
import { SESSION_COOKIE_NAME } from "../../../packages/auth/src/index.js";

describe("dedicated Checkout admission limits", () => {
  for (const blockedBucket of ["billing-checkout-account", "billing-checkout-ip"]) {
    it(`stops ${blockedBucket} requests before a provider call and audits the rejection`, async () => {
      const claimRequest = vi.fn(async (input: { bucket: string }) => ({
        allowed: input.bucket !== blockedBucket,
        limit: 5,
        remaining: 0,
        retry_after_ms: 1200
      }));
      const createCheckoutLink = vi.fn();
      const createAuditLog = vi.fn();
      const app = Fastify();
      registerBillingRoutes(app, {
        authRateLimiter: { claimRequest },
        webAuth: {
          resolveSessionByToken: vi.fn().mockResolvedValue({
            organization_id: "org_123",
            user_id: "user_1",
            role: "owner",
            email_verified_at: "2026-10-22T00:00:00Z",
            email: "owner@example.com"
          })
        },
        billingManagement: { createCheckoutLink },
        auditLogging: { createAuditLog }
      } as never);
      try {
        const response = await app.inject({
          method: "POST",
          url: "/v1/billing/checkout",
          headers: { cookie: `${SESSION_COOKIE_NAME}=session_test` },
          payload: { target_plan: "solo" }
        });
        expect(response.statusCode).toBe(429);
        expect(response.headers["retry-after"]).toBe("2");
        expect(createCheckoutLink).not.toHaveBeenCalled();
        expect(claimRequest).toHaveBeenCalledWith(
          expect.objectContaining({
            bucket: "billing-checkout-account",
            subject: "organization:org_123",
            limit: 5
          })
        );
        if (blockedBucket === "billing-checkout-ip")
          expect(claimRequest).toHaveBeenCalledWith(
            expect.objectContaining({
              bucket: "billing-checkout-ip",
              subject: "ip:127.0.0.1",
              limit: 10
            })
          );
        expect(createAuditLog).toHaveBeenCalledWith(
          expect.objectContaining({
            action: "billing.checkout",
            status: "failure",
            metadata: { reason: "rate_limited", target_plan: "solo" }
          })
        );
      } finally {
        await app.close();
      }
    });
  }
});
