import { describe, expect, it, vi } from "vitest";

import { createApiServer, type ApiDependencies } from "../../../apps/api/src/server.js";
import { generateAgentToken } from "../../../packages/auth/src/index.js";
import { mockedObject } from "../../helpers/vitest.js";

const PROJECT = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const INCIDENT = "11111111-1111-4111-8111-111111111111";
const token = generateAgentToken();
const access = {
  project_id: PROJECT, organization_id: "org_1", owner_user_id: "user_1",
  owner_email: "owner@example.com", relationship: "owned", sharing_state: "private",
  effective_role: "owner", shared_access_suspended: false, organization_plan: "team",
  project_name: "API"
};

function fixture(overrides: { token?: Record<string, unknown> | null; access?: Record<string, unknown> | null; issuanceEnabled?: boolean } = {}) {
  const resolveByTokenHash = vi.fn().mockResolvedValue(overrides.token === undefined ? {
    token_id: "token_1", user_id: "user_1", project_id: PROJECT, organization_id: "org_1",
    scope: "incident:read-minimized", policy_version: "telemetry-privacy-v1",
    expires_at: "2099-01-01T00:00:00.000Z", revoked_at: null
  } : overrides.token);
  const resolveProjectAccessForUser = vi.fn().mockResolvedValue(overrides.access === undefined ? access : overrides.access);
  const listIncidentsForOrganization = vi.fn().mockResolvedValue([]);
  const getIncidentForOrganization = vi.fn().mockResolvedValue(null);
  const getObject = vi.fn();
  const create = vi.fn().mockResolvedValue({ token_id: "token_1", plaintext: token.plaintext });
  const list = vi.fn().mockResolvedValue([]);
  const revoke = vi.fn().mockResolvedValue({ token_id: "token_1", revoked_at: "2026-09-20T00:00:00.000Z" });
  const app = createApiServer(mockedObject<ApiDependencies>({
    agentTokens: { resolveByTokenHash, create, list, revoke },
    agentReads: {
      projectManagement: { resolveProjectAccessForUser },
      incidentRetrieval: { listIncidentsForOrganization, getIncidentForOrganization },
      objectStoreReader: { getObject }
    },
    projectManagement: { resolveProjectAccessForUser },
    memberAuth: { resolveMemberByTokenHash: vi.fn().mockResolvedValue({
      member_id: "user_1", organization_id: "org_1", role: "owner"
    }) },
    incidentRetrieval: { listIncidentsForOrganization, getIncidentForOrganization },
    objectStoreReader: { getObject }
  }), { dogfoodingEnv: { AGENT_TOKEN_ISSUANCE_ENABLED: overrides.issuanceEnabled ? "true" : "false" } });
  return { app, resolveByTokenHash, resolveProjectAccessForUser, listIncidentsForOrganization,
    getIncidentForOrganization, getObject, create, list, revoke };
}

const agentHeaders = { authorization: `Bearer ${token.plaintext}` };

