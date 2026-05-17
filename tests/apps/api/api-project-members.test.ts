import { describe, expect, it, vi } from "vitest";

import { createApiServer } from "../../../apps/api/src/server.ts";
import { SESSION_COOKIE_NAME, buildCsrfToken } from "../../../packages/auth/src/index.js";

const PROJECT_ID = "550e8400-e29b-41d4-a716-446655440000";
const INVITE_ID = "550e8400-e29b-41d4-a716-446655440001";
const USER_ID = "660e8400-e29b-41d4-a716-446655440000";

function createServer(overrides: {
  auditLogging?: { createAuditLog: ReturnType<typeof vi.fn> } | undefined;
  memberAuth?: { resolveMemberByTokenHash: ReturnType<typeof vi.fn> } | undefined;
  webAuth?: { resolveSessionByToken: ReturnType<typeof vi.fn> } | undefined;
  inviteEmails?: { sendProjectInviteEmail: ReturnType<typeof vi.fn> } | undefined;
  authRateLimiter?: Parameters<typeof createApiServer>[0]["authRateLimiter"];
  accountManagement?: {
    getUserAvatar: ReturnType<typeof vi.fn>;
    saveUserAvatar: ReturnType<typeof vi.fn>;
    exportAccountForOrganization?: ReturnType<typeof vi.fn>;
    deleteAccountForOrganization?: ReturnType<typeof vi.fn>;
  } | undefined;
  objectStoreReader?: Parameters<typeof createApiServer>[0]["objectStoreReader"];
  projectManagement?: {
    resolveProjectAccessForUser: ReturnType<typeof vi.fn>;
  } | undefined;
  projectCollaboration?: {
    listMembersForProject: ReturnType<typeof vi.fn>;
    listPendingInvitesForProject: ReturnType<typeof vi.fn>;
    createInviteForProject: ReturnType<typeof vi.fn>;
    cancelInviteForProject: ReturnType<typeof vi.fn>;
    updateProjectMemberRole: ReturnType<typeof vi.fn>;
    removeProjectMember: ReturnType<typeof vi.fn>;
  } | undefined;
} = {}): ReturnType<typeof createApiServer> {
  const hasProjectManagementOverride = Object.prototype.hasOwnProperty.call(overrides, "projectManagement");
  const hasProjectCollaborationOverride = Object.prototype.hasOwnProperty.call(overrides, "projectCollaboration");

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
    projectManagement:
      hasProjectManagementOverride
        ? ({
            resolveProjectAccessForUser: overrides.projectManagement?.resolveProjectAccessForUser,
            listProjectsForOrganization: vi.fn().mockResolvedValue([]),
            createProjectForOrganization: vi.fn().mockResolvedValue(null),
            updateProjectForOrganization: vi.fn().mockResolvedValue(null),
            deleteProjectForOrganization: vi.fn().mockResolvedValue(null)
          } as Parameters<typeof createApiServer>[0]["projectManagement"])
        : ({
            resolveProjectAccessForUser: vi.fn().mockResolvedValue({
              project_id: PROJECT_ID,
              organization_id: "org_123",
              owner_user_id: "usr_123",
              owner_email: "owner@example.com",
              relationship: "owned",
              effective_role: "owner",
              organization_plan: "team"
            }),
            listProjectsForOrganization: vi.fn().mockResolvedValue([]),
            createProjectForOrganization: vi.fn().mockResolvedValue(null),
            updateProjectForOrganization: vi.fn().mockResolvedValue(null),
            deleteProjectForOrganization: vi.fn().mockResolvedValue(null)
          } as Parameters<typeof createApiServer>[0]["projectManagement"]),
    projectCollaboration:
      hasProjectCollaborationOverride
        ? overrides.projectCollaboration
        : ({
            listMembersForProject: vi.fn().mockResolvedValue({
              owner_plan: "team",
              members: []
            }),
            listPendingInvitesForProject: vi.fn().mockResolvedValue([]),
            createInviteForProject: vi.fn().mockResolvedValue({
              kind: "created",
              owner_plan: "team",
              invite: {
                invite_id: INVITE_ID,
                project_id: PROJECT_ID,
                email: "new@example.com",
                role: "member",
                invited_by_user_id: "usr_123",
                accepted_at: null,
                canceled_at: null,
                expires_at: "2026-03-23T00:00:00.000Z",
                created_at: "2026-03-16T00:00:00.000Z"
              }
            }),
            cancelInviteForProject: vi.fn().mockResolvedValue(null),
            updateProjectMemberRole: vi.fn().mockResolvedValue(null),
            removeProjectMember: vi.fn().mockResolvedValue(null)
          } as {
            listMembersForProject: ReturnType<typeof vi.fn>;
            listPendingInvitesForProject: ReturnType<typeof vi.fn>;
            createInviteForProject: ReturnType<typeof vi.fn>;
            cancelInviteForProject: ReturnType<typeof vi.fn>;
            updateProjectMemberRole: ReturnType<typeof vi.fn>;
            removeProjectMember: ReturnType<typeof vi.fn>;
          }),
    incidentRetrieval: {
      listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
      getIncidentForOrganization: vi.fn().mockResolvedValue(null),
      listIncidentLogsForOrganization: vi.fn().mockResolvedValue([]),
      listServicesForOrganization: vi.fn().mockResolvedValue([])
    },
    objectStoreReader: overrides.objectStoreReader ?? {
      getObject: vi.fn()
    },
    ...(overrides.accountManagement === undefined
      ? {}
      : {
          accountManagement: {
            exportAccountForOrganization: overrides.accountManagement.exportAccountForOrganization ?? vi.fn().mockResolvedValue(null),
            deleteAccountForOrganization: overrides.accountManagement.deleteAccountForOrganization ?? vi.fn().mockResolvedValue(null),
            getUserAvatar: overrides.accountManagement.getUserAvatar,
            saveUserAvatar: overrides.accountManagement.saveUserAvatar
          }
        }),
    webhookDelivery: {
      listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] })
    },
    ...(overrides.auditLogging === undefined ? {} : { auditLogging: overrides.auditLogging }),
    inviteEmails: overrides.inviteEmails
  } as Parameters<typeof createApiServer>[0]);
}

