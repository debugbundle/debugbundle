import { describe, expect, it, vi } from "vitest";

import { createApiServer } from "../../../apps/api/src/server.ts";

type ApiServerDependencies = Parameters<typeof createApiServer>[0];

function createWebAuth(
  overrides: Partial<NonNullable<ApiServerDependencies["webAuth"]>> = {}
): NonNullable<ApiServerDependencies["webAuth"]> {
  return {
    requestEmailCode: vi.fn(),
    verifyEmailCode: vi.fn(),
    beginGithubAuth: vi.fn(),
    completeGithubAuth: vi.fn(),
    acceptInviteForSession: vi.fn(),
    resolveSessionByToken: vi.fn().mockResolvedValue(null),
    revokeSessionByToken: vi.fn().mockResolvedValue(false),
    ...overrides
  };
}

function createSummary() {
  return {
    generated_at: "2026-06-12T15:30:00.000Z",
    collection_started_at: "2026-06-10T00:00:00.000Z",
    windows: {
      today: {
        starts_at: "2026-06-12T00:00:00.000Z",
        ends_at: "2026-06-12T15:30:00.000Z"
      },
      this_week: {
        starts_at: "2026-06-08T00:00:00.000Z",
        ends_at: "2026-06-12T15:30:00.000Z"
      },
      this_month: {
        starts_at: "2026-06-01T00:00:00.000Z",
        ends_at: "2026-06-12T15:30:00.000Z"
      },
      this_year: {
        starts_at: "2026-01-01T00:00:00.000Z",
        ends_at: "2026-06-12T15:30:00.000Z"
      }
    },
    kpis: {
      active_accounts_today: 3,
      active_accounts_this_week: 7,
      active_accounts_this_month: 11,
      new_accounts_today: 1,
      new_accounts_this_week: 4,
      new_accounts_this_month: 6,
      deleted_accounts_this_month: 2,
      active_accounts_total: 14,
      deleted_accounts_total: 5
    },
    usage: {
      raw_events_accepted_this_month: 1200,
      billable_events_counted_this_month: 1100,
      incident_signal_events_this_month: 400,
      context_signal_events_this_month: 500,
      operational_signal_events_this_month: 300,
      cloud_verification_events_this_month: 8,
      local_verification_events_this_month: 13
    },
    incidents: {
      opened_this_month: 10,
      resolved_this_month: 8,
      reopened_this_month: 2,
      regressed_this_month: 1,
      occurrences_this_month: 27,
      high_severity_occurrences_this_month: 11,
      critical_severity_occurrences_this_month: 4,
      auto_detected_spikes_this_month: 3,
      resolution_rate_this_month: 0.8
    },
    bundles: {
      failure_created_this_month: 9,
      failure_updated_this_month: 6,
      failure_generation_failed_this_month: 1,
      improvement_created_this_month: 5,
      improvement_generation_failed_this_month: 2,
      reproductions_created_this_month: 7,
      reproductions_failed_this_month: 1
    },
    improvements: {
      opened_this_month: 6,
      resolved_this_month: 3,
      snoozed_this_month: 1,
      resolution_rate_this_month: 0.5,
      recurring_incident_opened_this_month: 2,
      post_deploy_regression_opened_this_month: 1,
      slow_request_opened_this_month: 1,
      request_failure_opened_this_month: 1,
      warning_log_opened_this_month: 1
    },
    billing: {
      trials_started_this_month: 4,
      trials_converted_this_month: 2,
      trials_expired_this_month: 1,
      plan_upgrades_this_month: 3,
      plan_downgrades_this_month: 1,
      capacity_units_purchased_this_month: 12,
      capacity_units_reduced_this_month: 3
    },
    health: {
      raw_events_rejected_this_month: 17,
      malformed_rejections_this_month: 4,
      rate_limited_rejections_this_month: 5,
      quota_rejections_this_month: 2,
      capture_policy_rejections_this_month: 3,
      capture_rule_rejections_this_month: 3,
      alert_deliveries_failed_this_month: 2,
      webhook_deliveries_failed_this_month: 1,
      weekly_reports_failed_this_month: 1,
      github_dispatches_failed_this_month: 2,
      webhooks_auto_disabled_this_month: 1,
      operational_emails_sent_this_month: 8,
      allowance_warning_emails_sent_this_month: 2,
      allowance_limit_emails_sent_this_month: 1
    }
  };
}

