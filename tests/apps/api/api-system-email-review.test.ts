import { describe, expect, it, vi } from "vitest";

import { createApiServer } from "../../../apps/api/src/server.ts";
import { SESSION_COOKIE_NAME, buildCsrfToken } from "../../../packages/auth/src/index.js";

function createDependencies() {
  return {
    ingestionPersistence: {
      persistAndEnqueue: vi.fn()
    },
    ingestionMetadata: {
      resolveProjectByTokenHash: vi.fn()
    },
    memberAuth: {
      resolveMemberByTokenHash: vi.fn()
    },
    webAuth: {
      requestEmailCode: vi.fn(),
      verifyEmailCode: vi.fn(),
      beginGithubAuth: vi.fn(),
      completeGithubAuth: vi.fn(),
      acceptInviteForSession: vi.fn(),
      resolveSessionByToken: vi.fn(),
      revokeSessionByToken: vi.fn()
    },
    tokenManagement: {
      listProjectTokensForOrganization: vi.fn().mockResolvedValue([]),
      createProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      listMemberTokensForOrganization: vi.fn().mockResolvedValue([]),
      createMemberTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeMemberTokenForOrganization: vi.fn().mockResolvedValue(null)
    },
    incidentRetrieval: {
      listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
      getIncidentForOrganization: vi.fn().mockResolvedValue(null),
      listServicesForOrganization: vi.fn().mockResolvedValue([]),
      listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
    },
    objectStoreReader: {
      getObject: vi.fn()
    },
    webhookDelivery: {
      listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] })
    }
  };
}

describe("api system email review route", () => {
  it("sends the selected preview email to the signed-in owner and mirrored review inbox", async () => {
    const dependencies = createDependencies();
    const send = vi.fn().mockResolvedValue(undefined);
    dependencies.webAuth.resolveSessionByToken.mockResolvedValue({
      session_id: "ses_123",
      user_id: "usr_owner",
      email: "owner@example.com",
      email_verified_at: "2026-05-20T00:00:00.000Z",
      organization_id: "org_123",
      organization_plan: "team",
      role: "owner",
      created_at: "2026-05-20T00:00:00.000Z",
      expires_at: "2026-05-21T00:00:00.000Z",
      revoked_at: null
    });

    const app = createApiServer(
      {
        ...dependencies,
        billingEmails: {
          getBillingContactForOrganization: vi.fn().mockResolvedValue(null),
          send
        }
      },
      {
        dogfoodingEnv: {
          NODE_ENV: "development"
        }
      }
    );

    const sessionToken = "session-secret";
    const response = await app.inject({
      method: "POST",
      url: "/v1/internal/system-email-previews/send",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${sessionToken}`,
        "x-csrf-token": buildCsrfToken(sessionToken)
      },
      payload: {
        id: "payment-failure"
      }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      delivered: true,
      recipient_emails: ["owner@example.com", "owenfar1@gmail.com"],
      preview_id: "payment-failure"
    });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["owner@example.com", "owenfar1@gmail.com"],
        subject: "DebugBundle: payment failed"
      })
    );
  });

  it("rejects non-owner callers", async () => {
    const dependencies = createDependencies();
    dependencies.webAuth.resolveSessionByToken.mockResolvedValue({
      session_id: "ses_123",
      user_id: "usr_member",
      email: "member@example.com",
      email_verified_at: "2026-05-20T00:00:00.000Z",
      organization_id: "org_123",
      organization_plan: "team",
      role: "member",
      created_at: "2026-05-20T00:00:00.000Z",
      expires_at: "2026-05-21T00:00:00.000Z",
      revoked_at: null
    });

    const app = createApiServer(
      {
        ...dependencies,
        billingEmails: {
          getBillingContactForOrganization: vi.fn().mockResolvedValue(null),
          send: vi.fn()
        }
      },
      {
        dogfoodingEnv: {
          NODE_ENV: "development"
        }
      }
    );

    const sessionToken = "session-secret";
    const response = await app.inject({
      method: "POST",
      url: "/v1/internal/system-email-previews/send",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${sessionToken}`,
        "x-csrf-token": buildCsrfToken(sessionToken)
      },
      payload: {
        id: "payment-failure"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "forbidden" });
  });

  it("returns 503 when local email transport is not configured", async () => {
    const dependencies = createDependencies();
    dependencies.webAuth.resolveSessionByToken.mockResolvedValue({
      session_id: "ses_123",
      user_id: "usr_owner",
      email: "owner@example.com",
      email_verified_at: "2026-05-20T00:00:00.000Z",
      organization_id: "org_123",
      organization_plan: "team",
      role: "owner",
      created_at: "2026-05-20T00:00:00.000Z",
      expires_at: "2026-05-21T00:00:00.000Z",
      revoked_at: null
    });

    const app = createApiServer(dependencies, {
      dogfoodingEnv: {
        NODE_ENV: "development"
      }
    });

    const sessionToken = "session-secret";
    const response = await app.inject({
      method: "POST",
      url: "/v1/internal/system-email-previews/send",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${sessionToken}`,
        "x-csrf-token": buildCsrfToken(sessionToken)
      },
      payload: {
        id: "payment-failure"
      }
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: "email_transport_not_configured" });
  });

  it("deduplicates the mirrored inbox when the signed-in owner already uses it", async () => {
    const dependencies = createDependencies();
    const send = vi.fn().mockResolvedValue(undefined);
    dependencies.webAuth.resolveSessionByToken.mockResolvedValue({
      session_id: "ses_123",
      user_id: "usr_owner",
      email: "owenfar1@gmail.com",
      email_verified_at: "2026-05-20T00:00:00.000Z",
      organization_id: "org_123",
      organization_plan: "team",
      role: "owner",
      created_at: "2026-05-20T00:00:00.000Z",
      expires_at: "2026-05-21T00:00:00.000Z",
      revoked_at: null
    });

    const app = createApiServer(
      {
        ...dependencies,
        billingEmails: {
          getBillingContactForOrganization: vi.fn().mockResolvedValue(null),
          send
        }
      },
      {
        dogfoodingEnv: {
          NODE_ENV: "development"
        }
      }
    );

    const sessionToken = "session-secret";
    const response = await app.inject({
      method: "POST",
      url: "/v1/internal/system-email-previews/send",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${sessionToken}`,
        "x-csrf-token": buildCsrfToken(sessionToken)
      },
      payload: {
        id: "payment-failure"
      }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      delivered: true,
      recipient_emails: ["owenfar1@gmail.com"],
      preview_id: "payment-failure"
    });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["owenfar1@gmail.com"],
        subject: "DebugBundle: payment failed"
      })
    );
  });
});
