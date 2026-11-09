import { afterEach, describe, expect, it, vi } from "vitest";
import { createTokenApiServer } from "../../helpers/api-tokens.js";
import { mockedObject } from "../../helpers/vitest.js";
import type { ApiDependencies } from "../../../apps/api/src/api-types.js";
import { buildCsrfToken, SESSION_COOKIE_NAME } from "../../../packages/auth/src/index.js";

const org = "11111111-1111-4111-8111-111111111111";
const user = "22222222-2222-4222-8222-222222222222";
afterEach(() => vi.unstubAllEnvs());
describe("organization administration HTTP boundaries", () => {
  it.each(["true", "false"])(
    "reports the server-owned self-host entitlement hint for %s",
    async (mode) => {
      vi.stubEnv("SELFHOST_MODE", mode);
      const app = createTokenApiServer({
        projectManagement: mockedObject<NonNullable<ApiDependencies["projectManagement"]>>({ listProjectsForOrganization: vi.fn().mockResolvedValue([]) }),
        webAuth: {
          resolveSessionByToken: vi.fn().mockResolvedValue({
            session_id: "session",
            user_id: user,
            organization_id: org,
            email: "owner@example.test",
            email_verified_at: "2026-11-01T00:00:00.000Z",
            role: "owner",
            created_at: "2026-11-01T00:00:00.000Z",
            expires_at: "2027-11-01T00:00:00.000Z",
            revoked_at: null
          })
        }
      });
      try {
        const response = await app.inject({
          method: "GET",
          url: `/v1/auth/session?self_hosted=${mode !== "true"}`,
          headers: { cookie: `${SESSION_COOKIE_NAME}=secret` }
        });
        expect(response.statusCode).toBe(200);
        expect(response.json().session.self_hosted).toBe(mode === "true" ? true : undefined);
        expect(response.json().session.organization_plan).toBe("free");
      } finally {
        await app.close();
      }
    }
  );
  it("resends saved grants with a rotated secret and a shared organisation mail limit", async () => {
    const refresh = vi.fn().mockResolvedValue({
      invite_id: user,
      organization_id: org,
      email: "recipient@example.test",
      role: "member",
      project_access: "selected",
      default_project_role: "viewer",
      project_ids: [],
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86_400_000).toISOString()
    });
    const send = vi.fn().mockResolvedValue(undefined);
    const claimRequest = vi
      .fn()
      .mockResolvedValue({ allowed: true, limit: 30, remaining: 29, retry_after_ms: 0 });
    const app = createTokenApiServer({
      memberAuth: mockedObject<ApiDependencies["memberAuth"]>({
        resolveMemberByTokenHash: vi
          .fn()
          .mockResolvedValue({ member_id: user, organization_id: org, role: "owner" })
      }),
      organizationManagement: mockedObject<NonNullable<ApiDependencies["organizationManagement"]>>({
        refreshOrganizationInvite: refresh,
        listOrganizationsForUser: vi.fn().mockResolvedValue([])
      }),
      organizationEmails: { send },
      authRateLimiter: { claimRequest }
    });
    const request = {
      method: "POST" as const,
      url: `/v1/organizations/${org}/invites/${user}/resend`,
      headers: { authorization: "Bearer dbundle_mem_test" }
    };
    const response = await app.inject(request);
    expect(response.statusCode).toBe(200);
    expect(refresh).toHaveBeenCalledWith(
      expect.objectContaining({
        invite_id: user,
        invite_token_hash: expect.stringMatching(/^[a-f0-9]{64}$/)
      })
    );
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        token: expect.stringMatching(/^dbundle_org_invite_/),
        email: "recipient@example.test",
        access_summary: "Read-only access to selected projects."
      })
    );
    expect(response.body).not.toContain("dbundle_org_invite_");
    expect(claimRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: `organization-invitation-email:${org}`,
        bucket: "management-write",
        limit: 30
      })
    );
    send.mockRejectedValueOnce(new Error("delivery unavailable"));
    expect((await app.inject(request)).statusCode).toBe(503);
    claimRequest.mockImplementation(async (input: { subject: string }) => ({
      allowed: !input.subject.startsWith("organization-invitation-email:"),
      limit: 30,
      remaining: 0,
      retry_after_ms: 60_000
    }));
    expect((await app.inject(request)).statusCode).toBe(429);
    expect(refresh).toHaveBeenCalledTimes(2);
  });
  it("limits read-only organisation discovery to the token's named organisation", async () => {
    const app = createTokenApiServer({
      memberAuth: mockedObject<ApiDependencies["memberAuth"]>({
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({
          member_id: user,
          organization_id: org,
          role: "member",
          token_policy: {
            version: 1,
            mode: "organization",
            organization_id: org,
            permissions: ["project:read"]
          }
        })
      }),
      organizationManagement: mockedObject<NonNullable<ApiDependencies["organizationManagement"]>>({
        listOrganizationsForUser: vi.fn().mockResolvedValue([
          { organization_id: org, name: "Named", plan: "business", role: "member" },
          { organization_id: user, name: "Other", plan: "free", role: "owner" }
        ])
      })
    });
    const response = await app.inject({
      method: "GET",
      url: "/v1/organizations",
      headers: { authorization: "Bearer dbundle_mem_test" }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      organizations: [{ organization_id: org, name: "Named", plan: "business", role: "member" }]
    });
  });
  it("does not expand a legacy admin token into organization management", async () => {
    const list = vi.fn().mockResolvedValue([]);
    const app = createTokenApiServer({
      memberAuth: mockedObject<ApiDependencies["memberAuth"]>({
        resolveMemberByTokenHash: vi
          .fn()
          .mockResolvedValue({ member_id: user, organization_id: org, role: "admin" })
      }),
      organizationManagement: mockedObject<NonNullable<ApiDependencies["organizationManagement"]>>({
        listOrganizationPeople: list
      })
    });
    const response = await app.inject({
      method: "GET",
      url: `/v1/organizations/${org}/people`,
      headers: { authorization: "Bearer dbundle_mem_test" }
    });
    expect(response.statusCode).toBe(403);
    expect(list).not.toHaveBeenCalled();
  });
  it("audits successful and rejected organisation mutations without request secrets", async () => {
    const createAuditLog = vi.fn().mockResolvedValue(undefined);
    const update = vi.fn().mockResolvedValue(undefined);
    const app = createTokenApiServer({
      auditLogging: { createAuditLog },
      memberAuth: mockedObject<ApiDependencies["memberAuth"]>({
        resolveMemberByTokenHash: vi
          .fn()
          .mockResolvedValue({ member_id: user, organization_id: org, role: "owner" })
      }),
      organizationManagement: mockedObject<NonNullable<ApiDependencies["organizationManagement"]>>({
        updateOrganizationPerson: update
      })
    });
    const headers = { authorization: "Bearer dbundle_mem_private" };
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/v1/organizations/${org}/people/${user}`,
          headers,
          payload: { suspended: true }
        })
      ).statusCode
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/v1/organizations/${org}/people/${user}`,
          headers,
          payload: { role: "owner" }
        })
      ).statusCode
    ).toBe(400);
    expect(createAuditLog).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        action: "organization.person.update",
        status: "success",
        target_id: user,
        actor_user_id: user
      })
    );
    expect(createAuditLog).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ status: "failure", metadata: { status_code: 400 } })
    );
    expect(JSON.stringify(createAuditLog.mock.calls)).not.toContain("dbundle_mem_private");
    createAuditLog.mockRejectedValueOnce(new Error("database unavailable"));
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/v1/organizations/${org}/people/${user}`,
          headers,
          payload: { suspended: false }
        })
      ).statusCode
    ).toBe(200);
  });
  it("keeps scoped organization administration bound to its named organization", async () => {
    const list = vi.fn().mockResolvedValue([]);
    const app = createTokenApiServer({
      memberAuth: mockedObject<ApiDependencies["memberAuth"]>({
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({
          member_id: user,
          organization_id: org,
          role: "admin",
          token_policy: {
            version: 1,
            mode: "organization",
            organization_id: org,
            permissions: ["organization:admin"]
          }
        })
      }),
      organizationManagement: mockedObject<NonNullable<ApiDependencies["organizationManagement"]>>({
        listOrganizationPeople: list
      })
    });
    const allowed = await app.inject({
      method: "GET",
      url: `/v1/organizations/${org}/people`,
      headers: { authorization: "Bearer dbundle_mem_test" }
    });
    expect(allowed.statusCode).toBe(200);
    expect(list).toHaveBeenCalledWith({
      organization_id: org,
      actor_user_id: user,
      include_organization_grants: true
    });
    const denied = await app.inject({
      method: "GET",
      url: `/v1/organizations/${user}/people`,
      headers: { authorization: "Bearer dbundle_mem_test" }
    });
    expect(denied.statusCode).toBe(404);
    expect(list).toHaveBeenCalledTimes(1);
  });
  it("switches only a browser session without exposing its plaintext token", async () => {
    const change = vi.fn().mockResolvedValue(true);
    const app = createTokenApiServer({
      organizationManagement: mockedObject<NonNullable<ApiDependencies["organizationManagement"]>>({
        switchSessionOrganization: change
      }),
      webAuth: {
        resolveSessionByToken: vi.fn().mockResolvedValue({
          session_id: "session",
          user_id: user,
          organization_id: org,
          email: "user@example.test",
          email_verified_at: new Date().toISOString(),
          role: "member"
        })
      }
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/organizations/switch",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=secret`,
        "x-csrf-token": buildCsrfToken("secret")
      },
      payload: { organization_id: org }
    });
    expect(response.statusCode).toBe(200);
    expect(change).toHaveBeenCalledWith({
      user_id: user,
      organization_id: org,
      session_token_hash: expect.stringMatching(/^[a-f0-9]{64}$/)
    });
    expect(response.body).not.toContain("secret");
  });
});
