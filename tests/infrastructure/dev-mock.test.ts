import { describe, expect, it } from "vitest";
import { createServer, request as httpRequest } from "node:http";
import { once } from "node:events";
import { BundleV1Schema } from "../../packages/shared-types/src/index.js";

import { createDevMockApi } from "../../scripts/dev-mock/api.js";
import { createDevMockMiddleware, devMockEnabled } from "../../apps/web/dev-mock-plugin.js";

describe("opt-in local dashboard mocks", () => {
  it("requires development serve mode and rejects production startup", () => {
    expect(devMockEnabled("serve", "development", {})).toBe(false);
    expect(devMockEnabled("serve", "development", { DEBUGBUNDLE_DEV_MOCK: "true" })).toBe(true);
    expect(devMockEnabled("build", "production", { DEBUGBUNDLE_DEV_MOCK: "true" })).toBe(false);
    expect(
      devMockEnabled("build", "production", {
        DEBUGBUNDLE_DEV_MOCK: "true",
        NODE_ENV: "production"
      })
    ).toBe(false);
    expect(devMockEnabled("serve", "staging", { DEBUGBUNDLE_DEV_MOCK: "true" })).toBe(false);
    expect(() =>
      devMockEnabled("serve", "development", {
        DEBUGBUNDLE_DEV_MOCK: "true",
        NODE_ENV: "production"
      })
    ).toThrow("production");
  });

  it("populates the dashboard and paginates filtered records consistently", () => {
    const api = createDevMockApi();
    const projects = api.handle("GET", "/v1/projects");
    expect(projects.status).toBe(200);
    expect(projects.body).toHaveProperty("projects.0.name", "SayCheese");
    const page = api.handle("GET", "/v1/incidents?project_id=proj_123&status=open&limit=10");
    expect(page.body).toMatchObject({ total_count: 22, total_pages: 3, next_cursor: "10" });
    expect(
      api.handle("GET", "/v1/incidents?status=active&project_id=proj_123&limit=20").body
    ).toMatchObject({ total_count: 22, total_pages: 2 });
    expect(api.handle("GET", "/v1/incidents?project_id=proj_new").body).toMatchObject({
      incidents: [],
      total_count: 0
    });
    expect(api.handle("GET", "/v1/incidents?limit=wat").status).toBe(400);
  });

  it("supports incident, alert, health and delivery mutations in memory only", () => {
    const api = createDevMockApi();
    expect(api.handle("POST", "/v1/incidents/inc_long/resolve").status).toBe(200);
    expect(api.handle("GET", "/v1/incidents/inc_long").body).toHaveProperty(
      "incident.status",
      "resolved"
    );
    expect(api.handle("PATCH", "/v1/alerts/alert_0", { is_enabled: false }).status).toBe(200);
    expect(api.handle("GET", "/v1/alerts?project_id=proj_123").body).toHaveProperty(
      "alerts.0.is_enabled",
      false
    );
    expect(
      api.handle("POST", "/v1/projects/proj_123/github/deliveries/gdd_0/retry").body
    ).toHaveProperty("delivery.status", "retrying");
    expect(
      api.handle("PATCH", "/v1/projects/proj_123/availability-checks/chk_web", { enabled: false })
        .status
    ).toBe(200);
    expect(api.handle("GET", "/v1/projects/proj_123/availability-checks").body).toHaveProperty(
      "checks.1.enabled",
      false
    );
    expect(createDevMockApi().handle("GET", "/v1/alerts").body).toHaveProperty(
      "alerts.0.is_enabled",
      true
    );
  });

  it("does not pretend unsupported operations succeeded or accept invalid mutations", () => {
    const api = createDevMockApi();
    expect(api.handle("GET", "/v1/unknown").status).toBe(501);
    expect(api.handle("POST", "/v1/alerts", "invalid").status).toBe(400);
    expect(api.handle("PATCH", "/v1/alerts/missing", { is_enabled: false }).status).toBe(404);
    expect(api.handle("POST", "/v1/projects/proj_123/github/deliveries/missing/retry").status).toBe(
      404
    );
  });

  it("handles local HTTP reads and edits, rejects foreign origins and never forwards mock routes", async () => {
    const middleware = createDevMockMiddleware();
    const server = createServer((req, res) =>
      middleware(req, res, () => {
        res.writeHead(418);
        res.end();
      })
    );
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test server port");
    const origin = `http://127.0.0.1:${address.port}`;
    try {
      expect((await fetch(`${origin}/v1/auth/session`)).status).toBe(200);
      const update = await fetch(`${origin}/v1/alerts/alert_0`, {
        method: "PATCH",
        headers: { origin },
        body: JSON.stringify({ is_enabled: false })
      });
      expect(update.status).toBe(200);
      expect(await update.json()).toHaveProperty("alert.is_enabled", false);
      expect((await fetch(`${origin}/v1/unknown`)).status).toBe(501);
      expect((await fetch(`${origin}/v1`)).status).toBe(501);
      expect(
        (await fetch(`${origin}/v1/alerts`, { headers: { origin: "https://example.test" } })).status
      ).toBe(403);
      // Native HTTP preserves the Host header; fetch may replace it with the URL host.
      const invalidHostStatus = await new Promise<number | undefined>((resolve, reject) => {
        const req = httpRequest(
          `${origin}/v1/alerts`,
          { headers: { host: "localhost.example.test" } },
          (res) => {
            res.resume();
            resolve(res.statusCode);
          }
        );
        req.on("error", reject);
        req.end();
      });
      expect(invalidHostStatus).toBe(403);
      expect(
        (await fetch(`${origin}/v1/alerts`, { method: "POST", body: "invalid JSON" })).status
      ).toBe(400);
      expect(
        (await fetch(`${origin}/v1/alerts`, { method: "POST", body: "x".repeat(65537) })).status
      ).toBe(400);
      expect((await fetch(`${origin}/dashboard`)).status).toBe(418);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });

  it("can create records after deleting every existing record", () => {
    const api = createDevMockApi();
    for (const id of ["alert_0", "alert_1", "alert_2"]) api.handle("DELETE", `/v1/alerts/${id}`);
    expect(
      api.handle("POST", "/v1/alerts", {
        project_id: "proj_123",
        config: { to: "demo@example.test" }
      }).body
    ).toHaveProperty("alert.channel", "email");
  });

  it("serves schema-valid synthetic incident artifacts", () => {
    const api = createDevMockApi();
    const bundle = BundleV1Schema.parse(api.handle("GET", "/v1/incidents/inc_normal/bundle").body);
    expect(bundle.project.id).toBe("proj_123");
    expect(bundle.verification.synthetic).toBe(true);
    expect(api.handle("GET", "/v1/incidents/inc_normal/reproduction").body).toMatchObject({
      possible: false
    });
    const improvement = BundleV1Schema.parse(
      api.handle("GET", "/v1/projects/proj_123/improvements/imp_0/bundle").body
    );
    expect(improvement.bundle_type).toBe("improvement");
    expect(api.handle("GET", "/v1/projects/proj_new/improvements/imp_0/bundle").status).toBe(404);
  });
});
