import { describe, expect, it, vi } from "vitest";

import { createApiServer } from "../../../apps/api/src/server.ts";
import { SESSION_COOKIE_NAME, buildCsrfToken } from "../../../packages/auth/src/index.js";

function createServer(overrides: {
  auditLogging?: { createAuditLog: ReturnType<typeof vi.fn> } | undefined;
  memberAuth?: { resolveMemberByTokenHash: ReturnType<typeof vi.fn> } | undefined;
  webAuth?: { resolveSessionByToken: ReturnType<typeof vi.fn> } | undefined;
  inviteEmails?: { sendOrganizationInviteEmail: ReturnType<typeof vi.fn> } | undefined;
  authRateLimiter?: Parameters<typeof createApiServer>[0]["authRateLimiter"];
  organizationManagement?: {
    listMembersForOrganization: ReturnType<typeof vi.fn>;
    createInviteForOrganization: ReturnType<typeof vi.fn>;
    listPendingInvitesForOrganization: ReturnType<typeof vi.fn>;
    cancelInviteForOrganization: ReturnType<typeof vi.fn>;
    removeMemberFromOrganization: ReturnType<typeof vi.fn>;
    updateMemberRoleForOrganization?: ReturnType<typeof vi.fn> | undefined;
  } | undefined;
} = {}): ReturnType<typeof createApiServer> {
  const hasOrganizationManagementOverride = Object.prototype.hasOwnProperty.call(overrides, "organizationManagement");

  return createApiServer({
    ingestionPersistence: {
      persistAndEnqueue: vi.fn()
    },
    ...(overrides.authRateLimiter === undefined
      ? {}
      : { authRateLimiter: overrides.authRateLimiter }),
    ingestionMetadata: {
      resolveProjectByTokenHash: vi.fn()
    },
    memberAuth:
      overrides.memberAuth ??
      ({
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({
          member_id: "usr_123",
          organization_id: "org_123",
          role: "owner"
        })
      } as { resolveMemberByTokenHash: ReturnType<typeof vi.fn> }),
    webAuth:
      overrides.webAuth === undefined
        ? undefined
        : ({
            requestEmailCode: vi.fn(),
            verifyEmailCode: vi.fn(),
            beginGithubAuth: vi.fn(),
            completeGithubAuth: vi.fn(),
            acceptInviteForSession: vi.fn(),
            revokeSessionByToken: vi.fn(),
            ...overrides.webAuth
          } as {
            requestEmailCode: ReturnType<typeof vi.fn>;
            verifyEmailCode: ReturnType<typeof vi.fn>;
            beginGithubAuth: ReturnType<typeof vi.fn>;
            completeGithubAuth: ReturnType<typeof vi.fn>;
            acceptInviteForSession: ReturnType<typeof vi.fn>;
            revokeSessionByToken: ReturnType<typeof vi.fn>;
            resolveSessionByToken: ReturnType<typeof vi.fn>;
          }),
    tokenManagement: {
      listProjectTokensForOrganization: vi.fn().mockResolvedValue([]),
      createProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      listMemberTokensForOrganization: vi.fn().mockResolvedValue([]),
      createMemberTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeMemberTokenForOrganization: vi.fn().mockResolvedValue(null)
    },
    projectManagement: {
      listProjectsForOrganization: vi.fn().mockResolvedValue([]),
      createProjectForOrganization: vi.fn().mockResolvedValue(null),
      updateProjectForOrganization: vi.fn().mockResolvedValue(null),
      deleteProjectForOrganization: vi.fn().mockResolvedValue(null)
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
      listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] })
    },
    ...(overrides.auditLogging === undefined ? {} : { auditLogging: overrides.auditLogging }),
    inviteEmails: overrides.inviteEmails,
    organizationManagement:
      hasOrganizationManagementOverride
        ? overrides.organizationManagement
        : ({
            listMembersForOrganization: vi.fn().mockResolvedValue({ plan: "free", members: [] }),
            createInviteForOrganization: vi.fn().mockResolvedValue({ kind: "upgrade_required", plan: "free" }),
            listPendingInvitesForOrganization: vi.fn().mockResolvedValue([]),
            cancelInviteForOrganization: vi.fn().mockResolvedValue(null),
            removeMemberFromOrganization: vi.fn().mockResolvedValue(null),
            updateMemberRoleForOrganization: vi.fn().mockResolvedValue(null)
          } as {
            listMembersForOrganization: ReturnType<typeof vi.fn>;
            createInviteForOrganization: ReturnType<typeof vi.fn>;
            listPendingInvitesForOrganization: ReturnType<typeof vi.fn>;
            cancelInviteForOrganization: ReturnType<typeof vi.fn>;
            removeMemberFromOrganization: ReturnType<typeof vi.fn>;
            updateMemberRoleForOrganization?: ReturnType<typeof vi.fn> | undefined;
          })
  } as Parameters<typeof createApiServer>[0]);
}

