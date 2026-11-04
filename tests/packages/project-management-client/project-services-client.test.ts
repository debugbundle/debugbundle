import { describe, expect, it, vi } from "vitest";
import { createProjectServicesApi } from "../../../packages/project-management-client/src/project-services.js";

const id = "10000000-0000-4000-8000-000000000001";
const record = {
  service_definition_id: id,
  project_id: id,
  origin_project_id: id,
  name: "api",
  input_name: "api",
  description: null,
  repository_url: null,
  repository_root: null,
  repository: null,
  environments: ["production"],
  created_at: "2026-11-03T00:00:00.000Z",
  updated_at: "2026-11-03T00:00:00.000Z"
};

describe("project service catalogue client", () => {
  it("preserves exact pagination, nullable metadata and returned logical identities", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ status: 200, body: { services: [record], next_cursor: id } })
      .mockResolvedValue({ status: 200, body: { service: record } });
    const api = createProjectServicesApi({ request });
    expect(
      await api.listServiceDefinitions({ bearerToken: "test", projectId: id, limit: 1, cursor: id })
    ).toEqual({ services: [record], next_cursor: id });
    expect(request.mock.calls[0]?.[0]).toMatchObject({
      method: "GET",
      path: `/v1/projects/${id}/service-definitions?limit=1&cursor=${id}`
    });
    expect(
      await api.updateServiceDefinition({
        bearerToken: "test",
        projectId: id,
        serviceDefinitionId: id,
        update: { repository_url: null, repository_root: null }
      })
    ).toEqual(record);
    expect(request.mock.calls[1]?.[0]).toMatchObject({
      method: "PATCH",
      body: { repository_url: null, repository_root: null }
    });
  });
  it("rejects malformed scope and repository paths before network dispatch", async () => {
    const request = vi.fn();
    const api = createProjectServicesApi({ request });
    await expect(
      api.listServiceDefinitions({ bearerToken: "test", projectId: "../other" })
    ).rejects.toThrow("invalid_service_request");
    await expect(
      api.createServiceDefinition({
        bearerToken: "test",
        projectId: id,
        service: { name: "api", repository_root: "../other" }
      })
    ).rejects.toThrow("invalid_service_request");
    expect(request).not.toHaveBeenCalled();
  });
  it("retains server conflict codes and fails closed on unreadable success responses", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ status: 409, body: { error: "service_name_conflict" } })
      .mockResolvedValueOnce({ status: 200, body: { service: {} } });
    const api = createProjectServicesApi({ request });
    await expect(
      api.getServiceDefinition({ bearerToken: "test", projectId: id, serviceDefinitionId: id })
    ).rejects.toThrow("service_name_conflict");
    await expect(
      api.getServiceDefinition({ bearerToken: "test", projectId: id, serviceDefinitionId: id })
    ).rejects.toThrow("invalid_response_shape");
  });
});
