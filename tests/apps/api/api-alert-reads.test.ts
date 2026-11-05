import { describe, expect, it, vi } from "vitest";
import { AlertSchema } from "../../../packages/alert-client/src/index.js";
import {
  createServer,
  defaultProjectAccess,
  type ApiServerDependencies
} from "../../helpers/alert-api.ts";
import { mockedObject } from "../../helpers/vitest.ts";

const scope = {
  origin_project_ids: [defaultProjectAccess.project_id],
  covers_current_project: false,
  services: [{ service_definition_id: "00000000-0000-4000-8000-000000000002", name: "App" }],
  service_count: 1,
  service_filter: null
};
const alert = {
  alert_id: "00000000-0000-4000-8000-000000000003",
  project_id: defaultProjectAccess.project_id,
  created_by_user_id: "owner",
  service_id: null,
  channel: "email",
  condition_type: "new_incident",
  severity_min: null,
  severity_lifecycle_scope: null,
  cooldown_seconds: 0,
  config: { to: "owner@example.test" },
  is_enabled: true,
  created_at: "2026-11-05T00:00:00Z",
  updated_at: "2026-11-05T00:00:00Z",
  scope
};
function management() {
  return mockedObject<NonNullable<ApiServerDependencies["alertManagement"]>>({
    listAlertsForOrganization: vi.fn().mockResolvedValue([alert]),
    createAlertForOrganization: vi.fn(),
    updateAlertForOrganization: vi.fn(),
    deleteAlertForOrganization: vi.fn()
  });
}

