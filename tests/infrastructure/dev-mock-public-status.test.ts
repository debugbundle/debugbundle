import { once } from "node:events";
import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createDevMockApi } from "../../scripts/dev-mock/api.js";
import { createDevMockFixtures } from "../../scripts/dev-mock/fixtures.js";
import { createPublicStatusMocks } from "../../scripts/dev-mock/public-status.js";
import { createDevMockMiddleware } from "../../apps/web/dev-mock-plugin.js";
import {
  PublicStatusManagementSchema,
  PublicStatusOptionsSchema,
  PublicStatusPageSchema,
  type PublicStatusSettings
} from "../../packages/shared-types/src/public-status.js";

function fixture() {
  const api = createDevMockApi();
  const { projects } = api.handle("GET", "/v1/projects").body as {
    projects: Array<{ project_id: string; name: string }>;
  };
  const anchor = projects[0]!;
  const { checks } = api.handle("GET", `/v1/projects/${anchor.project_id}/availability-checks`)
    .body as { checks: Array<{ check_id: string; name: string }> };
  const path = `/v1/projects/${anchor.project_id}/status-page`;
  const settings: PublicStatusSettings = {
    title: "Our services",
    enabled: true,
    projects: [{ project_id: anchor.project_id, check_ids: [checks[1]!.check_id] }]
  };
  return { api, projects, anchor, checks, path, settings };
}

