import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProject } from "../../../apps/web/src/lib/api.js";
import { getIncident, getIncidentBundle } from "../../../apps/web/src/lib/api-artifacts.js";
import { observeWebActivationStep } from "../../../apps/web/src/lib/dogfooding-flows.js";
import {
  createProject as projectFixture,
  createIncident,
  jsonResponse
} from "./web-test-helpers.js";

vi.mock("../../../apps/web/src/lib/dogfooding-flows.js", () => ({
  observeWebActivationStep: vi.fn().mockResolvedValue(undefined)
}));
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("successful application flow observations", () => {
  const create = () =>
    createProject({ name: "Example", slug: "example", environment_default: "production" });
  it("observes project creation only after the server accepts it", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { error: "forbidden" }));
    await expect(create()).rejects.toThrow();
    expect(observeWebActivationStep).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { project: projectFixture() }));
    await create();
    expect(observeWebActivationStep).toHaveBeenCalledWith("project_created");
  });
  it("observes an incident only after an authorized successful read", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(404, { error: "not_found" }));
    await expect(getIncident("missing")).rejects.toThrow();
    expect(observeWebActivationStep).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { incident: createIncident() }));
    await getIncident("present");
    expect(observeWebActivationStep).toHaveBeenCalledWith("incident_opened");
  });
  it("excludes pending, failed and rejected bundle reads", async () => {
    for (const status of ["pending", "failed"]) {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { status }));
      expect(await getIncidentBundle("incident")).toEqual({ status });
    }
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { error: "forbidden" }));
    await expect(getIncidentBundle("incident")).rejects.toThrow();
    expect(observeWebActivationStep).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { bundle_id: "bundle" }));
    await getIncidentBundle("incident");
    expect(observeWebActivationStep).toHaveBeenCalledExactlyOnceWith("bundle_retrieved");
  });
});
