import { expect, it, vi } from "vitest";
import { createApiServer } from "../../../apps/api/src/server.js";
import { SESSION_COOKIE_NAME, buildCsrfToken } from "../../../packages/auth/src/index.js";

it.each(["owner", "member", "unverified", "missing_session", "missing_csrf", "malformed"])(
  "protects plan-change previews for %s requests",
  async (scenario) => {
    const previewPlanChange = vi.fn(async () => ({
      quote: { confirmation_token: "signed_synthetic" }
    }));
    const app = createApiServer({
      ingestionPersistence: { persistAndEnqueue: vi.fn() },
      ingestionMetadata: { resolveProjectByTokenHash: vi.fn() },
      memberAuth: { resolveMemberByTokenHash: vi.fn() },
      webAuth: {
        resolveSessionByToken: vi.fn(async () =>
          scenario === "missing_session"
            ? null
            : {
                user_id: "user_test",
                organization_id: "org_test",
                role: scenario === "member" ? "member" : "owner",
                email_verified_at: scenario === "unverified" ? null : "2026-10-22T00:00:00Z",
                email: "owner@example.test"
              }
        )
      },
      billingManagement: { previewPlanChange },
      tokenManagement: {},
      incidentRetrieval: {},
      objectStoreReader: {},
      webhookDelivery: {}
    } as never);
    try {
      const response = await app.inject({
        method: "POST",
        url: "/v1/billing/plan-change/preview",
        cookies: { [SESSION_COOKIE_NAME]: "synthetic_session" },
        headers:
          scenario === "missing_csrf"
            ? {}
            : { "x-csrf-token": buildCsrfToken("synthetic_session") },
        payload: scenario === "malformed" ? { organization_id: "org_other" } : {}
      });
      expect(response.statusCode).toBe(
        scenario === "owner"
          ? 200
          : scenario === "missing_session"
            ? 401
            : scenario === "malformed"
              ? 400
              : 403
      );
      if (scenario === "owner") {
        expect(previewPlanChange).toHaveBeenCalledExactlyOnceWith({ organization_id: "org_test" });
        expect(response.headers["cache-control"]).toBe("no-store");
      } else expect(previewPlanChange).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  }
);

it.each(["status", "schedule", "cancel"] as const)(
  "scopes owner member-token %s to its organization and validates the body",
  async (action) => {
    const service = vi.fn(async () => ({ pending_change: null }));
    const app = createApiServer({
      ingestionPersistence: { persistAndEnqueue: vi.fn() },
      ingestionMetadata: { resolveProjectByTokenHash: vi.fn() },
      memberAuth: {
        resolveMemberByTokenHash: vi.fn(async () => ({
          member_id: "owner_test",
          organization_id: "org_test",
          role: "owner"
        }))
      },
      billingManagement: {
        getPlanChange: service,
        schedulePlanChange: service,
        cancelPlanChange: service
      },
      tokenManagement: {},
      incidentRetrieval: {},
      objectStoreReader: {},
      webhookDelivery: {}
    } as never);
    try {
      const method = action === "status" ? "GET" : action === "schedule" ? "POST" : "DELETE";
      const body =
        action === "schedule"
          ? { confirmation_token: "signed_test" }
          : { schedule_id: "sched_test" };
      const response = await app.inject({
        method,
        url: "/v1/billing/plan-change",
        headers: { authorization: "Bearer dbundle_mem_owner_test" },
        ...(action === "status" ? {} : { payload: body })
      });
      expect(response.statusCode).toBe(200);
      expect(service).toHaveBeenCalledExactlyOnceWith({
        organization_id: "org_test",
        ...(action === "status" ? {} : body)
      });
      if (action !== "status") {
        const invalid = await app.inject({
          method,
          url: "/v1/billing/plan-change",
          headers: { authorization: "Bearer dbundle_mem_owner_test" },
          payload: { ...body, organization_id: "org_other" }
        });
        expect(invalid.statusCode).toBe(400);
        expect(service).toHaveBeenCalledTimes(1);
      }
    } finally {
      await app.close();
    }
  }
);