describe("api project member routes", () => {
  it("rejects unauthenticated requests and missing collaboration dependencies", async (): Promise<void> => {
    const unauthenticatedApp = createServer({
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue(null)
      }
    });
    const missingDepsApp = createServer({ projectCollaboration: undefined });

    const unauthenticated = await unauthenticatedApp.inject({
      method: "GET",
      url: `/v1/projects/${PROJECT_ID}/members`
    });
    const missingDeps = await missingDepsApp.inject({
      method: "GET",
      url: `/v1/projects/${PROJECT_ID}/members`,
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(unauthenticated.statusCode).toBe(401);
    expect(unauthenticated.json()).toEqual({ error: "invalid_member_token" });
    expect(missingDeps.statusCode).toBe(404);
    expect(missingDeps.json()).toEqual({ error: "member_management_not_available" });
  });

  it("lists project members for callers with admin project access", async (): Promise<void> => {
    const projectManagement = {
      resolveProjectAccessForUser: vi.fn().mockResolvedValue({
        project_id: PROJECT_ID,
        organization_id: "org_123",
        owner_user_id: "usr_123",
        owner_email: "owner@example.com",
        relationship: "shared",
        effective_role: "admin",
        organization_plan: "team"
      })
    };
    const projectCollaboration = {
      listMembersForProject: vi.fn().mockResolvedValue({
        owner_plan: "team",
        members: [
          {
            user_id: "usr_123",
            email: "owner@example.com",
            role: "owner",
            membership_type: "owner",
            avatar_object_key: null,
            created_at: "2026-03-16T00:00:00.000Z"
          },
          {
            user_id: "usr_456",
            email: "alice@example.com",
            role: "member",
            membership_type: "collaborator",
            avatar_object_key: "avatars/users/usr_456/profile",
            created_at: "2026-03-16T01:00:00.000Z"
          }
        ]
      }),
      listPendingInvitesForProject: vi.fn().mockResolvedValue([]),
      createInviteForProject: vi.fn(),
      cancelInviteForProject: vi.fn(),
      updateProjectMemberRole: vi.fn(),
      removeProjectMember: vi.fn()
    };
    const app = createServer({ projectManagement, projectCollaboration });

    const response = await app.inject({
      method: "GET",
      url: `/v1/projects/${PROJECT_ID}/members`,
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      members: [
        {
          user_id: "usr_123",
          email: "owner@example.com",
          role: "owner",
          membership_type: "owner",
          avatar_url: null,
          created_at: "2026-03-16T00:00:00.000Z"
        },
        {
          user_id: "usr_456",
          email: "alice@example.com",
          role: "member",
          membership_type: "collaborator",
          avatar_url: `/v1/projects/${PROJECT_ID}/members/usr_456/avatar`,
          created_at: "2026-03-16T01:00:00.000Z"
        }
      ]
    });
    expect(projectManagement.resolveProjectAccessForUser).toHaveBeenCalledWith({
      user_id: "usr_123",
      project_id: PROJECT_ID
    });
    expect(projectCollaboration.listMembersForProject).toHaveBeenCalledWith({
      project_id: PROJECT_ID,
      user_id: "usr_123"
    });
  });

  it("creates a project invite for owner or admin callers and sends the invite email", async (): Promise<void> => {
    const inviteEmails = {
      sendProjectInviteEmail: vi.fn().mockResolvedValue(undefined)
    };
    const projectCollaboration = {
      listMembersForProject: vi.fn().mockResolvedValue({ owner_plan: "team", members: [] }),
      listPendingInvitesForProject: vi.fn().mockResolvedValue([]),
      createInviteForProject: vi.fn().mockResolvedValue({
        kind: "created",
        owner_plan: "team",
        invite: {
          invite_id: INVITE_ID,
          project_id: PROJECT_ID,
          email: "new@example.com",
          role: "admin",
          invited_by_user_id: "usr_123",
          accepted_at: null,
          canceled_at: null,
          expires_at: "2026-03-23T00:00:00.000Z",
          created_at: "2026-03-16T00:00:00.000Z"
        }
      }),
      cancelInviteForProject: vi.fn().mockResolvedValue(null),
      updateProjectMemberRole: vi.fn().mockResolvedValue(null),
      removeProjectMember: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ projectCollaboration, inviteEmails });

    const response = await app.inject({
      method: "POST",
      url: `/v1/projects/${PROJECT_ID}/invite`,
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        email: "new@example.com",
        role: "admin"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      invite: {
        invite_id: INVITE_ID,
        project_id: PROJECT_ID,
        email: "new@example.com",
        role: "admin",
        invited_by_user_id: "usr_123",
        accepted_at: null,
        canceled_at: null,
        expires_at: "2026-03-23T00:00:00.000Z",
        created_at: "2026-03-16T00:00:00.000Z"
      }
    });
    expect(projectCollaboration.createInviteForProject).toHaveBeenCalledWith({
      project_id: PROJECT_ID,
      user_id: "usr_123",
      email: "new@example.com",
      role: "admin",
      invited_by_user_id: "usr_123",
      invite_token_hash: expect.any(String),
      expires_at: expect.any(String)
    });
    expect(inviteEmails.sendProjectInviteEmail).toHaveBeenCalledWith({
      email: "new@example.com",
      token: expect.stringMatching(/^dbundle_invite_/)
    });
  });

  it("serves cached project member avatars for authorized callers", async (): Promise<void> => {
    const projectCollaboration = {
      listMembersForProject: vi.fn().mockResolvedValue({
        owner_plan: "team",
        members: [
          {
            user_id: USER_ID,
            email: "alice@example.com",
            role: "member",
            membership_type: "collaborator",
            avatar_object_key: `avatars/users/${USER_ID}/profile`,
            created_at: "2026-03-16T01:00:00.000Z"
          }
        ]
      }),
      listPendingInvitesForProject: vi.fn().mockResolvedValue([]),
      createInviteForProject: vi.fn(),
      cancelInviteForProject: vi.fn(),
      updateProjectMemberRole: vi.fn(),
      removeProjectMember: vi.fn()
    };
    const accountManagement = {
      getUserAvatar: vi.fn().mockResolvedValue({
        user_id: USER_ID,
        source: "gravatar",
        object_key: `avatars/users/${USER_ID}/profile`,
        content_type: "image/webp",
        updated_at: "2026-04-06T00:00:00.000Z"
      }),
      saveUserAvatar: vi.fn()
    };
    const objectStoreReader = {
      getObject: vi.fn().mockResolvedValue(Buffer.from("avatar-body"))
    };
    const app = createServer({ projectCollaboration, accountManagement, objectStoreReader });

    const response = await app.inject({
      method: "GET",
      url: `/v1/projects/${PROJECT_ID}/members/${USER_ID}/avatar`,
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("image/webp");
    expect(response.body).toBe("avatar-body");
    expect(accountManagement.getUserAvatar).toHaveBeenCalledWith({ user_id: USER_ID });
  });

  it("requires verified browser sessions for invite create and cancel actions", async (): Promise<void> => {
    const csrfToken = buildCsrfToken("session-secret");
    const projectManagement = {
      resolveProjectAccessForUser: vi.fn().mockResolvedValue({
        project_id: PROJECT_ID,
        organization_id: "org_123",
        owner_user_id: "usr_123",
        owner_email: "owner@example.com",
        relationship: "owned",
        effective_role: "owner",
        organization_plan: "team"
      })
    };
    const projectCollaboration = {
      listMembersForProject: vi.fn().mockResolvedValue({ owner_plan: "team", members: [] }),
      listPendingInvitesForProject: vi.fn().mockResolvedValue([]),
      createInviteForProject: vi.fn(),
      cancelInviteForProject: vi.fn(),
      updateProjectMemberRole: vi.fn(),
      removeProjectMember: vi.fn()
    };
    const app = createServer({
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue(null)
      },
      webAuth: {
        resolveSessionByToken: vi.fn().mockResolvedValue({
          session_id: "ses_123",
          user_id: "usr_123",
          email: "owner@example.com",
          email_verified_at: null,
          organization_id: "org_123",
          role: "owner",
          created_at: "2026-03-16T00:00:00.000Z",
          expires_at: "2026-03-16T12:00:00.000Z",
          revoked_at: null
        })
      },
      projectManagement,
      projectCollaboration
    });

    const createResponse = await app.inject({
      method: "POST",
      url: `/v1/projects/${PROJECT_ID}/invite`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=session-secret`,
        "x-csrf-token": csrfToken
      },
      payload: {
        email: "new@example.com",
        role: "member"
      }
    });
    const cancelResponse = await app.inject({
      method: "DELETE",
      url: `/v1/projects/${PROJECT_ID}/invites/${INVITE_ID}`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=session-secret`,
        "x-csrf-token": csrfToken
      }
    });

    expect(createResponse.statusCode).toBe(403);
    expect(createResponse.json()).toEqual({ error: "email_verification_required" });
    expect(cancelResponse.statusCode).toBe(403);
    expect(cancelResponse.json()).toEqual({ error: "email_verification_required" });
    expect(projectCollaboration.createInviteForProject).not.toHaveBeenCalled();
    expect(projectCollaboration.cancelInviteForProject).not.toHaveBeenCalled();
  });

  it("lists and cancels pending project invites", async (): Promise<void> => {
    const projectCollaboration = {
      listMembersForProject: vi.fn().mockResolvedValue({ owner_plan: "team", members: [] }),
      listPendingInvitesForProject: vi.fn().mockResolvedValue([
        {
          invite_id: INVITE_ID,
          project_id: PROJECT_ID,
          email: "invitee@example.com",
          role: "member",
          invited_by_user_id: "usr_123",
          accepted_at: null,
          canceled_at: null,
          expires_at: "2026-03-23T00:00:00.000Z",
          created_at: "2026-03-16T00:00:00.000Z"
        }
      ]),
      createInviteForProject: vi.fn().mockResolvedValue(null),
      cancelInviteForProject: vi.fn().mockResolvedValue({
        invite_id: INVITE_ID,
        project_id: PROJECT_ID,
        email: "invitee@example.com",
        role: "member",
        invited_by_user_id: "usr_123",
        accepted_at: null,
        canceled_at: "2026-03-17T00:00:00.000Z",
        expires_at: "2026-03-23T00:00:00.000Z",
        created_at: "2026-03-16T00:00:00.000Z"
      }),
      updateProjectMemberRole: vi.fn().mockResolvedValue(null),
      removeProjectMember: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ projectCollaboration });

    const listResponse = await app.inject({
      method: "GET",
      url: `/v1/projects/${PROJECT_ID}/invites`,
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });
    const cancelResponse = await app.inject({
      method: "DELETE",
      url: `/v1/projects/${PROJECT_ID}/invites/${INVITE_ID}`,
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual({
      invites: [
        {
          invite_id: INVITE_ID,
          project_id: PROJECT_ID,
          email: "invitee@example.com",
          role: "member",
          invited_by_user_id: "usr_123",
          accepted_at: null,
          canceled_at: null,
          expires_at: "2026-03-23T00:00:00.000Z",
          created_at: "2026-03-16T00:00:00.000Z"
        }
      ]
    });
    expect(cancelResponse.statusCode).toBe(200);
    expect(cancelResponse.json()).toEqual({
      invite: {
        invite_id: INVITE_ID,
        project_id: PROJECT_ID,
        email: "invitee@example.com",
        role: "member",
        invited_by_user_id: "usr_123",
        accepted_at: null,
        canceled_at: "2026-03-17T00:00:00.000Z",
        expires_at: "2026-03-23T00:00:00.000Z",
        created_at: "2026-03-16T00:00:00.000Z"
      }
    });
  });

  it("updates project member roles and preserves owner-role protections", async (): Promise<void> => {
    const projectManagement = {
      resolveProjectAccessForUser: vi.fn().mockResolvedValue({
        project_id: PROJECT_ID,
        organization_id: "org_123",
        owner_user_id: "usr_123",
        owner_email: "owner@example.com",
        relationship: "owned",
        effective_role: "admin",
        organization_plan: "team"
      })
    };
    const projectCollaboration = {
      listMembersForProject: vi.fn().mockResolvedValue({ owner_plan: "team", members: [] }),
      listPendingInvitesForProject: vi.fn().mockResolvedValue([]),
      createInviteForProject: vi.fn().mockResolvedValue(null),
      cancelInviteForProject: vi.fn().mockResolvedValue(null),
      updateProjectMemberRole: vi
        .fn()
        .mockResolvedValueOnce({
          kind: "updated",
          member: {
            user_id: USER_ID,
            email: "alice@example.com",
            role: "admin",
            membership_type: "collaborator",
            created_at: "2026-03-16T01:00:00.000Z"
          }
        })
        .mockResolvedValueOnce({
          kind: "owner_role_change_forbidden"
        }),
      removeProjectMember: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ projectManagement, projectCollaboration });

    const success = await app.inject({
      method: "PATCH",
      url: `/v1/projects/${PROJECT_ID}/members/${USER_ID}`,
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        role: "admin"
      }
    });
    const conflict = await app.inject({
      method: "PATCH",
      url: `/v1/projects/${PROJECT_ID}/members/${USER_ID}`,
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        role: "member"
      }
    });

    expect(success.statusCode).toBe(200);
    expect(success.json()).toEqual({
      member: {
        user_id: USER_ID,
        email: "alice@example.com",
        role: "admin",
        membership_type: "collaborator",
        avatar_url: null,
        created_at: "2026-03-16T01:00:00.000Z"
      }
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toEqual({ error: "owner_role_change_not_allowed" });
  });

  it("removes project members and preserves owner-removal protections", async (): Promise<void> => {
    const projectCollaboration = {
      listMembersForProject: vi.fn().mockResolvedValue({ owner_plan: "team", members: [] }),
      listPendingInvitesForProject: vi.fn().mockResolvedValue([]),
      createInviteForProject: vi.fn().mockResolvedValue(null),
      cancelInviteForProject: vi.fn().mockResolvedValue(null),
      updateProjectMemberRole: vi.fn().mockResolvedValue(null),
      removeProjectMember: vi
        .fn()
        .mockResolvedValueOnce({
          kind: "removed",
          member: {
            user_id: USER_ID,
            email: "alice@example.com",
            role: "member",
            membership_type: "collaborator",
            created_at: "2026-03-16T01:00:00.000Z"
          }
        })
        .mockResolvedValueOnce({
          kind: "owner_removal_forbidden"
        })
    };
    const app = createServer({ projectCollaboration });

    const success = await app.inject({
      method: "DELETE",
      url: `/v1/projects/${PROJECT_ID}/members/${USER_ID}`,
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });
    const conflict = await app.inject({
      method: "DELETE",
      url: `/v1/projects/${PROJECT_ID}/members/${USER_ID}`,
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(success.statusCode).toBe(200);
    expect(success.json()).toEqual({
      member: {
        user_id: USER_ID,
        email: "alice@example.com",
        role: "member",
        membership_type: "collaborator",
        avatar_url: null,
        created_at: "2026-03-16T01:00:00.000Z"
      }
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toEqual({ error: "owner_removal_not_allowed" });
  });
});
