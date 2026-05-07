import { afterEach, describe, expect, it } from "vitest";

import { createApiServer } from "../../../apps/api/src/server.ts";

function createServer(requestTimeoutMs: number) {
  return createApiServer(
    {
      ingestionPersistence: { persistAndEnqueue: async () => ({ object_key: "raw-events/test.json.gz" }) },
      ingestionMetadata: { resolveProjectByTokenHash: async () => null },
      memberAuth: { resolveMemberByTokenHash: async () => null },
      tokenManagement: {
        listProjectTokensForOrganization: async () => [],
        createProjectTokenForOrganization: async () => ({
          token_id: "ptok_123",
          project_id: "proj_123",
          label: "Server timeout test",
          token_preview: "dbundle_proj_test",
          created_at: "2026-03-16T00:00:00.000Z",
          last_used_at: null,
          revoked_at: null,
          expires_at: null
        }),
        revokeProjectTokenForOrganization: async () => null,
        listMemberTokensForOrganization: async () => [],
        createMemberTokenForOrganization: async () => ({
          token_id: "mtok_123",
          member_id: "mem_123",
          user_id: "usr_123",
          organization_id: "org_123",
          label: "Server timeout test",
          token_preview: "dbundle_mem_test",
          created_at: "2026-03-16T00:00:00.000Z",
          last_used_at: null,
          revoked_at: null,
          expires_at: null
        }),
        revokeMemberTokenForOrganization: async () => null
      },
      incidentRetrieval: {
        listIncidentsForOrganization: async () => [],
        getIncidentForOrganization: async () => null,
        listIncidentLogsForOrganization: async () => [],
        listServicesForOrganization: async () => []
      },
      objectStoreReader: { getObject: async () => {
        throw new Error("not_implemented");
      } },
      webhookDelivery: { listDeliveriesForWebhookInOrganization: async () => ({ deliveries: [] }) }
    },
    { requestTimeoutMs }
  );
}

const apps: Array<ReturnType<typeof createServer>> = [];

describe("api server request timeout", () => {
  afterEach(async () => {
    while (apps.length > 0) {
      await apps.pop()?.close();
    }
  });

  it("returns successful responses before the request timeout elapses", async () => {
    const app = createServer(50);
    apps.push(app);
    app.get("/__test/fast", async () => ({ ok: true }));

    const response = await app.inject({
      method: "GET",
      url: "/__test/fast"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it("fails closed with request_timeout when a route exceeds the server timeout", async () => {
    const app = createServer(5);
    apps.push(app);
    app.get("/__test/slow", async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 25);
      });

      return { ok: true };
    });

    const response = await app.inject({
      method: "GET",
      url: "/__test/slow"
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: "request_timeout" });
  });
});