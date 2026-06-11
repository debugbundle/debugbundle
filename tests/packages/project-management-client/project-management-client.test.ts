import { describe, expect, it, vi } from "vitest";

import { createProjectManagementApi, ProjectManagementApiError, type HttpClient } from "../../../packages/project-management-client/src/index.js";

function projectFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    project_id: "proj_1",
    organization_id: "org_1",
    owner_user_id: "user_1",
    owner_email: "owner@example.com",
    relationship: "owned",
    sharing_state: "private",
    effective_role: "owner",
    name: "Checkout",
    slug: "checkout",
    environment_default: "production",
    organization_plan: "free",
    metrics: {
      open_incidents: 0,
      regressed_incidents: 0,
      opened_incidents_today: 0,
      opened_incidents_month: 1,
      monthly_bundle_requests: 1,
      monthly_raw_ingested_events: 2,
      retained_bundles: 3,
      monthly_alert_deliveries: 4
    },
    created_at: "2026-03-21T00:00:00.000Z",
    updated_at: "2026-03-21T00:00:00.000Z",
    ...overrides
  };
}

function deletedProjectFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const project = projectFixture({ project_id: "proj_2", ...overrides });
  delete project["metrics"];
  return project;
}

describe("project-management api client", () => {
  it("calls the project list route with an optional query", async () => {
    const request = vi.fn<HttpClient["request"]>().mockResolvedValue({
      status: 200,
      body: {
        projects: [projectFixture()]
      }
    });

    const api = createProjectManagementApi({ request });
    const projects = await api.listProjects({ bearerToken: "dbundle_mem_x", limit: 25 });

    expect(projects).toHaveLength(1);
    expect(request).toHaveBeenCalledWith({
      method: "GET",
      path: "/v1/projects?limit=25",
      bearerToken: "dbundle_mem_x"
    });
  });

  it("accepts additive fields in successful project payloads", async () => {
    const request = vi.fn<HttpClient["request"]>()
      .mockResolvedValueOnce({
        status: 200,
        body: {
          projects: [
            projectFixture({
              shared_access_suspended: false,
              additive_field: "future-compatible"
            })
          ],
          response_metadata: {
            version: 2
          }
        }
      })
      .mockResolvedValueOnce({
        status: 201,
        body: {
          project: projectFixture({
            shared_access_suspended: false,
            additive_field: "future-compatible"
          }),
          response_metadata: {
            version: 2
          }
        }
      })
      .mockResolvedValueOnce({
        status: 200,
        body: {
          project: deletedProjectFixture({
            shared_access_suspended: false,
            additive_field: "future-compatible"
          }),
          response_metadata: {
            version: 2
          }
        }
      });

    const api = createProjectManagementApi({ request });

    await expect(api.listProjects({ bearerToken: "dbundle_mem_x" })).resolves.toHaveLength(1);
    await expect(
      api.createProject({
        bearerToken: "dbundle_mem_x",
        name: "Checkout",
        slug: "checkout"
      })
    ).resolves.toMatchObject({ project_id: "proj_1" });
    await expect(api.deleteProject({ bearerToken: "dbundle_mem_x", projectId: "proj_2" })).resolves.toMatchObject({
      project_id: "proj_2"
    });
  });

  it("creates projects through the project route", async () => {
    const request = vi.fn<HttpClient["request"]>().mockResolvedValue({
      status: 201,
      body: {
        project: projectFixture({
          project_id: "proj_2",
          metrics: {
            open_incidents: 0,
            regressed_incidents: 0,
            opened_incidents_today: 0,
            opened_incidents_month: 0,
            monthly_bundle_requests: 0,
            monthly_raw_ingested_events: 0,
            retained_bundles: 0,
            monthly_alert_deliveries: 0
          }
        })
      }
    });

    const api = createProjectManagementApi({ request });
    const project = await api.createProject({
      bearerToken: "dbundle_mem_x",
      name: "Checkout",
      slug: "checkout",
      environmentDefault: "production"
    });

    expect(project.project_id).toBe("proj_2");
    expect(request).toHaveBeenCalledWith({
      method: "POST",
      path: "/v1/projects",
      bearerToken: "dbundle_mem_x",
      body: {
        name: "Checkout",
        slug: "checkout",
        environment_default: "production"
      }
    });
  });

  it("throws structured api errors", async () => {
    const request = vi.fn<HttpClient["request"]>().mockResolvedValue({
      status: 409,
      body: {
        error: "project_slug_taken"
      }
    });

    const api = createProjectManagementApi({ request });

    await expect(api.createProject({ bearerToken: "dbundle_mem_x", name: "Checkout", slug: "checkout" })).rejects.toEqual(
      new ProjectManagementApiError(409, "project_slug_taken")
    );
  });

  it("throws invalid_response_shape when a success payload is malformed", async () => {
    const request = vi.fn<HttpClient["request"]>().mockResolvedValue({
      status: 200,
      body: {
        projects: [{ not_a_project: true }]
      }
    });

    const api = createProjectManagementApi({ request });

    await expect(api.listProjects({ bearerToken: "dbundle_mem_x" })).rejects.toEqual(
      new ProjectManagementApiError(200, "invalid_response_shape")
    );
  });

  it("deletes projects through the project route", async () => {
    const request = vi.fn<HttpClient["request"]>().mockResolvedValue({
      status: 200,
      body: {
        project: deletedProjectFixture()
      }
    });

    const api = createProjectManagementApi({ request });
    const project = await api.deleteProject({
      bearerToken: "dbundle_mem_x",
      projectId: "proj_2"
    });

    expect(project.project_id).toBe("proj_2");
    expect(request).toHaveBeenCalledWith({
      method: "DELETE",
      path: "/v1/projects/proj_2",
      bearerToken: "dbundle_mem_x"
    });
  });
});
