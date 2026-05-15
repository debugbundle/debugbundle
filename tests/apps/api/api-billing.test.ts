import { describe, expect, it, vi } from "vitest";

import { SESSION_COOKIE_NAME, buildCsrfToken } from "../../../packages/auth/src/index.js";
import { createApiServer } from "../../../apps/api/src/server.ts";
import { mockedObject, type MockedMethods } from "../../helpers/vitest.ts";

type ApiServerDependencies = Parameters<typeof createApiServer>[0];
type AuthRateLimiterDependency = MockedMethods<NonNullable<ApiServerDependencies["authRateLimiter"]>>;
type AuditLoggingDependency = MockedMethods<NonNullable<ApiServerDependencies["auditLogging"]>>;
type MemberAuthDependency = MockedMethods<ApiServerDependencies["memberAuth"]>;
type WebAuthDependency = MockedMethods<NonNullable<ApiServerDependencies["webAuth"]>>;
type BillingManagementDependency = MockedMethods<NonNullable<ApiServerDependencies["billingManagement"]>>;

function createServer(overrides: {
  authRateLimiter?: Partial<AuthRateLimiterDependency>;
  auditLogging?: AuditLoggingDependency | undefined;
  memberAuth?: Partial<MemberAuthDependency>;
  webAuth?: Partial<WebAuthDependency>;
  billingManagement?: BillingManagementDependency | undefined;
} = {}): ReturnType<typeof createApiServer> {
  const hasBillingOverride = Object.prototype.hasOwnProperty.call(overrides, "billingManagement");

  return createApiServer({
    ingestionPersistence: {
      persistAndEnqueue: vi.fn()
    },
    ingestionMetadata: {
      resolveProjectByTokenHash: vi.fn()
    },
    ...(overrides.authRateLimiter === undefined
      ? {}
      : {
          authRateLimiter: {
            claimRequest: overrides.authRateLimiter.claimRequest ?? vi.fn().mockResolvedValue({
              allowed: true,
              limit: 30,
              remaining: 29,
              retry_after_ms: 0
            })
          }
        }),
    memberAuth: {
      resolveMemberByTokenHash: vi.fn().mockResolvedValue(null),
      ...overrides.memberAuth
    } as ApiServerDependencies["memberAuth"],
    webAuth: mockedObject<NonNullable<ApiServerDependencies["webAuth"]>>({
      requestEmailCode: vi.fn(),
      verifyEmailCode: vi.fn(),
      beginGithubAuth: vi.fn(),
      completeGithubAuth: vi.fn(),
      acceptInviteForSession: vi.fn(),
      revokeSessionByToken: vi.fn(),
      resolveSessionByToken: vi.fn().mockResolvedValue(null),
      ...overrides.webAuth
    }),
    tokenManagement: mockedObject<ApiServerDependencies["tokenManagement"]>({
      listProjectTokensForOrganization: vi.fn().mockResolvedValue([]),
      createProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      listMemberTokensForOrganization: vi.fn().mockResolvedValue([]),
      createMemberTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeMemberTokenForOrganization: vi.fn().mockResolvedValue(null)
    }),
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
    ...(overrides.auditLogging === undefined ? {} : { auditLogging: overrides.auditLogging }),
    ...(hasBillingOverride ? { billingManagement: overrides.billingManagement } : {})
  });
}