describe("local public status preview", () => {
  it("revalidates ownership, limits collaborator reads and sanitizes display text", () => {
    const data = createDevMockFixtures();
    const status = createPublicStatusMocks(data, () => true);
    const anchorId = String(data.projects[0]!["project_id"]);
    const path = `/v1/projects/${anchorId}/status-page`;
    const secret = "dbundle_mem_" + "a".repeat(48);
    const settings = {
      title: `token=${secret}`,
      enabled: true,
      projects: [{ project_id: anchorId, check_ids: [data.checks[1]!["check_id"]] }]
    };
    const call = (method: string, route: string, body?: unknown) =>
      status.handle(method, route, new URLSearchParams(), body, "http://localhost:5291")!;
    const saved = PublicStatusManagementSchema.parse(call("PUT", path, settings).body);
    const publicPath = `/v1/public/status/${saved.public_id}`;
    expect(JSON.stringify(saved)).not.toContain(secret);
    data.checks[1]!["name"] = `api_key=${secret}`;
    expect(JSON.stringify(call("GET", publicPath).body)).not.toContain(secret);
    data.session.user_id = "usr_collaborator";
    const collaborator = PublicStatusManagementSchema.parse(call("GET", path).body);
    expect(collaborator.access_mode).toBe("preview");
    expect(collaborator.settings.projects[0]!.check_ids).toEqual([]);
    expect(collaborator.public_url).toBe(saved.public_url);
    expect(call("PUT", path, settings).status).toBe(403);
    expect(call("GET", `${path}/options`).status).toBe(403);
    expect(call("GET", `${path}/preview`).status).toBe(403);
    data.session.user_id = "usr_123";
    expect(call("PUT", path, { ...settings, enabled: false }).status).toBe(200);
    data.session.user_id = "usr_collaborator";
    expect(PublicStatusManagementSchema.parse(call("GET", path).body).public_url).toBeNull();
    data.session.user_id = "usr_123";
    expect(call("PUT", path, settings).status).toBe(200);
    data.projects[0]!["owner_user_id"] = "usr_new_owner";
    expect(call("GET", publicPath).status).toBe(404);
  });

  it("rejects foreign selections and invalid cursors without altering a saved page", () => {
    const data = createDevMockFixtures();
    const status = createPublicStatusMocks(data, () => true);
    const anchorId = String(data.projects[0]!["project_id"]);
    const foreignId = String(data.projects[1]!["project_id"]);
    data.projects[1]!["owner_user_id"] = "usr_foreign";
    const path = `/v1/projects/${anchorId}/status-page`;
    const settings = {
      title: "Status",
      enabled: true,
      projects: [{ project_id: anchorId, check_ids: [data.checks[1]!["check_id"]] }]
    };
    const call = (method: string, route: string, body?: unknown, query = new URLSearchParams()) =>
      status.handle(method, route, query, body, "http://localhost:5291")!;
    const saved = call("PUT", path, settings).body;
    expect(
      call("PUT", path, {
        ...settings,
        projects: [...settings.projects, { project_id: foreignId, check_ids: [] }]
      }).status
    ).toBe(400);
    expect(call("GET", path).body).toEqual(saved);
    const options = PublicStatusOptionsSchema.parse(call("GET", `${path}/options`).body);
    expect(options.projects.some((p) => p.project_id === foreignId)).toBe(false);
    expect(
      call(
        "GET",
        `${path}/options`,
        undefined,
        new URLSearchParams({ check_project_id: foreignId })
      ).status
    ).toBe(400);
    expect(call("POST", path, settings).status).toBe(405);
    expect(
      call("GET", `/v1/projects/00000000-0000-4000-8000-999999999999/status-page`).status
    ).toBe(404);
  });

  it("loads schema-valid private defaults and choices without allocating a public page", () => {
    const { api, path, anchor, projects } = fixture();
    const response = api.handle("GET", path);
    expect(response.status).toBe(200);
    expect(PublicStatusManagementSchema.parse(response.body)).toMatchObject({
      settings: {
        enabled: false,
        projects: [{ project_id: anchor.project_id, check_ids: [] }]
      },
      public_id: null,
      public_url: null,
      access_mode: "manage"
    });
    const options = PublicStatusOptionsSchema.parse(api.handle("GET", `${path}/options`).body);
    expect(options.projects).toHaveLength(3);
    projects.forEach((project) =>
      expect(z.string().uuid().safeParse(project.project_id).success).toBe(true)
    );
    expect(api.handle("GET", `${path}/preview`).status).toBe(404);
  });

  it("publishes selected projects, previews and unpublishes with a stable local URL", () => {
    const { api, projects, path, settings } = fixture();
    const options = PublicStatusOptionsSchema.parse(api.handle("GET", `${path}/options`).body);
    const unknown = options.projects.find((p) => p.project_id === projects[1]!.project_id)!;
    const down = options.projects.find((p) => p.project_id === projects[2]!.project_id)!;
    settings.projects.push(
      { project_id: down.project_id, check_ids: [down.checks[0]!.check_id] },
      { project_id: unknown.project_id, check_ids: [unknown.checks[0]!.check_id] }
    );
    const saved = PublicStatusManagementSchema.parse(api.handle("PUT", path, settings).body);
    expect(saved.public_url).toBe(`http://localhost:5291/status/${saved.public_id}`);
    const publicPath = `/v1/public/status/${saved.public_id}`;
    const publicResponse = api.handle("GET", publicPath);
    const page = PublicStatusPageSchema.parse(publicResponse.body);
    expect(publicResponse.headers).toMatchObject({ "cache-control": "no-store" });
    expect(page.title).toBe(settings.title);
    expect(page.projects.map((p) => p.current_state)).toEqual(["operational", "down", "unknown"]);
    expect(page.projects.map((p) => p.name)).toEqual([
      "SayCheese",
      "Healthbrain Patients",
      "TaskTime App"
    ]);
    expect(page.projects[2]!.uptime_percentage).toBeNull();
    expect(page.projects[0]!.checks).toHaveLength(1);
    expect(api.handle("GET", `${path}/preview`).body).toEqual(page);
    const serialized = JSON.stringify(page);
    for (const privateValue of [
      "check_id",
      "project_id",
      "incident_ids",
      "url",
      "environment",
      "organization",
      "http_status",
      "inc_down",
      "health.example.test"
    ])
      expect(serialized).not.toContain(privateValue);
    const disabled = PublicStatusManagementSchema.parse(
      api.handle("PUT", path, { ...settings, enabled: false }).body
    );
    expect(disabled.public_url).toBe(saved.public_url);
    expect(api.handle("GET", publicPath).status).toBe(404);
    expect(api.handle("GET", `${path}/preview`).status).toBe(200);
    expect(
      PublicStatusManagementSchema.parse(api.handle("PUT", path, settings).body).public_id
    ).toBe(saved.public_id);
    expect(
      PublicStatusManagementSchema.parse(createDevMockApi().handle("GET", path).body).public_id
    ).toBeNull();
  });

  it("rejects invalid selections atomically without weakening production schemas", () => {
    const { api, path, settings, projects } = fixture();
    const saved = api.handle("PUT", path, settings).body;
    const invalid = [
      { ...settings, title: " " },
      { ...settings, extra: "private" },
      { ...settings, projects: [{ project_id: "proj_123", check_ids: [] }] },
      {
        ...settings,
        projects: [
          { project_id: projects[1]!.project_id, check_ids: settings.projects[0]!.check_ids }
        ]
      },
      { ...settings, projects: [{ project_id: projects[0]!.project_id, check_ids: [] }] },
      { ...settings, projects: [...settings.projects, ...settings.projects] },
      {
        ...settings,
        projects: [
          {
            ...settings.projects[0]!,
            check_ids: [...settings.projects[0]!.check_ids, ...settings.projects[0]!.check_ids]
          }
        ]
      }
    ];
    for (const input of invalid) {
      expect(api.handle("PUT", path, input).status).toBe(400);
      expect(api.handle("GET", path).body).toEqual(saved);
    }
    expect(
      api.handle("GET", `${path}/options?check_cursor=${settings.projects[0]!.check_ids[0]}`).status
    ).toBe(400);
    expect(api.handle("GET", `${path}/options?cursor=bad`).status).toBe(400);
    expect(api.handle("GET", "/v1/public/status/bad").status).toBe(404);
    expect(api.handle("PUT", "/v1/public/status/000000000000000000000001", settings).status).toBe(
      405
    );
  });

  it("reflects existing health edits, keeps new checks private and removes deleted references", () => {
    const { api, path, settings, anchor } = fixture();
    const saved = PublicStatusManagementSchema.parse(api.handle("PUT", path, settings).body);
    const publicPath = `/v1/public/status/${saved.public_id}`;
    const checkPath = `/v1/projects/${anchor.project_id}/availability-checks`;
    const created = api.handle("POST", checkPath, {
      name: "New service",
      url: "https://new.example.test/ready"
    }).body as { check: { check_id: string } };
    expect(z.string().uuid().safeParse(created.check.check_id).success).toBe(true);
    const options = PublicStatusOptionsSchema.parse(api.handle("GET", `${path}/options`).body);
    expect(options.projects[0]!.checks.map((c) => c.name)).toContain("New service");
    expect(
      PublicStatusPageSchema.parse(api.handle("GET", publicPath).body).projects[0]!.checks
    ).toHaveLength(1);
    const selectedPath = `${checkPath}/${settings.projects[0]!.check_ids[0]}`;
    api.handle("PATCH", selectedPath, { name: "Renamed service", enabled: false });
    expect(
      PublicStatusPageSchema.parse(api.handle("GET", publicPath).body).projects[0]!.checks[0]
    ).toMatchObject({ name: "Renamed service", current_state: "paused" });
    api.handle("DELETE", selectedPath);
    expect(PublicStatusPageSchema.parse(api.handle("GET", publicPath).body).projects).toEqual([]);
    expect(
      PublicStatusManagementSchema.parse(api.handle("GET", path).body).settings.projects[0]!
        .check_ids
    ).toEqual([]);
    api.handle("DELETE", `/v1/projects/${anchor.project_id}`);
    expect(api.handle("GET", publicPath).status).toBe(404);
  });

  it("paginates project and check choices and supports newly created projects", () => {
    const { api, path, settings } = fixture();
    let createdProject = "";
    for (let i = 0; i < 51; i++) {
      const result = api.handle("POST", "/v1/projects", {
        name: `Project ${i}`,
        slug: `project-${i}`
      }).body as { project: { project_id: string } };
      createdProject = result.project.project_id;
    }
    expect(z.string().uuid().safeParse(createdProject).success).toBe(true);
    const first = PublicStatusOptionsSchema.parse(api.handle("GET", `${path}/options`).body);
    expect(first.projects).toHaveLength(50);
    expect(first.next_cursor).not.toBeNull();
    const second = PublicStatusOptionsSchema.parse(
      api.handle("GET", `${path}/options?cursor=${first.next_cursor}`).body
    );
    expect(second.projects).toHaveLength(4);
    expect(new Set([...first.projects, ...second.projects].map((p) => p.project_id)).size).toBe(54);
    const newPath = `/v1/projects/${createdProject}/status-page`;
    for (let i = 0; i < 51; i++)
      api.handle("POST", `/v1/projects/${createdProject}/availability-checks`, {
        name: `Service ${i}`,
        url: "https://health.example.test/ready"
      });
    const newOptions = PublicStatusOptionsSchema.parse(
      api.handle("GET", `${newPath}/options?check_project_id=${createdProject}`).body
    );
    expect(newOptions.projects[0]!.checks).toHaveLength(50);
    expect(newOptions.projects[0]!.next_check_cursor).not.toBeNull();
    const rest = PublicStatusOptionsSchema.parse(
      api.handle(
        "GET",
        `${newPath}/options?check_project_id=${createdProject}&check_cursor=${newOptions.projects[0]!.next_check_cursor}`
      ).body
    );
    expect(rest.projects[0]!.checks).toHaveLength(1);
    expect(
      api.handle("PUT", newPath, {
        ...settings,
        projects: [
          { project_id: createdProject, check_ids: [rest.projects[0]!.checks[0]!.check_id] }
        ]
      }).status
    ).toBe(200);
  });

  it("serves the publication flow through local middleware and permits anonymous reads after logout", async () => {
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
    if (!address || typeof address === "string") throw new Error("Missing port");
    const origin = `http://127.0.0.1:${address.port}`;
    try {
      const { projects } = (await (await fetch(`${origin}/v1/projects`)).json()) as {
        projects: Array<{ project_id: string }>;
      };
      const path = `/v1/projects/${projects[0]!.project_id}/status-page`;
      const options = PublicStatusOptionsSchema.parse(
        await (await fetch(`${origin}${path}/options`)).json()
      );
      const saved = PublicStatusManagementSchema.parse(
        await (
          await fetch(`${origin}${path}`, {
            method: "PUT",
            headers: { origin, "content-type": "application/json" },
            body: JSON.stringify({
              title: "Demo status",
              enabled: true,
              projects: [
                {
                  project_id: projects[0]!.project_id,
                  check_ids: [options.projects[0]!.checks[0]!.check_id]
                }
              ]
            })
          })
        ).json()
      );
      expect(saved.public_url).toBe(`${origin}/status/${saved.public_id}`);
      await fetch(`${origin}/v1/auth/logout`, { method: "POST", headers: { origin } });
      const publicResponse = await fetch(`${origin}/v1/public/status/${saved.public_id}`);
      expect(publicResponse.status).toBe(200);
      PublicStatusPageSchema.parse(await publicResponse.json());
      expect((await fetch(`${origin}${path}`)).status).toBe(401);
      expect(
        (
          await fetch(`${origin}/v1/public/status/${saved.public_id}`, {
            headers: { origin: "https://foreign.example.test" }
          })
        ).status
      ).toBe(403);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
});
