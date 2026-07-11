import { describe, expect, it, vi } from "vitest";

import { runSelfhostSmoke } from "../../scripts/selfhost-smoke.js";

function jsonResponse(status: number, body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {})
    }
  });
}

function textResponse(status: number, body: string, init: ResponseInit = {}): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      ...(init.headers ?? {})
    }
  });
}

describe("self-host smoke runner", () => {
  it("proves the self-host member auth, ingest, and bundle flow end to end", async () => {
    const analytics = {
      acceptedEvents: 27,
      sessions: 3,
      pageviews: 6,
      conversions: 2,
      journeySampleId: "33333333-3333-4333-8333-333333333333",
      bundleGenerationId: "22222222-2222-4222-8222-222222222222",
      bundleSchemaVersion: "analytics_bundle.v1" as const
    };
    const runAnalyticsSmoke = vi.fn().mockResolvedValue(analytics);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(200, { status: "ok" }))
      .mockResolvedValueOnce(textResponse(200, "<html><body>DebugBundle</body></html>"))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          token: {
            token_id: "tok_123",
            user_id: "usr_123",
            organization_id: "org_123",
            label: "Self-host smoke",
            created_at: "2026-04-03T00:00:00.000Z",
            last_used_at: null,
            revoked_at: null,
            expires_at: null,
            plaintext: "dbundle_mem_smoke"
          }
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(201, {
          project: {
            project_id: "11111111-1111-4111-8111-111111111111",
            name: "Self-Host Smoke",
            slug: "self-host-smoke",
            environment_default: "production"
          }
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(201, {
          token: {
            token_id: "22222222-2222-4222-8222-222222222222",
            plaintext: "dbundle_proj_smoke"
          }
        })
      )
      .mockResolvedValueOnce(jsonResponse(202, { accepted: 1, rejected: [] }))
      .mockResolvedValueOnce(jsonResponse(200, { incidents: [], next_cursor: null }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          incidents: [
            {
              incident_id: "inc_123",
              last_seen_at: "2026-04-03T00:00:10.000Z"
            }
          ],
          next_cursor: null
        })
      )
      .mockResolvedValueOnce(jsonResponse(200, { status: "pending" }))
      .mockResolvedValueOnce(jsonResponse(200, { bundle_version: 1, summary: { title: "Self-host smoke" } }));

    const result = await runSelfhostSmoke({
      apiBaseUrl: "http://api.debugbundle.test",
      webBaseUrl: "http://web.debugbundle.test",
      runId: "20260403smoke",
      pollIntervalMs: 0,
      timeoutMs: 100,
      fetchImpl,
      wait: async () => undefined,
      runAnalyticsSmoke
    });

    expect(result).toMatchObject({
      projectId: "11111111-1111-4111-8111-111111111111",
      incidentId: "inc_123",
      bundleVersion: 1,
      analytics,
      checks: [
        { name: "api-health", status: "ok" },
        { name: "web-health", status: "ok" },
        { name: "member-token-auth", status: "ok" },
        { name: "project-token-ingestion", status: "ok" },
        { name: "incident-retrieval", status: "ok" },
        { name: "bundle-retrieval", status: "ok" },
        { name: "browser-analytics-ingestion", status: "ok" },
        { name: "analytics-rollups", status: "ok" },
        { name: "analytics-journey-sample", status: "ok" },
        { name: "analytics-bundle-retrieval", status: "ok" }
      ]
    });

    expect(runAnalyticsSmoke).toHaveBeenCalledWith(expect.objectContaining({
      apiBaseUrl: "http://api.debugbundle.test",
      memberToken: "dbundle_mem_smoke",
      projectToken: "dbundle_proj_smoke",
      projectId: "11111111-1111-4111-8111-111111111111"
    }));

    expect(fetchImpl).toHaveBeenNthCalledWith(
      4,
      "http://api.debugbundle.test/v1/projects",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer dbundle_mem_smoke"
        })
      })
    );

    expect(fetchImpl).toHaveBeenNthCalledWith(
      6,
      "http://api.debugbundle.test/v1/events",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer dbundle_proj_smoke"
        })
      })
    );

    expect(fetchImpl).toHaveBeenLastCalledWith(
      "http://api.debugbundle.test/v1/incidents/inc_123/bundle",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          authorization: "Bearer dbundle_mem_smoke"
        })
      })
    );
  });

  it("fails clearly when bootstrap auth does not return a member token", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(200, { status: "ok" }))
      .mockResolvedValueOnce(textResponse(200, "<html><body>DebugBundle</body></html>"))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          token: {}
        })
      );

    await expect(
      runSelfhostSmoke({
        apiBaseUrl: "http://api.debugbundle.test",
        webBaseUrl: "http://web.debugbundle.test",
        runId: "20260403smoke",
        pollIntervalMs: 0,
        timeoutMs: 100,
        fetchImpl,
        wait: async () => undefined
      })
    ).rejects.toThrow("Self-host bootstrap did not return a member token.");
  });
});