describe("api billing routes", () => {
  it("should reject billing requests without a valid session and when billing dependencies are unavailable", async (): Promise<void> => {
    const unauthenticatedApp = createServer();
    const missingDepsApp = createServer({
      webAuth: {
        resolveSessionByToken: vi.fn().mockResolvedValue({
          user_id: "usr_123",
          email: "owner@example.com",
          organization_id: "org_123",
          email_verified_at: "2026-03-17T00:00:00.000Z",
          role: "owner"
        })
      },
      billingManagement: undefined
    });

    const unauthenticated = await unauthenticatedApp.inject({
      method: "GET",
      url: "/v1/billing"
    });
    const missingDeps = await missingDepsApp.inject({
      method: "GET",
      url: "/v1/billing",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      }
    });

    expect(unauthenticated.statusCode).toBe(401);
    expect(unauthenticated.json()).toEqual({ error: "invalid_session" });
    expect(missingDeps.statusCode).toBe(404);
    expect(missingDeps.json()).toEqual({ error: "billing_not_available" });
  });

  it("should keep auth and CSRF checks enabled for billing routes in self-host mode", async (): Promise<void> => {
    vi.stubEnv("SELFHOST_MODE", "true");

    const billingManagement = {
      getBillingSummaryForOrganization: vi.fn().mockResolvedValue({
        plan: "free",
        stripe_customer_id: null,
        active_projects: 1,
        capacity_units: {
          total: 1,
          included: 1,
          additional_purchased: 0,
          pending_reduction: null
        },
        usage_window: {
          starts_at: "2026-03-01T00:00:00.000Z",
          ends_at: "2026-04-01T00:00:00.000Z"
        },
        allowances: {
          monthly_bundle_requests: { used: 10, limit: 100 },
          monthly_raw_ingested_events: { used: 120, limit: 750 },
          retained_bundle_cap: { used: 6, limit: 50 },
          monthly_remote_activations: { used: 0, limit: 0 },
          monthly_alert_deliveries: { used: 4, limit: 25 }
        }
      }),
      createCheckoutLink: vi.fn().mockResolvedValue({ url: "https://billing.stripe.com/checkout/solo" }),
      createPortalLink: vi.fn().mockResolvedValue(null),
      increaseCapacity: vi.fn().mockResolvedValue(null),
      scheduleCapacityReduction: vi.fn().mockResolvedValue(null),
      cancelCapacityReduction: vi.fn().mockResolvedValue(null)
    };

    const unauthenticatedApp = createServer({ billingManagement });
    const missingCsrfApp = createServer({
      webAuth: {
        resolveSessionByToken: vi.fn().mockResolvedValue({
          user_id: "usr_123",
          email: "owner@example.com",
          organization_id: "org_123",
          email_verified_at: "2026-03-17T00:00:00.000Z",
          role: "owner"
        })
      },
      billingManagement
    });

    try {
      const unauthenticated = await unauthenticatedApp.inject({
        method: "POST",
        url: "/v1/billing/checkout",
        payload: {
          target_plan: "solo"
        }
      });
      const missingCsrf = await missingCsrfApp.inject({
        method: "POST",
        url: "/v1/billing/checkout",
        cookies: {
          [SESSION_COOKIE_NAME]: "session-secret"
        },
        payload: {
          target_plan: "solo"
        }
      });

      expect(unauthenticated.statusCode).toBe(401);
      expect(unauthenticated.json()).toEqual({ error: "invalid_session" });
      expect(missingCsrf.statusCode).toBe(403);
      expect(missingCsrf.json()).toEqual({ error: "invalid_csrf_token" });
      expect(billingManagement.createCheckoutLink).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("should return billing summary for owner sessions", async (): Promise<void> => {
    const billingManagement = {
      getBillingSummaryForOrganization: vi.fn().mockResolvedValue({
        plan: "solo",
        stripe_customer_id: "cus_123",
        active_projects: 1,
        capacity_units: {
          total: 3,
          included: 3,
          additional_purchased: 0,
          pending_reduction: null
        },
        usage_window: {
          starts_at: "2026-03-01T00:00:00.000Z",
          ends_at: "2026-04-01T00:00:00.000Z"
        },
        allowances: {
          monthly_bundle_requests: {
            used: 180,
            limit: 750
          },
          monthly_raw_ingested_events: {
            used: 800,
            limit: 10500
          },
          retained_bundle_cap: {
            used: 40,
            limit: 450
          },
          monthly_remote_activations: {
            used: 3,
            limit: 75
          },
          monthly_alert_deliveries: {
            used: 10,
            limit: 225
          }
        }
      }),
      createCheckoutLink: vi.fn().mockResolvedValue(null),
      createPortalLink: vi.fn().mockResolvedValue(null),
      increaseCapacity: vi.fn().mockResolvedValue(null),
      scheduleCapacityReduction: vi.fn().mockResolvedValue(null),
      cancelCapacityReduction: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({
      webAuth: {
        resolveSessionByToken: vi.fn().mockResolvedValue({
          user_id: "usr_123",
          email: "owner@example.com",
          organization_id: "org_123",
          email_verified_at: "2026-03-17T00:00:00.000Z",
          role: "owner"
        })
      },
      billingManagement
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/billing",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      billing: {
        plan: "solo",
        stripe_customer_id: "cus_123",
        active_projects: 1,
        capacity_units: {
          total: 3,
          included: 3,
          additional_purchased: 0,
          pending_reduction: null
        },
        usage_window: {
          starts_at: "2026-03-01T00:00:00.000Z",
          ends_at: "2026-04-01T00:00:00.000Z"
        },
        allowances: {
          monthly_bundle_requests: {
            used: 180,
            limit: 750
          },
          monthly_raw_ingested_events: {
            used: 800,
            limit: 10500
          },
          retained_bundle_cap: {
            used: 40,
            limit: 450
          },
          monthly_remote_activations: {
            used: 3,
            limit: 75
          },
          monthly_alert_deliveries: {
            used: 10,
            limit: 225
          }
        }
      }
    });
    expect(billingManagement.getBillingSummaryForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      now: expect.any(String)
    });
  });

  it("should rate limit billing mutations for owner browser sessions", async (): Promise<void> => {
    const claimRequest = vi.fn().mockResolvedValue({
      allowed: false,
      limit: 30,
      remaining: 0,
      retry_after_ms: 12_000
    });
    const billingManagement = {
      getBillingSummaryForOrganization: vi.fn().mockResolvedValue(null),
      createCheckoutLink: vi.fn().mockResolvedValue(null),
      createPortalLink: vi.fn().mockResolvedValue(null),
      increaseCapacity: vi.fn().mockResolvedValue(null),
      scheduleCapacityReduction: vi.fn().mockResolvedValue(null),
      cancelCapacityReduction: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({
      authRateLimiter: { claimRequest },
      webAuth: {
        resolveSessionByToken: vi.fn().mockResolvedValue({
          user_id: "usr_123",
          email: "owner@example.com",
          organization_id: "org_123",
          email_verified_at: "2026-03-17T00:00:00.000Z",
          role: "owner"
        })
      },
      billingManagement
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/billing/checkout",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=session-secret`,
        "x-csrf-token": buildCsrfToken("session-secret")
      },
      payload: {
        target_plan: "solo"
      }
    });

    expect(response.statusCode).toBe(429);
    expect(response.json()).toEqual({ error: "rate_limited" });
    expect(response.headers["retry-after"]).toBe("12");
    expect(claimRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: "management-write",
        subject: "member:usr_123",
        limit: 30
      })
    );
    expect(billingManagement.getBillingSummaryForOrganization).not.toHaveBeenCalled();
  });

  it("should return billing summary for owner member tokens", async (): Promise<void> => {
    const billingManagement = {
      getBillingSummaryForOrganization: vi.fn().mockResolvedValue({
        plan: "team",
        stripe_customer_id: "cus_123",
        active_projects: 3,
        capacity_units: {
          total: 18,
          included: 15,
          additional_purchased: 3,
          pending_reduction: null
        },
        usage_window: {
          starts_at: "2026-03-01T00:00:00.000Z",
          ends_at: "2026-04-01T00:00:00.000Z"
        },
        allowances: {
          monthly_bundle_requests: { used: 10, limit: 9000 },
          monthly_raw_ingested_events: { used: 250, limit: 90000 },
          retained_bundle_cap: { used: 12, limit: 5400 },
          monthly_remote_activations: { used: 4, limit: 900 },
          monthly_alert_deliveries: { used: 15, limit: 2700 }
        }
      }),
      createCheckoutLink: vi.fn().mockResolvedValue(null),
      createPortalLink: vi.fn().mockResolvedValue(null),
      increaseCapacity: vi.fn().mockResolvedValue(null),
      scheduleCapacityReduction: vi.fn().mockResolvedValue(null),
      cancelCapacityReduction: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({
          member_id: "usr_123",
          organization_id: "org_123",
          role: "owner"
        })
      },
      billingManagement
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/billing",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      billing: expect.objectContaining({
        plan: "team",
        capacity_units: expect.objectContaining({
          additional_purchased: 3,
          total: 18
        })
      })
    });
  });

  it("should create a checkout link for owners and reject member sessions", async (): Promise<void> => {
    const createAuditLog = vi.fn().mockResolvedValue(undefined);
    const billingManagement = {
      getBillingSummaryForOrganization: vi.fn().mockResolvedValue({
        plan: "free",
        stripe_customer_id: null,
        active_projects: 1,
        capacity_units: {
          total: 1,
          included: 1,
          additional_purchased: 0,
          pending_reduction: null
        },
        usage_window: {
          starts_at: "2026-03-01T00:00:00.000Z",
          ends_at: "2026-04-01T00:00:00.000Z"
        },
        allowances: {
          monthly_bundle_requests: {
            used: 10,
            limit: 100
          },
          monthly_raw_ingested_events: {
            used: 120,
            limit: 750
          },
          retained_bundle_cap: {
            used: 6,
            limit: 50
          },
          monthly_remote_activations: {
            used: 0,
            limit: 0
          },
          monthly_alert_deliveries: {
            used: 4,
            limit: 25
          }
        }
      }),
      createCheckoutLink: vi.fn().mockResolvedValue({
        url: "https://billing.stripe.com/checkout/solo"
      }),
      createPortalLink: vi.fn().mockResolvedValue(null),
      increaseCapacity: vi.fn().mockResolvedValue(null),
      scheduleCapacityReduction: vi.fn().mockResolvedValue(null),
      cancelCapacityReduction: vi.fn().mockResolvedValue(null)
    };
    const verifiedOwnerApp = createServer({
      auditLogging: { createAuditLog },
      webAuth: {
        resolveSessionByToken: vi.fn().mockResolvedValue({
          user_id: "usr_123",
          email: "owner@example.com",
          organization_id: "org_123",
          email_verified_at: "2026-03-17T00:00:00.000Z",
          role: "owner"
        })
      },
      billingManagement
    });
    const memberApp = createServer({
      webAuth: {
        resolveSessionByToken: vi.fn().mockResolvedValue({
          user_id: "usr_123",
          email: "member@example.com",
          organization_id: "org_123",
          email_verified_at: "2026-03-17T00:00:00.000Z",
          role: "member"
        })
      },
      billingManagement
    });
    const unverifiedApp = createServer({
      webAuth: {
        resolveSessionByToken: vi.fn().mockResolvedValue({
          user_id: "usr_123",
          email: "owner@example.com",
          organization_id: "org_123",
          email_verified_at: null,
          role: "owner"
        })
      },
      billingManagement
    });

    const csrfToken = buildCsrfToken("session-secret");
    const verified = await verifiedOwnerApp.inject({
      method: "POST",
      url: "/v1/billing/checkout",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      },
      headers: {
        "x-csrf-token": csrfToken
      },
      payload: {
        target_plan: "solo"
      }
    });
    const member = await memberApp.inject({
      method: "POST",
      url: "/v1/billing/checkout",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      },
      headers: {
        "x-csrf-token": csrfToken
      },
      payload: {
        target_plan: "solo"
      }
    });
    const unverified = await unverifiedApp.inject({
      method: "POST",
      url: "/v1/billing/checkout",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      },
      headers: {
        "x-csrf-token": csrfToken
      },
      payload: {
        target_plan: "solo"
      }
    });

    expect(verified.statusCode).toBe(200);
    expect(verified.json()).toEqual({
      url: "https://billing.stripe.com/checkout/solo"
    });
    expect(billingManagement.createCheckoutLink).toHaveBeenCalledWith({
      organization_id: "org_123",
      billing_email: "owner@example.com",
      current_plan: "free",
      target_plan: "solo"
    });
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "org_123",
        actor_user_id: "usr_123",
        actor_type: "browser_session",
        action: "billing.checkout",
        target_type: "billing_checkout",
        target_id: "org_123",
        status: "success",
        occurred_at: expect.any(String),
        metadata: {
          current_plan: "free",
          target_plan: "solo"
        }
      })
    );
    expect(member.statusCode).toBe(403);
    expect(member.json()).toEqual({ error: "forbidden" });
    expect(unverified.statusCode).toBe(200);
    expect(unverified.json()).toEqual({
      url: "https://billing.stripe.com/checkout/solo"
    });
  });

  it("should create a customer-portal link for paid owners", async (): Promise<void> => {
    const createAuditLog = vi.fn().mockResolvedValue(undefined);
    const billingManagement = {
      getBillingSummaryForOrganization: vi.fn().mockResolvedValue({
        plan: "team",
        stripe_customer_id: "cus_123",
        active_projects: 4,
        capacity_units: {
          total: 15,
          included: 15,
          additional_purchased: 0,
          pending_reduction: null
        },
        usage_window: {
          starts_at: "2026-03-01T00:00:00.000Z",
          ends_at: "2026-04-01T00:00:00.000Z"
        },
        allowances: {
          monthly_bundle_requests: {
            used: 600,
            limit: 15000
          },
          monthly_raw_ingested_events: {
            used: 3200,
            limit: 150000
          },
          retained_bundle_cap: {
            used: 75,
            limit: 6000
          },
          monthly_remote_activations: {
            used: 30,
            limit: 750
          },
          monthly_alert_deliveries: {
            used: 90,
            limit: 4500
          }
        }
      }),
      createCheckoutLink: vi.fn().mockResolvedValue(null),
      createPortalLink: vi.fn().mockResolvedValue({
        url: "https://billing.stripe.com/p/session_123"
      }),
      increaseCapacity: vi.fn().mockResolvedValue(null),
      scheduleCapacityReduction: vi.fn().mockResolvedValue(null),
      cancelCapacityReduction: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({
      auditLogging: { createAuditLog },
      webAuth: {
        resolveSessionByToken: vi.fn().mockResolvedValue({
          user_id: "usr_123",
          email: "owner@example.com",
          organization_id: "org_123",
          email_verified_at: "2026-03-17T00:00:00.000Z",
          role: "owner"
        })
      },
      billingManagement
    });

    const csrfToken = buildCsrfToken("session-secret");
    const response = await app.inject({
      method: "POST",
      url: "/v1/billing/portal",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      },
      headers: {
        "x-csrf-token": csrfToken
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      url: "https://billing.stripe.com/p/session_123"
    });
    expect(billingManagement.createPortalLink).toHaveBeenCalledWith({
      organization_id: "org_123",
      current_plan: "team"
    });
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "org_123",
        actor_user_id: "usr_123",
        actor_type: "browser_session",
        action: "billing.portal",
        target_type: "billing_portal",
        target_id: "org_123",
        status: "success",
        occurred_at: expect.any(String),
        metadata: {
          current_plan: "team"
        }
      })
    );
  });

  it("should increase allowance capacity for owners", async (): Promise<void> => {
    const billingManagement = {
      getBillingSummaryForOrganization: vi.fn().mockResolvedValue(null),
      createCheckoutLink: vi.fn().mockResolvedValue(null),
      createPortalLink: vi.fn().mockResolvedValue(null),
      increaseCapacity: vi.fn().mockResolvedValue({
        plan: "solo",
        stripe_customer_id: "cus_123",
        active_projects: 2,
        capacity_units: {
          total: 6,
          included: 3,
          additional_purchased: 3,
          pending_reduction: null
        },
        usage_window: {
          starts_at: "2026-03-23T11:56:12.000Z",
          ends_at: "2026-04-23T11:56:12.000Z"
        },
        allowances: {
          monthly_bundle_requests: { used: 20, limit: 1500 },
          monthly_raw_ingested_events: { used: 200, limit: 12000 },
          retained_bundle_cap: { used: 5, limit: 900 },
          monthly_remote_activations: { used: 1, limit: 150 },
          monthly_alert_deliveries: { used: 3, limit: 450 }
        }
      }),
      scheduleCapacityReduction: vi.fn().mockResolvedValue(null),
      cancelCapacityReduction: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({
      webAuth: {
        resolveSessionByToken: vi.fn().mockResolvedValue({
          user_id: "usr_123",
          email: "owner@example.com",
          organization_id: "org_123",
          email_verified_at: "2026-03-17T00:00:00.000Z",
          role: "owner"
        })
      },
      billingManagement
    });

    const csrfToken = buildCsrfToken("session-secret");
    const response = await app.inject({
      method: "POST",
      url: "/v1/billing/capacity/increase",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      },
      headers: {
        "x-csrf-token": csrfToken
      },
      payload: {
        target_additional_capacity_units: 3
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      billing: expect.objectContaining({
        capacity_units: expect.objectContaining({
          additional_purchased: 3,
          total: 6
        })
      })
    });
    expect(billingManagement.increaseCapacity).toHaveBeenCalledWith({
      organization_id: "org_123",
      target_additional_capacity_units: 3,
      now: expect.any(String)
    });
  });

  it("should allow owner member tokens to schedule allowance-capacity reductions", async (): Promise<void> => {
    const billingManagement = {
      getBillingSummaryForOrganization: vi.fn().mockResolvedValue(null),
      createCheckoutLink: vi.fn().mockResolvedValue(null),
      createPortalLink: vi.fn().mockResolvedValue(null),
      increaseCapacity: vi.fn().mockResolvedValue(null),
      scheduleCapacityReduction: vi.fn().mockResolvedValue({
        plan: "solo",
        stripe_customer_id: "cus_123",
        active_projects: 3,
        capacity_units: {
          total: 5,
          included: 3,
          additional_purchased: 2,
          pending_reduction: {
            additional_purchased: 0,
            total: 3,
            effective_at: "2026-04-23T11:56:12.000Z"
          }
        },
        usage_window: {
          starts_at: "2026-03-23T11:56:12.000Z",
          ends_at: "2026-04-23T11:56:12.000Z"
        },
        allowances: {
          monthly_bundle_requests: { used: 20, limit: 1250 },
          monthly_raw_ingested_events: { used: 200, limit: 10000 },
          retained_bundle_cap: { used: 5, limit: 750 },
          monthly_remote_activations: { used: 1, limit: 125 },
          monthly_alert_deliveries: { used: 3, limit: 375 }
        }
      }),
      cancelCapacityReduction: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({
          member_id: "usr_123",
          organization_id: "org_123",
          role: "owner"
        })
      },
      billingManagement
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/billing/capacity/scheduled-reduction",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        target_additional_capacity_units: 0
      }
    });

    expect(response.statusCode).toBe(200);
    expect(billingManagement.scheduleCapacityReduction).toHaveBeenCalledWith({
      organization_id: "org_123",
      target_additional_capacity_units: 0,
      now: expect.any(String)
    });
  });

  it("should return scheduled capacity reductions in billing responses", async (): Promise<void> => {
    const billingManagement = {
      getBillingSummaryForOrganization: vi.fn().mockResolvedValue({
        plan: "solo",
        stripe_customer_id: "cus_123",
        active_projects: 3,
        capacity_units: {
          total: 5,
          included: 3,
          additional_purchased: 2,
          pending_reduction: {
            additional_purchased: 1,
            total: 4,
            effective_at: "2026-04-23T11:56:12.000Z"
          }
        },
        usage_window: {
          starts_at: "2026-03-23T11:56:12.000Z",
          ends_at: "2026-04-23T11:56:12.000Z"
        },
        allowances: {
          monthly_bundle_requests: { used: 20, limit: 1250 },
          monthly_raw_ingested_events: { used: 200, limit: 10000 },
          retained_bundle_cap: { used: 5, limit: 750 },
          monthly_remote_activations: { used: 1, limit: 125 },
          monthly_alert_deliveries: { used: 3, limit: 375 }
        }
      }),
      createCheckoutLink: vi.fn().mockResolvedValue(null),
      createPortalLink: vi.fn().mockResolvedValue(null),
      increaseCapacity: vi.fn().mockResolvedValue(null),
      scheduleCapacityReduction: vi.fn().mockResolvedValue(null),
      cancelCapacityReduction: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({
      webAuth: {
        resolveSessionByToken: vi.fn().mockResolvedValue({
          user_id: "usr_123",
          email: "owner@example.com",
          organization_id: "org_123",
          email_verified_at: "2026-03-17T00:00:00.000Z",
          role: "owner"
        })
      },
      billingManagement
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/billing",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      billing: expect.objectContaining({
        capacity_units: expect.objectContaining({
          pending_reduction: {
            additional_purchased: 1,
            total: 4,
            effective_at: "2026-04-23T11:56:12.000Z"
          }
        })
      })
    });
  });

  it("should map checkout and portal failure statuses for owners", async (): Promise<void> => {
    const createAuditLog = vi.fn().mockResolvedValue(undefined);
    const billingManagement = {
      getBillingSummaryForOrganization: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          plan: "team",
          stripe_customer_id: "cus_123",
          active_projects: 2,
          capacity_units: {
            total: 15,
            included: 15,
            additional_purchased: 0,
            pending_reduction: null
          },
          usage_window: {
            starts_at: "2026-03-01T00:00:00.000Z",
            ends_at: "2026-04-01T00:00:00.000Z"
          },
          allowances: {
            monthly_bundle_requests: { used: 10, limit: 7500 },
            monthly_raw_ingested_events: { used: 100, limit: 150000 },
            retained_bundle_cap: { used: 5, limit: 6000 },
            monthly_remote_activations: { used: 1, limit: 750 },
            monthly_alert_deliveries: { used: 2, limit: 4500 }
          }
        })
        .mockResolvedValueOnce({
          plan: "free",
          stripe_customer_id: null,
          active_projects: 1,
          capacity_units: {
            total: 1,
            included: 1,
            additional_purchased: 0,
            pending_reduction: null
          },
          usage_window: {
            starts_at: "2026-03-01T00:00:00.000Z",
            ends_at: "2026-04-01T00:00:00.000Z"
          },
          allowances: {
            monthly_bundle_requests: { used: 10, limit: 100 },
            monthly_raw_ingested_events: { used: 100, limit: 750 },
            retained_bundle_cap: { used: 5, limit: 50 },
            monthly_remote_activations: { used: 0, limit: 0 },
            monthly_alert_deliveries: { used: 1, limit: 25 }
          }
        })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          plan: "free",
          stripe_customer_id: null,
          active_projects: 1,
          capacity_units: {
            total: 1,
            included: 1,
            additional_purchased: 0,
            pending_reduction: null
          },
          usage_window: {
            starts_at: "2026-03-01T00:00:00.000Z",
            ends_at: "2026-04-01T00:00:00.000Z"
          },
          allowances: {
            monthly_bundle_requests: { used: 10, limit: 100 },
            monthly_raw_ingested_events: { used: 100, limit: 750 },
            retained_bundle_cap: { used: 5, limit: 50 },
            monthly_remote_activations: { used: 0, limit: 0 },
            monthly_alert_deliveries: { used: 1, limit: 25 }
          }
        })
        .mockResolvedValueOnce({
          plan: "team",
          stripe_customer_id: "cus_123",
          active_projects: 2,
          capacity_units: {
            total: 15,
            included: 15,
            additional_purchased: 0,
            pending_reduction: null
          },
          usage_window: {
            starts_at: "2026-03-01T00:00:00.000Z",
            ends_at: "2026-04-01T00:00:00.000Z"
          },
          allowances: {
            monthly_bundle_requests: { used: 10, limit: 7500 },
            monthly_raw_ingested_events: { used: 100, limit: 150000 },
            retained_bundle_cap: { used: 5, limit: 6000 },
            monthly_remote_activations: { used: 1, limit: 750 },
            monthly_alert_deliveries: { used: 2, limit: 4500 }
          }
        }),
      createCheckoutLink: vi.fn().mockResolvedValue(null),
      createPortalLink: vi.fn().mockResolvedValue(null),
      increaseCapacity: vi.fn().mockResolvedValue(null),
      scheduleCapacityReduction: vi.fn().mockResolvedValue(null),
      cancelCapacityReduction: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({
      auditLogging: { createAuditLog },
      webAuth: {
        resolveSessionByToken: vi.fn().mockResolvedValue({
          user_id: "usr_123",
          email: "owner@example.com",
          organization_id: "org_123",
          email_verified_at: "2026-03-17T00:00:00.000Z",
          role: "owner"
        })
      },
      billingManagement
    });

    const csrfToken = buildCsrfToken("session-secret");

    const invalidPayload = await app.inject({
      method: "POST",
      url: "/v1/billing/checkout",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      },
      headers: {
        "x-csrf-token": csrfToken
      },
      payload: {
        target_plan: "enterprise"
      }
    });
    const missingBilling = await app.inject({
      method: "POST",
      url: "/v1/billing/checkout",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      },
      headers: {
        "x-csrf-token": csrfToken
      },
      payload: {
        target_plan: "solo"
      }
    });
    const invalidPlan = await app.inject({
      method: "POST",
      url: "/v1/billing/checkout",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      },
      headers: {
        "x-csrf-token": csrfToken
      },
      payload: {
        target_plan: "solo"
      }
    });
    const notConfiguredCheckout = await app.inject({
      method: "POST",
      url: "/v1/billing/checkout",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      },
      headers: {
        "x-csrf-token": csrfToken
      },
      payload: {
        target_plan: "solo"
      }
    });
    const missingPortalBilling = await app.inject({
      method: "POST",
      url: "/v1/billing/portal",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      },
      headers: {
        "x-csrf-token": csrfToken
      }
    });
    const noSubscriptionPortal = await app.inject({
      method: "POST",
      url: "/v1/billing/portal",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      },
      headers: {
        "x-csrf-token": csrfToken
      }
    });
    const notConfiguredPortal = await app.inject({
      method: "POST",
      url: "/v1/billing/portal",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      },
      headers: {
        "x-csrf-token": csrfToken
      }
    });

    expect(invalidPayload.statusCode).toBe(400);
    expect(invalidPayload.json()).toEqual({ error: "invalid_payload" });
    expect(missingBilling.statusCode).toBe(404);
    expect(missingBilling.json()).toEqual({ error: "billing_not_found" });
    expect(invalidPlan.statusCode).toBe(409);
    expect(invalidPlan.json()).toEqual({ error: "invalid_plan_change" });
    expect(notConfiguredCheckout.statusCode).toBe(503);
    expect(notConfiguredCheckout.json()).toEqual({ error: "billing_not_configured" });
    expect(missingPortalBilling.statusCode).toBe(404);
    expect(missingPortalBilling.json()).toEqual({ error: "billing_not_found" });
    expect(noSubscriptionPortal.statusCode).toBe(409);
    expect(noSubscriptionPortal.json()).toEqual({ error: "no_active_subscription" });
    expect(notConfiguredPortal.statusCode).toBe(503);
    expect(notConfiguredPortal.json()).toEqual({ error: "billing_not_configured" });
    expect(createAuditLog).toHaveBeenCalledTimes(6);
  });

  it("should confirm a returned Stripe checkout session and return the updated billing summary", async (): Promise<void> => {
    const confirmCheckoutSession = vi.fn().mockResolvedValue({
      plan: "solo",
      stripe_customer_id: "cus_123",
      active_projects: 1,
      capacity_units: {
        total: 3,
        included: 3,
        additional_purchased: 0,
        pending_reduction: null
      },
      usage_window: {
        starts_at: "2026-05-10T22:14:57.000Z",
        ends_at: "2026-06-10T22:14:57.000Z"
      },
      allowances: {
        monthly_bundle_requests: { used: 0, limit: 750 },
        monthly_raw_ingested_events: { used: 0, limit: 10500 },
        retained_bundle_cap: { used: 0, limit: 450 },
        monthly_remote_activations: { used: 0, limit: 75 },
        monthly_alert_deliveries: { used: 0, limit: 225 }
      }
    });
    const billingManagement = mockedObject<BillingManagementDependency>({
      getBillingSummaryForOrganization: vi.fn().mockResolvedValue(null),
      createCheckoutLink: vi.fn().mockResolvedValue(null),
      confirmCheckoutSession,
      createPortalLink: vi.fn().mockResolvedValue(null),
      increaseCapacity: vi.fn().mockResolvedValue(null),
      scheduleCapacityReduction: vi.fn().mockResolvedValue(null),
      cancelCapacityReduction: vi.fn().mockResolvedValue(null)
    });
    const app = createServer({
      webAuth: {
        resolveSessionByToken: vi.fn().mockResolvedValue({
          user_id: "usr_123",
          email: "owner@example.com",
          organization_id: "org_123",
          email_verified_at: "2026-03-17T00:00:00.000Z",
          role: "owner"
        })
      },
      billingManagement
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/billing/checkout/confirm",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      },
      headers: {
        "x-csrf-token": buildCsrfToken("session-secret")
      },
      payload: {
        session_id: "cs_test_123"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(confirmCheckoutSession).toHaveBeenCalledWith({
      organization_id: "org_123",
      session_id: "cs_test_123",
      now: expect.any(String)
    });
    expect(response.json()).toEqual({
      billing: expect.objectContaining({
        plan: "solo",
        stripe_customer_id: "cus_123"
      })
    });
  });

  it("should map allowance-capacity route failure statuses", async (): Promise<void> => {
    const billingManagement = {
      getBillingSummaryForOrganization: vi.fn().mockResolvedValue(null),
      createCheckoutLink: vi.fn().mockResolvedValue(null),
      createPortalLink: vi.fn().mockResolvedValue(null),
      increaseCapacity: vi
        .fn()
        .mockResolvedValueOnce("billing_not_configured")
        .mockResolvedValueOnce("billing_not_found")
        .mockResolvedValueOnce("pending_capacity_reduction_exists"),
      scheduleCapacityReduction: vi.fn().mockResolvedValueOnce("invalid_target_quantity"),
      cancelCapacityReduction: vi
        .fn()
        .mockResolvedValueOnce("capacity_reduction_not_found")
        .mockResolvedValueOnce("billing_not_found")
        .mockResolvedValueOnce("billing_not_configured")
    };
    const app = createServer({
      webAuth: {
        resolveSessionByToken: vi.fn().mockResolvedValue({
          user_id: "usr_123",
          email: "owner@example.com",
          organization_id: "org_123",
          email_verified_at: "2026-03-17T00:00:00.000Z",
          role: "owner"
        })
      },
      billingManagement
    });
    const invalidMemberTokenApp = createServer({
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue(null)
      },
      billingManagement
    });

    const csrfToken = buildCsrfToken("session-secret");

    const invalidIncreasePayload = await app.inject({
      method: "POST",
      url: "/v1/billing/capacity/increase",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      },
      headers: {
        "x-csrf-token": csrfToken
      },
      payload: {
        target_additional_capacity_units: 100
      }
    });
    const increaseNotConfigured = await app.inject({
      method: "POST",
      url: "/v1/billing/capacity/increase",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      },
      headers: {
        "x-csrf-token": csrfToken
      },
      payload: {
        target_additional_capacity_units: 2
      }
    });
    const increaseNotFound = await app.inject({
      method: "POST",
      url: "/v1/billing/capacity/increase",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      },
      headers: {
        "x-csrf-token": csrfToken
      },
      payload: {
        target_additional_capacity_units: 2
      }
    });
    const increaseConflict = await app.inject({
      method: "POST",
      url: "/v1/billing/capacity/increase",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      },
      headers: {
        "x-csrf-token": csrfToken
      },
      payload: {
        target_additional_capacity_units: 2
      }
    });
    const invalidSchedulePayload = await app.inject({
      method: "POST",
      url: "/v1/billing/capacity/scheduled-reduction",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      },
      headers: {
        "x-csrf-token": csrfToken
      },
      payload: {
        target_additional_capacity_units: 100
      }
    });
    const scheduleConflict = await app.inject({
      method: "POST",
      url: "/v1/billing/capacity/scheduled-reduction",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      },
      headers: {
        "x-csrf-token": csrfToken
      },
      payload: {
        target_additional_capacity_units: 0
      }
    });
    const cancelNotFound = await app.inject({
      method: "DELETE",
      url: "/v1/billing/capacity/scheduled-reduction",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      },
      headers: {
        "x-csrf-token": csrfToken
      }
    });
    const cancelBillingNotFound = await app.inject({
      method: "DELETE",
      url: "/v1/billing/capacity/scheduled-reduction",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      },
      headers: {
        "x-csrf-token": csrfToken
      }
    });
    const cancelNotConfigured = await app.inject({
      method: "DELETE",
      url: "/v1/billing/capacity/scheduled-reduction",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      },
      headers: {
        "x-csrf-token": csrfToken
      }
    });
    const invalidMemberToken = await invalidMemberTokenApp.inject({
      method: "DELETE",
      url: "/v1/billing/capacity/scheduled-reduction",
      headers: {
        authorization: "Bearer dbundle_mem_invalid"
      }
    });

    expect(invalidIncreasePayload.statusCode).toBe(400);
    expect(invalidIncreasePayload.json()).toEqual({ error: "invalid_payload" });
    expect(increaseNotConfigured.statusCode).toBe(503);
    expect(increaseNotConfigured.json()).toEqual({ error: "billing_not_configured" });
    expect(increaseNotFound.statusCode).toBe(404);
    expect(increaseNotFound.json()).toEqual({ error: "billing_not_found" });
    expect(increaseConflict.statusCode).toBe(409);
    expect(increaseConflict.json()).toEqual({ error: "pending_capacity_reduction_exists" });
    expect(invalidSchedulePayload.statusCode).toBe(400);
    expect(invalidSchedulePayload.json()).toEqual({ error: "invalid_payload" });
    expect(scheduleConflict.statusCode).toBe(409);
    expect(scheduleConflict.json()).toEqual({ error: "invalid_target_quantity" });
    expect(cancelNotFound.statusCode).toBe(409);
    expect(cancelNotFound.json()).toEqual({ error: "capacity_reduction_not_found" });
    expect(cancelBillingNotFound.statusCode).toBe(404);
    expect(cancelBillingNotFound.json()).toEqual({ error: "billing_not_found" });
    expect(cancelNotConfigured.statusCode).toBe(503);
    expect(cancelNotConfigured.json()).toEqual({ error: "billing_not_configured" });
    expect(invalidMemberToken.statusCode).toBe(401);
    expect(invalidMemberToken.json()).toEqual({ error: "invalid_member_token" });
  });
});