describe("opt-in alert scope read", () => {
  it.each([undefined, "false", "true"])(
    "keeps strict predecessor response shapes unless scope is requested: %s",
    async (option) => {
      const alertManagement = management(),
        app = createServer({ alertManagement });
      try {
        const response = await app.inject({
          method: "GET",
          url: `/v1/alerts?project_id=${defaultProjectAccess.project_id}${option === undefined ? "" : `&include_scope=${option}`}`,
          headers: { authorization: "Bearer dbundle_mem_test" }
        });
        expect(response.statusCode).toBe(200);
        expect(alertManagement.listAlertsForOrganization).toHaveBeenCalledWith({
          organization_id: "org_123",
          project_id: defaultProjectAccess.project_id,
          limit: 20,
          ...(option === "true" ? { include_scope: true } : {})
        });
        const record = response.json<{ alerts: [Record<string, unknown>] }>().alerts[0];
        if (option === "true") expect(record["scope"]).toEqual(scope);
        else {
          expect(Object.hasOwn(record, "scope")).toBe(false);
          expect(
            AlertSchema.omit({ scope: true, signing_secret: true }).strict().safeParse(record)
              .success
          ).toBe(true);
        }
      } finally {
        await app.close();
      }
    }
  );

  it.each(["yes", "1", "", "true&include_scope=false"])(
    "rejects malformed scope options: %s",
    async (option) => {
      const alertManagement = management(),
        app = createServer({ alertManagement });
      try {
        const response = await app.inject({
          method: "GET",
          url: `/v1/alerts?project_id=${defaultProjectAccess.project_id}&include_scope=${option}`,
          headers: { authorization: "Bearer dbundle_mem_test" }
        });
        expect(response.statusCode).toBe(400);
        expect(alertManagement.listAlertsForOrganization).not.toHaveBeenCalled();
      } finally {
        await app.close();
      }
    }
  );

  it("does not bypass authenticated project access when scope is requested", async () => {
    const alertManagement = management(),
      app = createServer({
        alertManagement,
        memberAuth: { resolveMemberByTokenHash: vi.fn().mockResolvedValue(null) }
      });
    try {
      const response = await app.inject({
        method: "GET",
        url: `/v1/alerts?project_id=${defaultProjectAccess.project_id}&include_scope=true`,
        headers: { authorization: "Bearer dbundle_mem_test" }
      });
      expect(response.statusCode).toBe(401);
      expect(alertManagement.listAlertsForOrganization).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});

describe("legacy alert read routes", () => {
  it("should reject unauthenticated alert requests and missing alert management dependencies", async (): Promise<void> => {
    const unauthenticatedApp = createServer({
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue(null)
      }
    });
    const missingDepsApp = createServer({
      alertManagement: undefined
    });

    const unauthenticated = await unauthenticatedApp.inject({
      method: "GET",
      url: "/v1/alerts?project_id=00000000-0000-4000-8000-000000000001"
    });
    const missingDeps = await missingDepsApp.inject({
      method: "GET",
      url: "/v1/alerts?project_id=00000000-0000-4000-8000-000000000001",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(unauthenticated.statusCode).toBe(401);
    expect(unauthenticated.json()).toEqual({ error: "invalid_member_token" });
    expect(missingDeps.statusCode).toBe(404);
    expect(missingDeps.json()).toEqual({ error: "project_not_found" });
  });

  it("should validate alert list query", async (): Promise<void> => {
    const app = createServer();

    const missingProject = await app.inject({
      method: "GET",
      url: "/v1/alerts",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });
    const badProject = await app.inject({
      method: "GET",
      url: "/v1/alerts?project_id=not-a-uuid",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(missingProject.statusCode).toBe(400);
    expect(missingProject.json()).toEqual({ error: "invalid_query" });
    expect(badProject.statusCode).toBe(400);
    expect(badProject.json()).toEqual({ error: "invalid_query" });
  });

  it("should list alerts scoped to member organization", async (): Promise<void> => {
    const alertManagement = {
      listAlertsForOrganization: vi.fn().mockResolvedValue([
        {
          alert_id: "22222222-2222-4222-8222-222222222222",
          project_id: "00000000-0000-4000-8000-000000000001",
          created_by_user_id: "usr_123",
          service_id: null,
          channel: "email",
          condition_type: "new_incident",
          severity_min: null,
          severity_lifecycle_scope: null,
          cooldown_seconds: 0,
          config: { to: "owner@example.com" },
          is_enabled: true,
          created_at: "2026-03-15T00:00:00.000Z",
          updated_at: "2026-03-15T00:00:00.000Z"
        }
      ]),
      createAlertForOrganization: vi.fn().mockResolvedValue(null),
      updateAlertForOrganization: vi.fn().mockResolvedValue(null),
      deleteAlertForOrganization: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ alertManagement });

    const response = await app.inject({
      method: "GET",
      url: "/v1/alerts?project_id=00000000-0000-4000-8000-000000000001&limit=10",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      alerts: [
        {
          alert_id: "22222222-2222-4222-8222-222222222222",
          project_id: "00000000-0000-4000-8000-000000000001",
          created_by_user_id: "usr_123",
          service_id: null,
          channel: "email",
          condition_type: "new_incident",
          severity_min: null,
          severity_lifecycle_scope: null,
          cooldown_seconds: 0,
          config: { to: "owner@example.com" },
          is_enabled: true,
          created_at: "2026-03-15T00:00:00.000Z",
          updated_at: "2026-03-15T00:00:00.000Z"
        }
      ]
    });
    expect(alertManagement.listAlertsForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: "00000000-0000-4000-8000-000000000001",
      limit: 10
    });
  });

  it("should list alerts for collaborators using the shared project's organization", async (): Promise<void> => {
    const projectManagement = mockedObject<NonNullable<ApiServerDependencies["projectManagement"]>>(
      {
        resolveProjectAccessForUser: vi.fn().mockResolvedValue({
          ...defaultProjectAccess,
          organization_id: "org_shared",
          relationship: "shared",
          effective_role: "member"
        }),
        listProjectsForUser: vi.fn().mockResolvedValue([]),
        createProjectForUser: vi.fn().mockResolvedValue(null),
        updateProjectForUser: vi.fn().mockResolvedValue(null),
        deleteProjectForUser: vi.fn().mockResolvedValue(null)
      }
    );
    const alertManagement = {
      listAlertsForOrganization: vi.fn().mockResolvedValue([]),
      createAlertForOrganization: vi.fn().mockResolvedValue(null),
      updateAlertForOrganization: vi.fn().mockResolvedValue(null),
      deleteAlertForOrganization: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ projectManagement, alertManagement });

    const response = await app.inject({
      method: "GET",
      url: "/v1/alerts?project_id=00000000-0000-4000-8000-000000000001&limit=10",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(alertManagement.listAlertsForOrganization).toHaveBeenCalledWith({
      organization_id: "org_shared",
      project_id: "00000000-0000-4000-8000-000000000001",
      limit: 10
    });
  });

  it("should rate limit alert reads per member", async (): Promise<void> => {
    const claimRequest = vi.fn().mockResolvedValue({
      allowed: false,
      limit: 100,
      remaining: 0,
      retry_after_ms: 12_000
    });
    const app = createServer({ authRateLimiter: { claimRequest } });

    const response = await app.inject({
      method: "GET",
      url: "/v1/alerts?project_id=00000000-0000-4000-8000-000000000001&limit=10",
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