function createServer(overrides: {
  adminAnalytics?: ApiServerDependencies["adminAnalytics"];
  auditLogging?: ApiServerDependencies["auditLogging"];
  webAuth?: NonNullable<ApiServerDependencies["webAuth"]>;
} = {}): ReturnType<typeof createApiServer> {
  return createApiServer({
    ingestionPersistence: {
      persistAndEnqueue: vi.fn()
    },
    ingestionMetadata: {
      resolveProjectByTokenHash: vi.fn()
    },
    memberAuth: {
      resolveMemberByTokenHash: vi.fn().mockResolvedValue(null)
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
      listIncidentLogsForOrganization: vi.fn().mockResolvedValue([]),
      listServicesForOrganization: vi.fn().mockResolvedValue([])
    },
    objectStoreReader: {
      getObject: vi.fn()
    },
    webhookDelivery: {
      listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] }),
      retryDeliveryForOrganization: vi.fn().mockResolvedValue(null)
    },
    ...(overrides.adminAnalytics === undefined ? {} : { adminAnalytics: overrides.adminAnalytics }),
    ...(overrides.auditLogging === undefined ? {} : { auditLogging: overrides.auditLogging }),
    ...(overrides.webAuth === undefined ? {} : { webAuth: overrides.webAuth })
  });
}