describe("api organization member routes", () => {
  it("should reject unauthenticated requests and missing member-management dependencies", async (): Promise<void> => {
    const unauthenticatedApp = createServer({
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue(null)
      }
    });
    const missingDepsApp = createServer({ organizationManagement: undefined });

    const unauthenticated = await unauthenticatedApp.inject({
      method: "GET",
      url: "/v1/organization/members"
    });
    const missingDeps = await missingDepsApp.inject({
      method: "GET",
      url: "/v1/organization/members",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(unauthenticated.statusCode).toBe(401);
    expect(unauthenticated.json()).toEqual({ error: "invalid_member_token" });
    expect(missingDeps.statusCode).toBe(404);
    expect(missingDeps.json()).toEqual({ error: "member_management_not_available" });
  });

  it("should list organization members for owner callers", async (): Promise<void> => {
    const organizationManagement = {
      listMembersForOrganization: vi.fn().mockResolvedValue({
        plan: "team",
        members: [
          {
            user_id: "usr_123",
            email: "owen@example.com",
            role: "owner",
            created_at: "2026-03-16T00:00:00.000Z"
          }
        ]
      }),
      createInviteForOrganization: vi.fn().mockResolvedValue({ kind: "upgrade_required", plan: "free" }),
      listPendingInvitesForOrganization: vi.fn().mockResolvedValue([]),
      cancelInviteForOrganization: vi.fn().mockResolvedValue(null),
      removeMemberFromOrganization: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ organizationManagement });

    const response = await app.inject({
      method: "GET",
      url: "/v1/organization/members",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      members: [
        {
          user_id: "usr_123",
          email: "owen@example.com",
          role: "owner",
          created_at: "2026-03-16T00:00:00.000Z"
        }
      ]
    });
    expect(organizationManagement.listMembersForOrganization).toHaveBeenCalledWith({ organization_id: "org_123" });
  });

  it("should reject organization member listing for member-role callers", async (): Promise<void> => {
    const organizationManagement = {
      listMembersForOrganization: vi.fn().mockResolvedValue({ plan: "team", members: [] }),
      createInviteForOrganization: vi.fn().mockResolvedValue({ kind: "upgrade_required", plan: "free" }),
      listPendingInvitesForOrganization: vi.fn().mockResolvedValue([]),
      cancelInviteForOrganization: vi.fn().mockResolvedValue(null),
      removeMemberFromOrganization: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({
          member_id: "usr_456",
          organization_id: "org_123",
          role: "member"
        })
      },
      organizationManagement
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/organization/members",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "forbidden" });
    expect(organizationManagement.listMembersForOrganization).not.toHaveBeenCalled();
  });

  it("should create an organization invite for verified owner callers on eligible tiers", async (): Promise<void> => {
    const inviteEmails = {
      sendOrganizationInviteEmail: vi.fn().mockResolvedValue(undefined)
    };
    const organizationManagement = {
      listMembersForOrganization: vi.fn().mockResolvedValue({ plan: "team", members: [] }),
      listPendingInvitesForOrganization: vi.fn().mockResolvedValue([]),
      cancelInviteForOrganization: vi.fn().mockResolvedValue(null),
      removeMemberFromOrganization: vi.fn().mockResolvedValue(null),
      createInviteForOrganization: vi.fn().mockResolvedValue({
        kind: "created",
        plan: "team",
        invite: {
          invite_id: "inv_123",
          organization_id: "org_123",
          email: "new@example.com",
          role: "member",
          invited_by: "usr_123",
          accepted_at: null,
          expires_at: "2026-03-23T00:00:00.000Z",
          created_at: "2026-03-16T00:00:00.000Z"
        }
      })
    };
    const app = createServer({ organizationManagement, inviteEmails });

    const response = await app.inject({
      method: "POST",
      url: "/v1/organization/members/invite",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        email: "new@example.com"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      invite: {
        invite_id: "inv_123",
        organization_id: "org_123",
        email: "new@example.com",
        role: "member",
        invited_by: "usr_123",
        accepted_at: null,
        expires_at: "2026-03-23T00:00:00.000Z",
        created_at: "2026-03-16T00:00:00.000Z"
      }
    });
    expect(organizationManagement.createInviteForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      email: "new@example.com",
      role: "member",
      invited_by_user_id: "usr_123",
      invite_token_hash: expect.any(String),
      expires_at: expect.any(String)
    });
    expect(inviteEmails.sendOrganizationInviteEmail).toHaveBeenCalledWith({
      email: "new@example.com",
      token: expect.stringMatching(/^dbundle_invite_/)
    });
  });

  it("should require verified browser sessions for owner invite actions", async (): Promise<void> => {
    const organizationManagement = {
      listMembersForOrganization: vi.fn().mockResolvedValue({ plan: "team", members: [] }),
      listPendingInvitesForOrganization: vi.fn().mockResolvedValue([]),
      cancelInviteForOrganization: vi.fn().mockResolvedValue(null),
      removeMemberFromOrganization: vi.fn().mockResolvedValue(null),
      createInviteForOrganization: vi.fn().mockResolvedValue({
        kind: "created",
        plan: "team",
        invite: {
          invite_id: "inv_123",
          organization_id: "org_123",
          email: "new@example.com",
          role: "member",
          invited_by: "usr_123",
          accepted_at: null,
          expires_at: "2026-03-23T00:00:00.000Z",
          created_at: "2026-03-16T00:00:00.000Z"
        }
      })
    };
    const app = createServer({
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue(null)
      },
      webAuth: {
        resolveSessionByToken: vi.fn().mockResolvedValue({
          session_id: "ses_123",
          user_id: "usr_123",
          email: "owen@example.com",
          email_verified_at: null,
          organization_id: "org_123",
          role: "owner",
          created_at: "2026-03-16T00:00:00.000Z",
          expires_at: "2026-03-16T12:00:00.000Z",
          revoked_at: null
        })
      },
      organizationManagement
    });

    const csrfToken = buildCsrfToken("session-secret");
    const response = await app.inject({
      method: "POST",
      url: "/v1/organization/members/invite",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=session-secret`,
        "x-csrf-token": csrfToken
      },
      payload: {
        email: "new@example.com"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "email_verification_required" });
    expect(organizationManagement.createInviteForOrganization).not.toHaveBeenCalled();
  });

  it("should validate invite payloads and map invite conflicts", async (): Promise<void> => {
    const organizationManagement = {
      listMembersForOrganization: vi.fn().mockResolvedValue({ plan: "team", members: [] }),
      listPendingInvitesForOrganization: vi.fn().mockResolvedValue([]),
      cancelInviteForOrganization: vi.fn().mockResolvedValue(null),
      removeMemberFromOrganization: vi.fn().mockResolvedValue(null),
      createInviteForOrganization: vi
        .fn()
        .mockResolvedValueOnce({ kind: "member_exists", plan: "team" })
        .mockResolvedValueOnce({ kind: "invite_exists", plan: "team" })
    };
    const app = createServer({ organizationManagement });

    const invalidPayload = await app.inject({
      method: "POST",
      url: "/v1/organization/members/invite",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        email: "not-an-email",
        role: "owner"
      }
    });
    const memberExists = await app.inject({
      method: "POST",
      url: "/v1/organization/members/invite",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        email: "existing@example.com"
      }
    });
    const inviteExists = await app.inject({
      method: "POST",
      url: "/v1/organization/members/invite",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        email: "pending@example.com"
      }
    });

    expect(invalidPayload.statusCode).toBe(400);
    expect(invalidPayload.json()).toEqual({ error: "invalid_payload" });
    expect(memberExists.statusCode).toBe(409);
    expect(memberExists.json()).toEqual({ error: "member_already_exists" });
    expect(inviteExists.statusCode).toBe(409);
    expect(inviteExists.json()).toEqual({ error: "invite_already_exists" });
  });

  it("should require an eligible plan for organization invites", async (): Promise<void> => {
    const organizationManagement = {
      listMembersForOrganization: vi.fn().mockResolvedValue({ plan: "free", members: [] }),
      createInviteForOrganization: vi.fn().mockResolvedValue({ kind: "upgrade_required", plan: "free" }),
      listPendingInvitesForOrganization: vi.fn().mockResolvedValue([]),
      cancelInviteForOrganization: vi.fn().mockResolvedValue(null),
      removeMemberFromOrganization: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ organizationManagement });

    const response = await app.inject({
      method: "POST",
      url: "/v1/organization/members/invite",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        email: "new@example.com"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "upgrade_required" });
  });

  it("should list pending organization invites for owner callers", async (): Promise<void> => {
    const organizationManagement = {
      listMembersForOrganization: vi.fn().mockResolvedValue({ plan: "team", members: [] }),
      createInviteForOrganization: vi.fn().mockResolvedValue({ kind: "upgrade_required", plan: "free" }),
      listPendingInvitesForOrganization: vi.fn().mockResolvedValue([
        {
          invite_id: "inv_123",
          organization_id: "org_123",
          email: "pending@example.com",
          role: "member",
          invited_by: "usr_123",
          accepted_at: null,
          expires_at: "2026-03-23T00:00:00.000Z",
          created_at: "2026-03-16T00:00:00.000Z"
        }
      ]),
      cancelInviteForOrganization: vi.fn().mockResolvedValue(null),
      removeMemberFromOrganization: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ organizationManagement });

    const response = await app.inject({
      method: "GET",
      url: "/v1/organization/members/invites",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      invites: [
        {
          invite_id: "inv_123",
          organization_id: "org_123",
          email: "pending@example.com",
          role: "member",
          invited_by: "usr_123",
          accepted_at: null,
          expires_at: "2026-03-23T00:00:00.000Z",
          created_at: "2026-03-16T00:00:00.000Z"
        }
      ]
    });
    expect(organizationManagement.listPendingInvitesForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      now: expect.any(String)
    });
  });

  it("should cancel pending invites for owner callers and keep browser-session verification gating for invite lifecycle", async (): Promise<void> => {
    const organizationManagement = {
      listMembersForOrganization: vi.fn().mockResolvedValue({ plan: "team", members: [] }),
      createInviteForOrganization: vi.fn().mockResolvedValue({ kind: "upgrade_required", plan: "free" }),
      listPendingInvitesForOrganization: vi.fn().mockResolvedValue([]),
      cancelInviteForOrganization: vi
        .fn()
        .mockResolvedValueOnce({
          invite_id: "550e8400-e29b-41d4-a716-446655440000",
          organization_id: "org_123",
          email: "pending@example.com",
          role: "member",
          invited_by: "usr_123",
          accepted_at: null,
          expires_at: "2026-03-23T00:00:00.000Z",
          created_at: "2026-03-16T00:00:00.000Z"
        })
        .mockResolvedValueOnce(null),
      removeMemberFromOrganization: vi.fn().mockResolvedValue(null)
    };
    const tokenApp = createServer({ organizationManagement });
    const unverifiedBrowserApp = createServer({
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue(null)
      },
      webAuth: {
        resolveSessionByToken: vi.fn().mockResolvedValue({
          session_id: "ses_123",
          user_id: "usr_123",
          email: "owen@example.com",
          email_verified_at: null,
          organization_id: "org_123",
          role: "owner",
          created_at: "2026-03-16T00:00:00.000Z",
          expires_at: "2026-03-16T12:00:00.000Z",
          revoked_at: null
        })
      },
      organizationManagement
    });

    const canceled = await tokenApp.inject({
      method: "DELETE",
      url: "/v1/organization/members/invites/550e8400-e29b-41d4-a716-446655440000",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });
    const csrfToken = buildCsrfToken("session-secret");
    const blocked = await unverifiedBrowserApp.inject({
      method: "DELETE",
      url: "/v1/organization/members/invites/inv_456",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=session-secret`,
        "x-csrf-token": csrfToken
      }
    });

    expect(canceled.statusCode).toBe(200);
    expect(canceled.json()).toEqual({
      invite: {
        invite_id: "550e8400-e29b-41d4-a716-446655440000",
        organization_id: "org_123",
        email: "pending@example.com",
        role: "member",
        invited_by: "usr_123",
        accepted_at: null,
        expires_at: "2026-03-23T00:00:00.000Z",
        created_at: "2026-03-16T00:00:00.000Z"
      }
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json()).toEqual({ error: "email_verification_required" });
    expect(organizationManagement.cancelInviteForOrganization).toHaveBeenCalledTimes(1);
    expect(organizationManagement.cancelInviteForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      invite_id: "550e8400-e29b-41d4-a716-446655440000"
    });
  });

  it("should validate lifecycle route params and map invite and member removal outcomes", async (): Promise<void> => {
    const organizationManagement = {
      listMembersForOrganization: vi.fn().mockResolvedValue({ plan: "team", members: [] }),
      createInviteForOrganization: vi.fn().mockResolvedValue({ kind: "upgrade_required", plan: "free" }),
      listPendingInvitesForOrganization: vi.fn().mockResolvedValue([]),
      cancelInviteForOrganization: vi.fn().mockResolvedValue(null),
      removeMemberFromOrganization: vi
        .fn()
        .mockResolvedValueOnce({
          kind: "removed",
          member: {
            user_id: "550e8400-e29b-41d4-a716-446655440000",
            email: "member@example.com",
            role: "member",
            created_at: "2026-03-16T00:00:00.000Z"
          }
        })
        .mockResolvedValueOnce({
          kind: "owner_removal_forbidden",
          member: {
            user_id: "660e8400-e29b-41d4-a716-446655440000",
            email: "owner@example.com",
            role: "owner",
            created_at: "2026-03-16T00:00:00.000Z"
          }
        })
        .mockResolvedValueOnce(null)
    };
    const app = createServer({ organizationManagement });

    const invalidInviteId = await app.inject({
      method: "DELETE",
      url: "/v1/organization/members/invites/not-a-uuid",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });
    const inviteNotFound = await app.inject({
      method: "DELETE",
      url: "/v1/organization/members/invites/550e8400-e29b-41d4-a716-446655440001",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });
    const removed = await app.inject({
      method: "DELETE",
      url: "/v1/organization/members/550e8400-e29b-41d4-a716-446655440000",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });
    const ownerRemoval = await app.inject({
      method: "DELETE",
      url: "/v1/organization/members/660e8400-e29b-41d4-a716-446655440000",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });
    const missingMember = await app.inject({
      method: "DELETE",
      url: "/v1/organization/members/770e8400-e29b-41d4-a716-446655440000",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(invalidInviteId.statusCode).toBe(400);
    expect(invalidInviteId.json()).toEqual({ error: "invalid_invite_id" });
    expect(inviteNotFound.statusCode).toBe(404);
    expect(inviteNotFound.json()).toEqual({ error: "invite_not_found" });
    expect(removed.statusCode).toBe(200);
    expect(removed.json()).toEqual({
      member: {
        user_id: "550e8400-e29b-41d4-a716-446655440000",
        email: "member@example.com",
        role: "member",
        created_at: "2026-03-16T00:00:00.000Z"
      }
    });
    expect(ownerRemoval.statusCode).toBe(409);
    expect(ownerRemoval.json()).toEqual({ error: "owner_removal_not_allowed" });
    expect(missingMember.statusCode).toBe(404);
    expect(missingMember.json()).toEqual({ error: "member_not_found" });
  });

  it("should update organization member roles for owner callers", async (): Promise<void> => {
    const createAuditLog = vi.fn().mockResolvedValue(undefined);
    const organizationManagement = {
      listMembersForOrganization: vi.fn().mockResolvedValue({ plan: "team", members: [] }),
      createInviteForOrganization: vi.fn().mockResolvedValue({ kind: "upgrade_required", plan: "free" }),
      listPendingInvitesForOrganization: vi.fn().mockResolvedValue([]),
      cancelInviteForOrganization: vi.fn().mockResolvedValue(null),
      removeMemberFromOrganization: vi.fn().mockResolvedValue(null),
      updateMemberRoleForOrganization: vi.fn().mockResolvedValue({
        kind: "updated",
        member: {
          user_id: "550e8400-e29b-41d4-a716-446655440000",
          email: "member@example.com",
          role: "owner",
          created_at: "2026-03-16T00:00:00.000Z"
        }
      })
    };
    const app = createServer({ organizationManagement, auditLogging: { createAuditLog } });

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/organization/members/550e8400-e29b-41d4-a716-446655440000",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        role: "owner"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      member: {
        user_id: "550e8400-e29b-41d4-a716-446655440000",
        email: "member@example.com",
        role: "owner",
        created_at: "2026-03-16T00:00:00.000Z"
      }
    });
    expect(organizationManagement.updateMemberRoleForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      user_id: "550e8400-e29b-41d4-a716-446655440000",
      role: "owner"
    });
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "org_123",
        actor_user_id: "usr_123",
        actor_type: "member_token",
        action: "organization.member.role.update",
        target_type: "organization_member",
        target_id: "550e8400-e29b-41d4-a716-446655440000",
        status: "success",
        occurred_at: expect.any(String),
        metadata: {
          role: "owner"
        }
      })
    );
  });

  it("should validate role-update payloads and map role-update outcomes", async (): Promise<void> => {
    const organizationManagement = {
      listMembersForOrganization: vi.fn().mockResolvedValue({ plan: "team", members: [] }),
      createInviteForOrganization: vi.fn().mockResolvedValue({ kind: "upgrade_required", plan: "free" }),
      listPendingInvitesForOrganization: vi.fn().mockResolvedValue([]),
      cancelInviteForOrganization: vi.fn().mockResolvedValue(null),
      removeMemberFromOrganization: vi.fn().mockResolvedValue(null),
      updateMemberRoleForOrganization: vi
        .fn()
        .mockResolvedValueOnce({
          kind: "owner_role_change_forbidden",
          member: {
            user_id: "660e8400-e29b-41d4-a716-446655440000",
            email: "owner@example.com",
            role: "owner",
            created_at: "2026-03-16T00:00:00.000Z"
          }
        })
        .mockResolvedValueOnce(null)
    };
    const app = createServer({ organizationManagement });

    const invalidPayload = await app.inject({
      method: "PATCH",
      url: "/v1/organization/members/550e8400-e29b-41d4-a716-446655440000",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        role: "admin"
      }
    });
    const invalidMemberId = await app.inject({
      method: "PATCH",
      url: "/v1/organization/members/not-a-uuid",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        role: "member"
      }
    });
    const ownerRoleChange = await app.inject({
      method: "PATCH",
      url: "/v1/organization/members/660e8400-e29b-41d4-a716-446655440000",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        role: "member"
      }
    });
    const missingMember = await app.inject({
      method: "PATCH",
      url: "/v1/organization/members/770e8400-e29b-41d4-a716-446655440000",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        role: "member"
      }
    });

    expect(invalidPayload.statusCode).toBe(400);
    expect(invalidPayload.json()).toEqual({ error: "invalid_payload" });
    expect(invalidMemberId.statusCode).toBe(400);
    expect(invalidMemberId.json()).toEqual({ error: "invalid_member_id" });
    expect(ownerRoleChange.statusCode).toBe(409);
    expect(ownerRoleChange.json()).toEqual({ error: "owner_role_change_not_allowed" });
    expect(missingMember.statusCode).toBe(404);
    expect(missingMember.json()).toEqual({ error: "member_not_found" });
  });

  it("should rate limit organization member reads per owner", async (): Promise<void> => {
    const claimRequest = vi.fn().mockResolvedValue({
      allowed: false,
      limit: 100,
      remaining: 0,
      retry_after_ms: 12_000
    });
    const app = createServer({ authRateLimiter: { claimRequest } });

    const response = await app.inject({
      method: "GET",
      url: "/v1/organization/members",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(429);
    expect(response.json()).toEqual({ error: "rate_limited" });
    expect(response.headers["retry-after"]).toBe("12");
    expect(claimRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: "management-read",
        subject: "member:usr_123",
        limit: 200
      })
    );
  });
});