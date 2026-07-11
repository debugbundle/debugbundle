import { describe, expect, it } from "vitest";

import { buildPublicOpenApiSpec } from "../../../apps/api/src/openapi.ts";

describe("api openapi spec", () => {
  it("publishes github bootstrap routes and browser-session security directly from source", () => {
    const document = buildPublicOpenApiSpec() as {
      openapi?: string;
      paths?: Record<string, Record<string, {
        operationId?: string;
        security?: unknown;
        responses?: Record<string, unknown>;
        parameters?: Array<{ name?: string; in?: string }>;
      }>>;
      components?: {
        securitySchemes?: Record<string, { type?: string; scheme?: string; in?: string; name?: string }>;
      };
    };

    expect(document.openapi).toBe("3.1.0");
    expect(document.components?.securitySchemes).toMatchObject({
      browserSession: { type: "apiKey", in: "cookie", name: "dbundle_session" },
      memberBearerToken: { type: "http", scheme: "bearer" },
      projectBearerToken: { type: "http", scheme: "bearer" }
    });
    expect(document.paths?.["/v1/auth/github/device/start"]?.["post"]?.operationId).toBe("startGithubDeviceLogin");
    expect(document.paths?.["/v1/auth/github/device/poll"]?.["post"]?.operationId).toBe("pollGithubDeviceLogin");
    expect(document.paths?.["/v1/auth/github/device/claim"]?.["post"]?.operationId).toBe("claimGithubDeviceLogin");
    expect(document.paths?.["/v1/auth/github/token/exchange"]?.["post"]?.operationId).toBe("exchangeGithubAccessToken");
    expect(document.paths?.["/v1/auth/logout"]?.["post"]?.security).toEqual([{ browserSession: [] }]);
    expect(document.paths?.["/v1/auth/github/start"]?.["get"]?.responses).toHaveProperty("302");
    expect(document.paths?.["/v1/projects/{id}/tokens"]?.["get"]?.responses).toHaveProperty("200");
    expect(document.paths?.["/v1/projects/{id}/availability-checks"]?.["get"]?.operationId).toBe("listAvailabilityChecks");
    expect(document.paths?.["/v1/projects/{id}/availability-checks/{checkId}"]?.["patch"]?.operationId).toBe("updateAvailabilityCheck");
    expect(document.paths?.["/v1/projects/{id}/availability-checks/test"]?.["post"]?.responses).toHaveProperty("200");
    expect(document.paths?.["/v1/analytics/bundles"]?.["get"]?.operationId).toBe("listAnalyticsBundles");
    expect(
      document.paths?.["/v1/analytics/opportunities"]?.["get"]?.parameters?.map(
        (parameter) => parameter.name
      )
    ).toEqual([
      "project_id",
      "status",
      "kind",
      "service",
      "environment",
      "severity",
      "bundle_status",
      "from",
      "to",
      "cursor",
      "limit"
    ]);
    expect(
      document.paths?.["/v1/analytics/bundles"]?.["get"]?.parameters?.map(
        (parameter) => parameter.name
      )
    ).toEqual([
      "project_id",
      "status",
      "kind",
      "service",
      "environment",
      "from",
      "to",
      "cursor",
      "limit"
    ]);
    const availabilityCheckResponseSchema = (document as {
      components?: {
        schemas?: Record<string, { properties?: Record<string, { properties?: Record<string, unknown> }> }>;
      };
    }).components?.schemas?.["AvailabilityCheckResponse"];
    expect(availabilityCheckResponseSchema?.properties?.["check"]?.properties).toHaveProperty("linked_incident_status");
  });
});
