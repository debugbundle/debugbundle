import { expect, it, vi } from "vitest";
import { createApiServer } from "../../../apps/api/src/server.js";
import { SESSION_COOKIE_NAME, buildCsrfToken } from "../../../packages/auth/src/index.js";

it.each([
  "owner",
  "member",
  "unverified",
  "missing_session",
  "missing_csrf",
  "malformed",
  "unconfigured",
  "provider_failure",
  "conflict"
])("protects upgrade previews for %s requests", async (scenario) => {
  const previewUpgrade = vi.fn(async () =>
    scenario === "provider_failure"
      ? "billing_service_error"
      : scenario === "conflict"
        ? "billing_change_in_progress"
        : { quote: { confirmation_token: "signed_synthetic" } }
  );
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
    billingManagement: scenario === "unconfigured" ? {} : { previewUpgrade },
    tokenManagement: {},
    incidentRetrieval: {},
    objectStoreReader: {},
    webhookDelivery: {}
  } as never);
  try {
    const response = await app.inject({
      method: "POST",
      url: "/v1/billing/upgrade/preview",
      cookies: { [SESSION_COOKIE_NAME]: "synthetic_session" },
      headers:
        scenario === "missing_csrf" ? {} : { "x-csrf-token": buildCsrfToken("synthetic_session") },
      payload: scenario === "malformed" ? { organization_id: "org_other" } : {}
    });
    expect(response.statusCode).toBe(
      ["unconfigured", "provider_failure"].includes(scenario)
        ? 503
        : scenario === "conflict"
          ? 409
          : scenario === "owner"
            ? 200
            : scenario === "missing_session"
              ? 401
              : scenario === "malformed"
                ? 400
                : 403
    );
    if (scenario === "owner") {
      expect(previewUpgrade).toHaveBeenCalledExactlyOnceWith({ organization_id: "org_test" });
      expect(response.headers["cache-control"]).toBe("no-store");
    } else if (!["provider_failure", "conflict"].includes(scenario))
      expect(previewUpgrade).not.toHaveBeenCalled();
  } finally {
    await app.close();
  }
});
