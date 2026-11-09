import { describe, expect, it, vi } from "vitest";
import { createTokenApiServer, defaultProjectAccess } from "../../helpers/api-tokens.js";
import { mockedObject } from "../../helpers/vitest.js";
import type { ApiDependencies } from "../../../apps/api/src/api-types.js";
import { buildCsrfToken, SESSION_COOKIE_NAME } from "../../../packages/auth/src/index.js";

const scoped = {
  member_id: "usr_123",
  organization_id: "org_123",
  role: "owner" as const,
  token_policy: {
    version: 1 as const,
    mode: "projects" as const,
    permissions: ["project:admin" as const],
    projects: [
      {
        project_id: defaultProjectAccess.project_id,
        origin_project_ids: [defaultProjectAccess.project_id]
      }
    ]
  }
};
const memberAuth = () =>
  mockedObject<ApiDependencies["memberAuth"]>({
    resolveMemberByTokenHash: vi.fn().mockResolvedValue(scoped)
  });

describe("restricted member credential boundaries", () => {
  it.each([
    { method: "POST" as const, url: "/v1/events", payload: { events: [] } },
    { method: "GET" as const, url: "/v1/sdk/config" }
  ])("leaves the project-only $url endpoint outside member authentication", async (input) => {
    const auth = memberAuth();
    const app = createTokenApiServer({ memberAuth: auth });
    const response = await app.inject({
      ...input,
      headers: { authorization: "Bearer dbundle_mem_scoped" }
    });
    expect(response.statusCode).toBe(401);
    expect(auth.resolveMemberByTokenHash).not.toHaveBeenCalled();
  });
  it.each(["context", "bundle", "reproduction", "capture-rule-suggestion", "capture-rules"])(
    "refuses a mixed-scope %s artifact before object access",
    async (operation) => {
      const read = vi.fn();
      const app = createTokenApiServer({
        memberAuth: memberAuth(),
        projectManagement: mockedObject<NonNullable<ApiDependencies["projectManagement"]>>({
          resolveProjectAccessForUser: vi.fn().mockResolvedValue({
            ...defaultProjectAccess,
            origin_project_ids: [
              defaultProjectAccess.project_id,
              "55555555-5555-4555-8555-555555555555"
            ]
          })
        }),
        incidentRetrieval: {
          getIncidentForOrganization: vi.fn().mockResolvedValue({
            incident_id: defaultProjectAccess.project_id,
            project_id: defaultProjectAccess.project_id
          })
        },
        objectStoreReader: { getObject: read }
      });
      const response = await app.inject({
        method: operation.startsWith("capture-rule") ? "POST" : "GET",
        url: `/v1/incidents/${defaultProjectAccess.project_id}/${operation}`,
        headers: { authorization: "Bearer dbundle_mem_scoped" },
        ...(operation === "capture-rules" ? { payload: { suggestion_id: "resource_context" } } : {})
      });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "incident_not_found" });
      expect(read).not.toHaveBeenCalled();
    }
  );
  it("allows scoped project administration to revoke an in-scope ingestion credential", async () => {
    const revoke = vi.fn().mockResolvedValue(null);
    const app = createTokenApiServer({
      memberAuth: memberAuth(),
      tokenManagement: mockedObject<ApiDependencies["tokenManagement"]>({
        revokeProjectTokenForOrganization: revoke
      })
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/projects/${defaultProjectAccess.project_id}/tokens/33333333-3333-4333-8333-333333333333/revoke`,
      headers: { authorization: "Bearer dbundle_mem_test" }
    });
    expect(response.statusCode).toBe(404);
    expect(revoke).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: defaultProjectAccess.project_id })
    );
  });
  it("requires verified interactive issuance for a new scope", async () => {
    const create = vi.fn();
    const app = createTokenApiServer({
      tokenManagement: mockedObject<ApiDependencies["tokenManagement"]>({
        createMemberTokenForOrganization: create
      })
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/member/tokens",
      headers: { authorization: "Bearer dbundle_mem_test" },
      payload: {
        label: "read",
        scope: {
          mode: "projects",
          project_ids: [defaultProjectAccess.project_id],
          permissions: ["project:read"]
        }
      }
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "interactive_verification_required" });
    expect(create).not.toHaveBeenCalled();
  });
  it("snapshots trusted origins for verified interactive issuance", async () => {
    const create = vi
      .fn()
      .mockImplementation(
        async (
          input: Parameters<
            ApiDependencies["tokenManagement"]["createMemberTokenForOrganization"]
          >[0]
        ) => ({ ...input, token_id: "token" })
      );
    const resolve = vi.fn().mockResolvedValue({
      ...defaultProjectAccess,
      origin_project_ids: [defaultProjectAccess.project_id]
    });
    const app = createTokenApiServer({
      projectManagement: mockedObject<NonNullable<ApiDependencies["projectManagement"]>>({
        resolveProjectAccessForUser: resolve
      }),
      webAuth: {
        resolveSessionByToken: vi.fn().mockResolvedValue({
          session_id: "session",
          user_id: "usr_123",
          email: "test@example.test",
          email_verified_at: "2026-11-01T00:00:00.000Z",
          organization_id: "org_123",
          role: "owner"
        })
      },
      tokenManagement: mockedObject<ApiDependencies["tokenManagement"]>({
        createMemberTokenForOrganization: create
      })
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/member/tokens",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=secret`,
        "x-csrf-token": buildCsrfToken("secret")
      },
      payload: {
        label: "read",
        scope: {
          mode: "projects",
          project_ids: [defaultProjectAccess.project_id],
          permissions: ["project:read"]
        }
      }
    });
    expect(response.statusCode).toBe(201);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: {
          version: 1,
          mode: "projects",
          permissions: ["project:read"],
          projects: [
            {
              project_id: defaultProjectAccess.project_id,
              origin_project_ids: [defaultProjectAccess.project_id]
            }
          ]
        },
        expires_at: expect.any(String)
      })
    );
    expect(resolve).toHaveBeenCalledWith({
      user_id: "usr_123",
      project_id: defaultProjectAccess.project_id,
      include_organization_grants: true
    });
  });
  it.each([
    "/v1/account/export",
    "/v1/billing",
    "/v1/github/installation",
    "/v1/weekly-report-channels"
  ])("does not expose account-wide data through %s", async (url) => {
    const app = createTokenApiServer({ memberAuth: memberAuth() });
    const response = await app.inject({
      method: "GET",
      url,
      headers: { authorization: "Bearer dbundle_mem_test" }
    });
    expect(response.statusCode).toBe(403);
  });
  it("does not use an operational write permission to change project settings", async () => {
    const auth = memberAuth();
    auth.resolveMemberByTokenHash.mockResolvedValue({
      ...scoped,
      token_policy: { ...scoped.token_policy, permissions: ["project:write"] }
    });
    const update = vi.fn();
    const app = createTokenApiServer({
      memberAuth: auth,
      projectManagement: mockedObject<NonNullable<ApiDependencies["projectManagement"]>>({
        resolveProjectAccessForUser: vi.fn().mockResolvedValue(defaultProjectAccess),
        updateProjectForUser: update
      })
    });
    const response = await app.inject({
      method: "PATCH",
      url: `/v1/projects/${defaultProjectAccess.project_id}`,
      headers: { authorization: "Bearer dbundle_mem_test" },
      payload: { name: "changed" }
    });
    expect(response.statusCode).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });
  it("does not mint a broader member token", async () => {
    const create = vi.fn();
    const app = createTokenApiServer({
      memberAuth: memberAuth(),
      tokenManagement: mockedObject<ApiDependencies["tokenManagement"]>({
        createMemberTokenForOrganization: create
      })
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/member/tokens",
      headers: { authorization: "Bearer dbundle_mem_test" },
      payload: { label: "child" }
    });
    expect(response.statusCode).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });
  it("does not mint an unrestricted ingestion credential", async () => {
    const create = vi.fn();
    const app = createTokenApiServer({
      memberAuth: memberAuth(),
      tokenManagement: mockedObject<ApiDependencies["tokenManagement"]>({
        createProjectTokenForOrganization: create
      })
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/projects/${defaultProjectAccess.project_id}/tokens`,
      headers: { authorization: "Bearer dbundle_mem_test" },
      payload: { label: "child" }
    });
    expect(response.statusCode).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });
  it("rejects an otherwise-owned project outside declared token scope", async () => {
    const app = createTokenApiServer({ memberAuth: memberAuth() });
    const response = await app.inject({
      method: "GET",
      url: "/v1/projects/00000000-0000-4000-8000-000000000002/tokens",
      headers: { authorization: "Bearer dbundle_mem_test" }
    });
    expect(response.statusCode).toBe(404);
  });
});