describe("project-scoped agent evidence", () => {
  it("rejects cross-project paths before any incident or artifact read", async () => {
    const f = fixture();
    const response = await f.app.inject({ method: "GET", url: `/v1/agent/projects/${OTHER}/incidents/${INCIDENT}/bundle`, headers: agentHeaders });
    expect(response.statusCode).toBe(401);
    expect(f.getIncidentForOrganization).not.toHaveBeenCalled();
    expect(f.getObject).not.toHaveBeenCalled();
  });

  it("rejects expired, unknown policy, and lost project access", async () => {
    for (const override of [
      { token: { ...validContext(), expires_at: "2000-01-01T00:00:00.000Z" } },
      { token: { ...validContext(), policy_version: "unknown" } },
      { access: null }
    ]) {
      const f = fixture(override);
      const response = await f.app.inject({ method: "GET", url: `/v1/agent/projects/${PROJECT}/incidents`, headers: agentHeaders });
      expect([401, 403]).toContain(response.statusCode);
      expect(f.listIncidentsForOrganization).not.toHaveBeenCalled();
    }
  });

  it("lists only the bound project's minimized incidents and does not invoke writes", async () => {
    const f = fixture();
    const response = await f.app.inject({ method: "GET", url: `/v1/agent/projects/${PROJECT}/incidents?limit=5`, headers: agentHeaders });
    expect(response.statusCode).toBe(200);
    expect(response.headers["x-debugbundle-privacy-policy"]).toBe("telemetry-privacy-v1");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(f.listIncidentsForOrganization).toHaveBeenCalledWith(expect.objectContaining({
      organization_id: "org_1", user_id: "user_1", project_id: PROJECT, limit: 6
    }));
    expect(f.getObject).not.toHaveBeenCalled();
    expect(f.create).not.toHaveBeenCalled();
    expect(f.revoke).not.toHaveBeenCalled();

    const project = await f.app.inject({ method: "GET", url: `/v1/agent/projects/${PROJECT}`, headers: agentHeaders });
    expect(project.statusCode).toBe(200);
    expect(project.headers["cache-control"]).toBe("no-store");
  });

  it("rejects a cursor from another project before the incident query", async () => {
    const f = fixture();
    const cursor = `${OTHER}.${Buffer.from(JSON.stringify({ last_seen_at: "2026-01-01T00:00:00Z", incident_id: INCIDENT })).toString("base64url")}`;
    const response = await f.app.inject({ method: "GET",
      url: `/v1/agent/projects/${PROJECT}/incidents?cursor=${cursor}`, headers: agentHeaders });
    expect(response.statusCode).toBe(400);
    expect(f.listIncidentsForOrganization).not.toHaveBeenCalled();
  });

  it("accepts a cursor bound to the same project without widening the database scope", async () => {
    const f = fixture();
    const lastSeen = "2026-01-01T00:00:00.000Z";
    const cursor = Buffer.from(JSON.stringify({ last_seen_at: lastSeen, incident_id: INCIDENT })).toString("base64url");
    const response = await f.app.inject({ method: "GET",
      url: `/v1/agent/projects/${PROJECT}/incidents?cursor=${PROJECT}.${cursor}`, headers: agentHeaders });
    expect(response.statusCode).toBe(200);
    expect(f.listIncidentsForOrganization).toHaveBeenCalledWith(expect.objectContaining({
      project_id: PROJECT, cursor: { last_seen_at: lastSeen, incident_id: INCIDENT }
    }));
  });

  it("cannot invoke member mutation routes using the restricted bearer", async () => {
    const f = fixture();
    const response = await f.app.inject({ method: "POST", url: `/v1/projects/${PROJECT}/agent-tokens`,
      headers: agentHeaders, payload: { label: "unexpected" } });
    expect(response.statusCode).toBe(401);
    expect(f.create).not.toHaveBeenCalled();
  });

  it("does not treat the agent credential as a member token for management", async () => {
    const f = fixture();
    const response = await f.app.inject({ method: "GET", url: `/v1/projects/${PROJECT}/agent-tokens`, headers: agentHeaders });
    expect(response.statusCode).toBe(401);
    expect(f.list).not.toHaveBeenCalled();
  });

  it("restricts issuance to owner/admin and a bounded expiry", async () => {
    const f = fixture({ access: { ...access, effective_role: "member" }, issuanceEnabled: true });
    const denied = await f.app.inject({ method: "POST", url: `/v1/projects/${PROJECT}/agent-tokens`,
      headers: { authorization: "Bearer dbundle_mem_test" }, payload: { label: "agent" } });
    expect(denied.statusCode).toBe(403);
    expect(f.create).not.toHaveBeenCalled();
    const g = fixture({ issuanceEnabled: true });
    const oversized = await g.app.inject({ method: "POST", url: `/v1/projects/${PROJECT}/agent-tokens`,
      headers: { authorization: "Bearer dbundle_mem_test" },
      payload: { label: "agent", expires_at: "2099-01-01T00:00:00.000Z" } });
    expect(oversized.statusCode).toBe(400);
    expect(g.create).not.toHaveBeenCalled();
  });

  it("withholds issuance until the serving fleet is ready and never stores the response in a cache", async () => {
    const disabled = fixture();
    const request = { method: "POST" as const, url: `/v1/projects/${PROJECT}/agent-tokens`,
      headers: { authorization: "Bearer dbundle_mem_test" }, payload: { label: "agent" } };
    expect((await disabled.app.inject(request)).statusCode).toBe(503);
    expect(disabled.create).not.toHaveBeenCalled();

    const enabled = fixture({ issuanceEnabled: true });
    const response = await enabled.app.inject(request);
    expect(response.statusCode).toBe(201);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(enabled.create).toHaveBeenCalledOnce();
  });
});

function validContext() {
  return { token_id: "token_1", user_id: "user_1", project_id: PROJECT, organization_id: "org_1",
    scope: "incident:read-minimized", policy_version: "telemetry-privacy-v1",
    expires_at: "2099-01-01T00:00:00.000Z", revoked_at: null };
}
