import { gunzipSync, gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";

import { createApiServer } from "../../../apps/api/src/server.ts";
import { buildRejectedDiagnosticFromCandidate } from "../../../apps/api/src/routes/ingestion-observability.ts";
import { createEventEnvelope } from "../../../packages/shared-types/src/index.ts";
import { createIngestionPersistenceService } from "../../../packages/storage/src/ingestion-services.ts";
import {
  createIncidentRetrievalDependency,
  createMemberAuthDependency,
  createObjectStoreReaderDependency,
  createTokenManagementDependency,
  createWebhookDeliveryDependency
} from "../../helpers/api-ingestion-dependencies.ts";

function createPrivacyTestServer() {
  const writes: Buffer[] = [];
  const queue = { enqueue: vi.fn().mockResolvedValue(undefined) };
  const persistence = createIngestionPersistenceService({
    objectStore: { putObject: vi.fn(async ({ body }: { body: Buffer }) => { writes.push(body); }) },
    queue
  });
  const app = createApiServer({
    ingestionPersistence: persistence,
    ingestionMetadata: {
      resolveProjectByTokenHash: vi.fn().mockResolvedValue({ project_id: "proj_123", organization_id: "org_123" })
    },
    memberAuth: createMemberAuthDependency(),
    tokenManagement: createTokenManagementDependency(),
    incidentRetrieval: createIncidentRetrievalDependency(),
    objectStoreReader: createObjectStoreReaderDependency(),
    webhookDelivery: createWebhookDeliveryDependency()
  });
  return { app, writes, queue };
}

function createException(context: Record<string, unknown>, message = "synthetic error") {
  return createEventEnvelope({
    event_type: "backend_exception",
    service: { name: "audit", environment: "test" },
    context,
    payload: {
      name: "Error", message, stack: "Error: synthetic error", handled: false,
      request: { method: "GET", path: "/test", query: {}, headers: {}, body: { password: "SYNTHETIC_AUDIT_SECRET" } },
      response: { status_code: 500 }, runtime: { version: "24.0.0" }
    }
  });
}

describe("ingestion mandatory privacy boundary", () => {
  it.each(["correlation", "sdk_name", "sdk_version", "schema_version"])("withholds credentials in %s before storage", async (field) => {
    const { app, writes } = createPrivacyTestServer();
    try {
      const event = createException({ route: "/safe" });
      const unsafe = { ...event, [field]: field === "correlation"
        ? { trace_id: "dbundle_proj_SYNTHETIC_SECRET" } : "dbundle_proj_SYNTHETIC_SECRET" };
      const response = await app.inject({ method: "POST", url: "/v1/events",
        headers: { authorization: "Bearer dbundle_proj_test" }, payload: { events: [unsafe, event] } });
      expect(response.json()).toMatchObject({ accepted: 1, rejected: 1 });
      expect(writes).toHaveLength(1);
      expect(gunzipSync(writes[0]!).toString("utf8")).not.toContain("SYNTHETIC_SECRET");
    } finally { await app.close(); }
  });

  it("scrubs historical incident titles and log messages across list and log retrieval", async () => {
    const incidentRetrieval = createIncidentRetrievalDependency();
    incidentRetrieval.listIncidentsForOrganization.mockResolvedValue([{
      incident_id: "550e8400-e29b-41d4-a716-446655440123",
      title: "Authorization: Bearer HISTORICAL_SECRET",
      last_seen_at: "2026-09-20T00:00:00.000Z"
    } as never]);
    incidentRetrieval.listIncidentLogsForOrganization.mockResolvedValue([{
      event_id: "550e8400-e29b-41d4-a716-446655440124",
      message: "password=HISTORICAL_SECRET"
    } as never]);
    const app = createApiServer({
      ingestionPersistence: { persistAndEnqueue: vi.fn() },
      ingestionMetadata: { resolveProjectByTokenHash: vi.fn() },
      memberAuth: createMemberAuthDependency(),
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval,
      objectStoreReader: createObjectStoreReaderDependency(),
      webhookDelivery: createWebhookDeliveryDependency()
    });
    try {
      for (const url of ["/v1/incidents", "/v1/logs?incident_id=550e8400-e29b-41d4-a716-446655440123"]) {
        const response = await app.inject({ method: "GET", url, headers: { authorization: "Bearer dbundle_mem_test" } });
        expect(response.statusCode).toBe(200);
        expect(response.body).not.toContain("HISTORICAL_SECRET");
        expect(response.body).toContain("[REDACTED]");
      }
    } finally {
      await app.close();
    }
  });

  it("re-scrubs a historical bundle through the authenticated retrieval route", async () => {
    const incidentRetrieval = createIncidentRetrievalDependency();
    incidentRetrieval.getIncidentForOrganization.mockResolvedValue({
      incident_id: "550e8400-e29b-41d4-a716-446655440123",
      project_id: "550e8400-e29b-41d4-a716-446655440000"
    } as never);
    const objectStoreReader = createObjectStoreReaderDependency();
    objectStoreReader.getObject.mockResolvedValue(gzipSync(Buffer.from(JSON.stringify({
      bundle_version: 1,
      context: { password: "HISTORICAL_SECRET" },
      error_message: "Authorization: Bearer HISTORICAL_SECRET"
    }))));
    const app = createApiServer({
      ingestionPersistence: { persistAndEnqueue: vi.fn() },
      ingestionMetadata: { resolveProjectByTokenHash: vi.fn() },
      memberAuth: createMemberAuthDependency(),
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval, objectStoreReader,
      webhookDelivery: createWebhookDeliveryDependency()
    });
    try {
      const response = await app.inject({
        method: "GET", url: "/v1/incidents/550e8400-e29b-41d4-a716-446655440123/bundle",
        headers: { authorization: "Bearer dbundle_mem_test" }
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        bundle_version: 1,
        context: { password: "[REDACTED]" },
        error_message: "Authorization: [REDACTED]"
      });
      expect(response.body).not.toContain("HISTORICAL_SECRET");
    } finally {
      await app.close();
    }
  });

  it("sanitizes rejected-event metadata before recording bounded diagnostics", () => {
    const diagnostic = buildRejectedDiagnosticFromCandidate({
      project_id: "proj_123", rejection_reason: "invalid_event",
      candidate: {
        sdk_name: "Authorization: Bearer SYNTHETIC_AUDIT_SECRET",
        service: { name: "password=SYNTHETIC_AUDIT_SECRET" }
      }
    });
    expect(JSON.stringify(diagnostic)).not.toContain("SYNTHETIC_AUDIT_SECRET");
  });
  it("scrubs context and free-text credentials before real compressed storage and queueing", async () => {
    const { app, writes, queue } = createPrivacyTestServer();
    try {
      const response = await app.inject({
        method: "POST", url: "/v1/events", headers: { authorization: "Bearer dbundle_proj_test" },
        payload: { events: [createException({ password: "SYNTHETIC_AUDIT_SECRET" },
          "Authorization: Bearer SYNTHETIC_AUDIT_SECRET")] }
      });
      expect(response.statusCode).toBe(202);
      expect(writes).toHaveLength(1);
      const stored = JSON.parse(gunzipSync(writes[0]!).toString("utf8")) as {
        context: { password: string }; payload: { message: string; request: { body: { password: string } } };
      };
      expect(stored.context.password).toBe("[REDACTED]");
      expect(stored.payload.message).toBe("Authorization: [REDACTED]");
      expect(stored.payload.request.body.password).toBe("[REDACTED]");
      expect(JSON.stringify(stored)).not.toContain("SYNTHETIC_AUDIT_SECRET");
      expect(queue.enqueue).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });

  it("rejects an unscannable event by index without storing it or rejecting its safe neighbor", async () => {
    const { app, writes, queue } = createPrivacyTestServer();
    try {
      const unsafe = createException({ many: Object.fromEntries(
        Array.from({ length: 220 }, (_, index) => [`key_${index}`, Array.from({ length: 20 }, () => 0)])
      ) });
      const safe = createException({ route: "/safe" });
      const response = await app.inject({
        method: "POST", url: "/v1/events", headers: { authorization: "Bearer dbundle_proj_test" },
        payload: { events: [unsafe, safe] }
      });
      expect(response.statusCode).toBe(202);
      expect(response.json()).toMatchObject({
        accepted: 1, rejected: 1, errors: [{ index: 0, reason: "unsafe_event" }]
      });
      expect(writes).toHaveLength(1);
      expect(JSON.parse(gunzipSync(writes[0]!).toString("utf8"))).toMatchObject({ event_id: safe.event_id });
      expect(queue.enqueue).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });
});