describe("api admin analytics routes", () => {
  it("returns the aggregate summary for allowlisted verified browser sessions", async (): Promise<void> => {
    const createAuditLog = vi.fn().mockResolvedValue(undefined);
    const getSummary = vi.fn().mockResolvedValue(createSummary());
    const app = createServer({
      auditLogging: { createAuditLog },
      adminAnalytics: {
        isOperatorAllowed: ({ email }) => email === "owen@example.com",
        getSummary
      },
      webAuth: createWebAuth({
        resolveSessionByToken: vi.fn().mockResolvedValue({
          session_id: "sess_123",
          user_id: "usr_123",
          email: "owen@example.com",
          email_verified_at: "2026-06-01T00:00:00.000Z",
          organization_id: "org_123",
          role: "owner",
          created_at: "2026-06-01T00:00:00.000Z",
          expires_at: "2026-06-19T00:00:00.000Z",
          revoked_at: null,
          has_email_auth: true,
          has_github_oauth: true
        })
      })
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/admin/analytics/summary",
      headers: {
        cookie: "dbundle_session=session-secret"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual({ summary: createSummary() });
    expect(getSummary).toHaveBeenCalledWith({
      now: expect.any(String)
    });
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "org_123",
        actor_user_id: "usr_123",
        action: "analytics.admin_summary",
        target_type: "admin_analytics",
        target_id: "summary",
        status: "success",
        metadata: expect.objectContaining({
          reason: "success",
          email_hash: expect.any(String)
        })
      })
    );
  });

  it("returns not found for missing browser sessions", async (): Promise<void> => {
    const app = createServer();

    const response = await app.inject({
      method: "GET",
      url: "/v1/admin/analytics/summary"
    });

    expect(response.statusCode).toBe(404);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual({ error: "not_found" });
  });

  it("returns not found for invalid browser sessions", async (): Promise<void> => {
    const getSummary = vi.fn();
    const app = createServer({
      adminAnalytics: {
        isOperatorAllowed: () => true,
        getSummary
      },
      webAuth: createWebAuth({
        resolveSessionByToken: vi.fn().mockResolvedValue(null)
      })
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/admin/analytics/summary",
      headers: {
        cookie: "dbundle_session=expired-session"
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual({ error: "not_found" });
    expect(getSummary).not.toHaveBeenCalled();
  });

  it("returns not found for allowlisted sessions without a verified email", async (): Promise<void> => {
    const createAuditLog = vi.fn().mockResolvedValue(undefined);
    const getSummary = vi.fn();
    const app = createServer({
      auditLogging: { createAuditLog },
      adminAnalytics: {
        isOperatorAllowed: ({ email }) => email === "owen@example.com",
        getSummary
      },
      webAuth: createWebAuth({
        resolveSessionByToken: vi.fn().mockResolvedValue({
          session_id: "sess_123",
          user_id: "usr_123",
          email: "owen@example.com",
          email_verified_at: null,
          organization_id: "org_123",
          role: "owner",
          created_at: "2026-06-01T00:00:00.000Z",
          expires_at: "2026-06-19T00:00:00.000Z",
          revoked_at: null,
          has_email_auth: true,
          has_github_oauth: false
        })
      })
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/admin/analytics/summary",
      headers: {
        cookie: "dbundle_session=session-secret"
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual({ error: "not_found" });
    expect(getSummary).not.toHaveBeenCalled();
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failure",
        metadata: expect.objectContaining({
          reason: "email_auth_required"
        })
      })
    );
  });

  it("returns not found for non-allowlisted verified users", async (): Promise<void> => {
    const createAuditLog = vi.fn().mockResolvedValue(undefined);
    const getSummary = vi.fn();
    const app = createServer({
      auditLogging: { createAuditLog },
      adminAnalytics: {
        isOperatorAllowed: () => false,
        getSummary
      },
      webAuth: createWebAuth({
        resolveSessionByToken: vi.fn().mockResolvedValue({
          session_id: "sess_123",
          user_id: "usr_123",
          email: "someone@example.com",
          email_verified_at: "2026-06-01T00:00:00.000Z",
          organization_id: "org_123",
          role: "owner",
          created_at: "2026-06-01T00:00:00.000Z",
          expires_at: "2026-06-19T00:00:00.000Z",
          revoked_at: null,
          has_email_auth: true,
          has_github_oauth: false
        })
      })
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/admin/analytics/summary",
      headers: {
        cookie: "dbundle_session=session-secret"
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual({ error: "not_found" });
    expect(getSummary).not.toHaveBeenCalled();
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failure",
        metadata: expect.objectContaining({
          reason: "not_allowlisted"
        })
      })
    );
  });

  it("returns not found for allowlisted GitHub-only sessions", async (): Promise<void> => {
    const createAuditLog = vi.fn().mockResolvedValue(undefined);
    const getSummary = vi.fn();
    const app = createServer({
      auditLogging: { createAuditLog },
      adminAnalytics: {
        isOperatorAllowed: ({ email }) => email === "owen@example.com",
        getSummary
      },
      webAuth: createWebAuth({
        resolveSessionByToken: vi.fn().mockResolvedValue({
          session_id: "sess_123",
          user_id: "usr_123",
          email: "owen@example.com",
          email_verified_at: "2026-06-01T00:00:00.000Z",
          organization_id: "org_123",
          role: "owner",
          created_at: "2026-06-01T00:00:00.000Z",
          expires_at: "2026-06-19T00:00:00.000Z",
          revoked_at: null,
          has_email_auth: false,
          has_github_oauth: true
        })
      })
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/admin/analytics/summary",
      headers: {
        cookie: "dbundle_session=session-secret"
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual({ error: "not_found" });
    expect(getSummary).not.toHaveBeenCalled();
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failure",
        metadata: expect.objectContaining({
          reason: "email_auth_required"
        })
      })
    );
  });

  it("returns not found when analytics is unavailable even for signed-in users", async (): Promise<void> => {
    const createAuditLog = vi.fn().mockResolvedValue(undefined);
    const app = createServer({
      auditLogging: { createAuditLog },
      webAuth: createWebAuth({
        resolveSessionByToken: vi.fn().mockResolvedValue({
          session_id: "sess_123",
          user_id: "usr_123",
          email: "owen@example.com",
          email_verified_at: "2026-06-01T00:00:00.000Z",
          organization_id: "org_123",
          role: "owner",
          created_at: "2026-06-01T00:00:00.000Z",
          expires_at: "2026-06-19T00:00:00.000Z",
          revoked_at: null,
          has_email_auth: true,
          has_github_oauth: false
        })
      })
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/admin/analytics/summary",
      headers: {
        cookie: "dbundle_session=session-secret"
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual({ error: "not_found" });
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failure",
        metadata: expect.objectContaining({
          reason: "analytics_unavailable"
        })
      })
    );
  });

  it("does not accept member-token auth for admin analytics", async (): Promise<void> => {
    const app = createServer({
      adminAnalytics: {
        isOperatorAllowed: () => true,
        getSummary: vi.fn().mockResolvedValue(createSummary())
      },
      webAuth: createWebAuth()
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/admin/analytics/summary",
      headers: {
        authorization: "Bearer dbundle_mem_test",
        cookie: "dbundle_session=session-secret"
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual({ error: "not_found" });
  });
});
