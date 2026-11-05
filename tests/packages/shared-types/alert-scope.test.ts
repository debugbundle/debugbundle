import { describe, expect, it } from "vitest";
import { AlertScopeSchema } from "../../../packages/shared-types/src/alert-scope.js";

const origin = "00000000-0000-4000-8000-000000000001";
const service = { service_definition_id: "00000000-0000-4000-8000-000000000002", name: "App" };
const scope = {
  origin_project_ids: [origin],
  covers_current_project: false,
  services: [service],
  service_count: 1,
  service_filter: null
};

describe("bounded alert scope metadata", () => {
  it("preserves existing SDK names and environments without a new length restriction", () => {
    const name = "service-".repeat(100),
      environment = "environment-".repeat(100);
    const parsed = AlertScopeSchema.parse({
      ...scope,
      services: [{ ...service, name }],
      service_filter: { ...service, name, service_id: origin, environment }
    });
    expect(parsed.services[0]?.name).toBe(name);
    expect(parsed.service_filter?.environment).toBe(environment);
  });
  it("separates the allowed logical services from the selected environment", () => {
    expect(
      AlertScopeSchema.parse({
        ...scope,
        service_filter: {
          ...service,
          service_id: "00000000-0000-4000-8000-000000000003",
          environment: "production"
        }
      }).service_filter?.environment
    ).toBe("production");
  });
  it.each([
    { ...scope, token: "unexpected" },
    { ...scope, origin_project_ids: [] },
    { ...scope, origin_project_ids: ["not-an-origin-id"] },
    { ...scope, origin_project_ids: Array(1001).fill(origin) },
    { ...scope, services: [{ ...service, signing_secret: "unexpected" }] },
    { ...scope, services: Array(101).fill(service), service_count: 101 },
    { ...scope, service_count: 0 },
    { ...scope, service_count: -1 },
    { ...scope, services: [{ ...service, name: "" }] },
    { ...scope, service_filter: { ...service, service_id: origin, environment: "" } },
    {
      ...scope,
      service_filter: {
        ...service,
        service_id: origin,
        environment: "production",
        signing_secret: "unexpected"
      }
    }
  ])("rejects malformed, unbounded or sensitive metadata", (invalid) => {
    expect(AlertScopeSchema.safeParse(invalid).success).toBe(false);
  });
  it("allows an explicitly counted truncated list and an empty observed scope", () => {
    expect(AlertScopeSchema.parse({ ...scope, service_count: 200 }).service_count).toBe(200);
    expect(AlertScopeSchema.parse({ ...scope, services: [], service_count: 0 }).services).toEqual(
      []
    );
  });
});
