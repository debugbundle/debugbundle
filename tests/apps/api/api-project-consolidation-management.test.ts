import { describe, expect, it, vi } from "vitest";
import { createApiServer, type ApiDependencies } from "../../../apps/api/src/server.js";
import { createBaseDependencies } from "../../helpers/api-capture-rule-ingestion.js";
import { mockedObject } from "../../helpers/vitest.js";

const SOURCE = "00000000-0000-4000-8000-000000000001",
  ROOT = "00000000-0000-4000-8000-000000000002",
  TOKEN = "00000000-0000-4000-8000-000000000003";
const headers = { authorization: "Bearer dbundle_mem_test" };
function fixture(legacy = true) {
  const deps = createBaseDependencies();
  const create = vi.fn(),
    remove = vi.fn(),
    update = vi.fn();
  const revoke = vi.fn().mockResolvedValue({
    token_id: TOKEN,
    project_id: SOURCE,
    label: "Existing",
    allowed_origins: [],
    created_at: new Date().toISOString(),
    last_used_at: null,
    expires_at: null,
    revoked_at: new Date().toISOString()
  });
  deps.projectManagement = mockedObject<NonNullable<ApiDependencies["projectManagement"]>>({
    resolveProjectAccessForUser: vi.fn().mockResolvedValue({
      project_id: legacy ? SOURCE : ROOT,
      ...(legacy ? { canonical_project_id: ROOT } : {}),
      organization_id: "org_123",
      owner_user_id: "mem_123",
      owner_email: "owner@example.test",
      relationship: "owned",
      sharing_state: "private",
      effective_role: "owner",
      organization_plan: "team",
      shared_access_suspended: false
    }),
    deleteProjectForUser: remove,
    updateProjectForUser: update
  });
  deps.tokenManagement.createProjectTokenForOrganization = create;
  deps.tokenManagement.revokeProjectTokenForOrganization = revoke;
  const setRepo = vi.fn().mockResolvedValue({ project_id: SOURCE, repo_name: "site" });
  const removeRepo = vi.fn().mockResolvedValue(true);
  deps.githubManagement = mockedObject<NonNullable<ApiDependencies["githubManagement"]>>({
    setProjectRepoForOrganization: setRepo,
    removeProjectRepoForOrganization: removeRepo
  });
  deps.billingManagement = mockedObject<NonNullable<ApiDependencies["billingManagement"]>>({
    getBillingSummaryForProject: vi.fn().mockResolvedValue({ plan: "team" })
  });
  return { app: createApiServer(deps), create, remove, update, revoke, setRepo, removeRepo };
}
describe("legacy project management conflicts", () => {
  it("returns the canonical identity before token creation, project edits or deletion", async () => {
    const f = fixture();
    for (const request of [
      {
        method: "POST" as const,
        url: `/v1/projects/${SOURCE}/tokens`,
        payload: { label: "New token" }
      },
      { method: "PATCH" as const, url: `/v1/projects/${SOURCE}`, payload: { name: "Unsafe" } },
      { method: "DELETE" as const, url: `/v1/projects/${SOURCE}` }
    ]) {
      const response = await f.app.inject({ ...request, headers });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({
        error: "project_consolidated",
        canonical_project_id: ROOT,
        required_scope: "canonical_project"
      });
    }
    expect(f.create).not.toHaveBeenCalled();
    expect(f.update).not.toHaveBeenCalled();
    expect(f.remove).not.toHaveBeenCalled();
  });
  it("keeps revocation of an existing source credential available and narrow", async () => {
    const f = fixture();
    const response = await f.app.inject({
      method: "POST",
      url: `/v1/projects/${SOURCE}/tokens/${TOKEN}/revoke`,
      headers
    });
    expect(response.statusCode).toBe(200);
    expect(f.revoke).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: SOURCE, token_id: TOKEN })
    );
  });
  it("keeps retained repository binding edits and removal scoped to the original identity", async () => {
    const f = fixture();
    const set = await f.app.inject({
      method: "PUT",
      url: `/v1/projects/${SOURCE}/github/repo`,
      headers,
      payload: { owner: "fixture", repo: "site" }
    });
    expect(set.statusCode).toBe(200);
    expect(f.setRepo).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: SOURCE,
      created_by_user_id: "mem_123",
      owner: "fixture",
      repo: "site"
    });
    const remove = await f.app.inject({
      method: "DELETE",
      url: `/v1/projects/${SOURCE}/github/repo`,
      headers
    });
    expect(remove.statusCode).toBe(204);
    expect(f.removeRepo).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: SOURCE,
      actor_user_id: "mem_123"
    });
  });
  it.each(["project_merge_in_progress", "project_configuration_busy"])(
    "returns a retryable conflict for %s after authentication",
    async (code) => {
      const f = fixture(false);
      f.create.mockRejectedValue(Object.assign(new Error(code), { code: "40001" }));
      const response = await f.app.inject({
        method: "POST",
        url: `/v1/projects/${ROOT}/tokens`,
        headers,
        payload: { label: "New token" }
      });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ error: code, retryable: true });
    }
  );
});
