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
  it("proves the self-host session, ingest, and bundle flow end to end", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(200, { status: "ok" }))
      .mockResolvedValueOnce(textResponse(200, "<html><body>DebugBundle</body></html>"))
      .mockResolvedValueOnce(jsonResponse(200, { success: true }))
      .mockResolvedValueOnce(
        jsonResponse(
          200,
          {
            session: {
              session_id: "ses_123",
              user_id: "usr_123",
              email: "selfhost-smoke@example.com",
              email_verified_at: null,
              organization_id: "org_123",
              role: "owner",
              created_at: "2026-04-03T00:00:00.000Z",
              expires_at: "2026-04-03T12:00:00.000Z",
              revoked_at: null,
              csrf_token: "csrf_123"
            }
          },
          {
            headers: {
              "set-cookie": "dbundle_session=session-secret; Path=/; HttpOnly; SameSite=Strict"
            }
          }
        )
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
      wait: async () => undefined
    });

    expect(result).toMatchObject({
      projectId: "11111111-1111-4111-8111-111111111111",
      incidentId: "inc_123",
      bundleVersion: 1,
      checks: [
        { name: "api-health", status: "ok" },
        { name: "web-health", status: "ok" },
        { name: "browser-session-auth", status: "ok" },
        { name: "project-token-ingestion", status: "ok" },
        { name: "incident-retrieval", status: "ok" },
        { name: "bundle-retrieval", status: "ok" }
      ]
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      5,
      "http://api.debugbundle.test/v1/projects",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          cookie: expect.stringContaining("dbundle_session=session-secret"),
          "x-csrf-token": "csrf_123"
        })
      })
    );

    expect(fetchImpl).toHaveBeenNthCalledWith(
      7,
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
          cookie: expect.stringContaining("dbundle_session=session-secret")
        })
      })
    );
  });

  it("fails clearly when login does not return the self-host session cookie", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(200, { status: "ok" }))
      .mockResolvedValueOnce(textResponse(200, "<html><body>DebugBundle</body></html>"))
      .mockResolvedValueOnce(jsonResponse(200, { success: true }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          session: {
            csrf_token: "csrf_123"
          }
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
    ).rejects.toThrow("Self-host login did not return a session cookie.");
  });
});