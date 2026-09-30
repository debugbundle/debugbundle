import { describe, expect, it } from "vitest";

import { buildPublicOpenApiSpec } from "../../../apps/api/src/openapi.ts";

describe("api openapi spec", () => {
  it("documents the gated server outbox route with its distinct writer credential", () => {
    const document = buildPublicOpenApiSpec() as {
      paths: Record<
        string,
        Record<string, { operationId?: string; security?: unknown; responses?: unknown }>
      >;
    };
    const delivery = document.paths["/v1/analytics/deliver"]?.["post"];
    expect(delivery?.operationId).toBe("deliverSemanticAnalyticsOutbox");
    expect(delivery?.security).toEqual([{ analyticsWriterBearerToken: [] }]);
    expect(delivery?.responses).toHaveProperty("429");
    expect(delivery?.responses).toHaveProperty("503");
    const relay = document.paths["/v1/analytics/relay/events"]?.["post"];
    expect(relay?.operationId).toBe("deliverSemanticAnalyticsRelayEvents");
    expect(relay?.security).toEqual([{ analyticsWriterBearerToken: [] }]);
    expect(relay?.responses).toHaveProperty("429");
    expect(relay?.responses).toHaveProperty("503");
  });

  it("documents the disabled first-party relay identity lifecycle", () => {
    const document = buildPublicOpenApiSpec() as {
      paths: Record<
        string,
        Record<string, { operationId?: string; security?: unknown; responses?: unknown }>
      >;
    };
    for (const [path, operationId] of [
      ["/v1/analytics/identity/contexts", "createSemanticAnalyticsIdentityContext"],
      [
        "/v1/analytics/identity/contexts/{id}/associate",
        "associateSemanticAnalyticsIdentityContext"
      ],
      ["/v1/analytics/identity/contexts/revoke", "revokeSemanticAnalyticsIdentityContext"]
    ] as const) {
      const operation = document.paths[path]?.["post"];
      expect(operation?.operationId).toBe(operationId);
      expect(operation?.security).toEqual([{ analyticsWriterBearerToken: [] }]);
      expect(operation?.responses).toHaveProperty("503");
    }
    const erasure = document.paths["/v1/analytics/identity/erasures"]?.["post"];
    expect(erasure?.operationId).toBe("requestSemanticAnalyticsSubjectErasure");
    expect(erasure?.security).toEqual([{ analyticsWriterBearerToken: [] }]);
    expect(erasure?.responses).toHaveProperty("202");
    expect(erasure?.responses).toHaveProperty("503");
  });

  it("documents disabled owner namespace management without a key", () => {
    const document = buildPublicOpenApiSpec() as {
      paths: Record<
        string,
        Record<string, { operationId?: string; security?: unknown; responses?: unknown }>
      >;
    };
    for (const [method, path, operationId] of [
      ["get", "/v1/projects/{id}/analytics/identity-namespace", "getAnalyticsIdentityNamespace"],
      [
        "post",
        "/v1/projects/{id}/analytics/identity-namespace/preview",
        "previewAnalyticsIdentityNamespace"
      ],
      [
        "post",
        "/v1/projects/{id}/analytics/identity-namespace/apply",
        "applyAnalyticsIdentityNamespace"
      ]
    ] as const) {
      const operation = document.paths[path]?.[method];
      expect(operation?.operationId).toBe(operationId);
      expect(operation?.security).toEqual([{ browserSession: [] }, { memberBearerToken: [] }]);
      expect(operation?.responses).toHaveProperty("503");
    }
  });

  it("documents semantic space, writer and project-plan management with member authentication", () => {
    const document = buildPublicOpenApiSpec() as {
      paths: Record<
        string,
        Record<string, { operationId?: string; security?: unknown; requestBody?: unknown }>
      >;
    };
    const expected = [
      ["get", "/v1/analytics/spaces", "listAnalyticsSpaces"],
      ["get", "/v1/analytics/spaces/{id}", "getAnalyticsSpace"],
      ["post", "/v1/analytics/spaces/preview", "previewAnalyticsSpaceCreate"],
      ["post", "/v1/analytics/spaces/apply", "applyAnalyticsSpaceCreate"],
      ["post", "/v1/analytics/spaces/{id}/preview", "previewAnalyticsSpaceChange"],
      ["post", "/v1/analytics/spaces/{id}/apply", "applyAnalyticsSpaceChange"],
      ["get", "/v1/projects/{id}/analytics/writers", "listAnalyticsWriters"],
      ["post", "/v1/projects/{id}/analytics/writers/preview", "previewAnalyticsWriter"],
      ["post", "/v1/projects/{id}/analytics/writers/apply", "applyAnalyticsWriter"],
      ["get", "/v1/projects/{id}/analytics/plan", "getAnalyticsProjectPlan"],
      ["post", "/v1/projects/{id}/analytics/plan/validate", "validateAnalyticsProjectPlan"],
      ["post", "/v1/projects/{id}/analytics/plan/preview", "previewAnalyticsProjectPlan"],
      ["post", "/v1/projects/{id}/analytics/plan/apply", "applyAnalyticsProjectPlan"],
      ["get", "/v1/analytics/spaces/{id}/plan", "getAnalyticsSpacePlan"],
      ["post", "/v1/analytics/spaces/{id}/plan/validate", "validateAnalyticsSpacePlan"],
      ["post", "/v1/analytics/spaces/{id}/plan/preview", "previewAnalyticsSpacePlan"],
      ["post", "/v1/analytics/spaces/{id}/plan/apply", "applyAnalyticsSpacePlan"],
      [
        "post",
        "/v1/projects/{id}/analytics/events/{eventId}/retry",
        "retryFailedSemanticAnalyticsEvent"
      ]
    ] as const;
    for (const [method, path, operationId] of expected) {
      const operation = document.paths[path]?.[method];
      expect(operation?.operationId).toBe(operationId);
      expect(operation?.security).toEqual([{ browserSession: [] }, { memberBearerToken: [] }]);
      if (method === "post" && operationId !== "retryFailedSemanticAnalyticsEvent")
        expect(operation?.requestBody).toBeDefined();
    }
    expect(
      document.paths["/v1/projects/{id}/analytics/events/{eventId}/retry"]?.["post"]?.requestBody
    ).toBeUndefined();
  });

  it("documents only the five agent reads with distinct agent authentication", () => {
    const document = buildPublicOpenApiSpec() as {
      paths: Record<string, Record<string, { security?: unknown; responses?: unknown }>>;
      components: { securitySchemes: Record<string, unknown> };
    };
    const paths = Object.entries(document.paths).filter(([path]) => path.startsWith("/v1/agent/"));
    expect(paths).toHaveLength(5);
    for (const [, operations] of paths) {
      expect(Object.keys(operations)).toEqual(["get"]);
      expect(operations["get"]?.security).toEqual([{ agentBearerToken: [] }]);
    }
    expect(document.components.securitySchemes).toHaveProperty("agentBearerToken");
    expect(document.paths["/v1/projects/{id}/agent-tokens"]?.["post"]?.security).toEqual([
      { browserSession: [] },
      { memberBearerToken: [] }
    ]);
    expect(document.paths["/v1/projects/{id}/agent-tokens/{tokenId}/revoke"]).toHaveProperty(
      "post"
    );
  });

  it("publishes github bootstrap routes and browser-session security directly from source", () => {
    const document = buildPublicOpenApiSpec() as {
      openapi?: string;
      paths?: Record<
        string,
        Record<
          string,
          {
            operationId?: string;
            security?: unknown;
            responses?: Record<string, unknown>;
            parameters?: Array<{ name?: string; in?: string; schema?: { pattern?: string } }>;
            requestBody?: { content?: { "application/json"?: { schema?: { $ref?: string } } } };
          }
        >
      >;
      components?: {
        securitySchemes?: Record<
          string,
          { type?: string; scheme?: string; in?: string; name?: string }
        >;
      };
    };

    expect(document.openapi).toBe("3.1.0");
    expect(document.components?.securitySchemes).toMatchObject({
      browserSession: { type: "apiKey", in: "cookie", name: "dbundle_session" },
      memberBearerToken: { type: "http", scheme: "bearer" },
      projectBearerToken: { type: "http", scheme: "bearer" }
    });
    expect(document.paths?.["/v1/auth/github/device/start"]?.["post"]?.operationId).toBe(
      "startGithubDeviceLogin"
    );
    expect(document.paths?.["/v1/auth/github/device/poll"]?.["post"]?.operationId).toBe(
      "pollGithubDeviceLogin"
    );
    expect(document.paths?.["/v1/auth/github/device/claim"]?.["post"]?.operationId).toBe(
      "claimGithubDeviceLogin"
    );
    expect(document.paths?.["/v1/auth/github/token/exchange"]?.["post"]?.operationId).toBe(
      "exchangeGithubAccessToken"
    );
    expect(document.paths?.["/v1/auth/logout"]?.["post"]?.security).toEqual([
      { browserSession: [] }
    ]);
    expect(document.paths?.["/v1/auth/github/start"]?.["get"]?.responses).toHaveProperty("302");
    expect(document.paths?.["/v1/projects/{id}/tokens"]?.["get"]?.responses).toHaveProperty("200");
    expect(document.paths?.["/v1/projects/{id}/availability-checks"]?.["get"]?.operationId).toBe(
      "listAvailabilityChecks"
    );
    expect(
      document.paths?.["/v1/projects/{id}/availability-checks/{checkId}"]?.["patch"]?.operationId
    ).toBe("updateAvailabilityCheck");
    expect(
      document.paths?.["/v1/projects/{id}/availability-checks/test"]?.["post"]?.responses
    ).toHaveProperty("200");
    expect(document.paths?.["/v1/analytics/bundles"]?.["get"]?.operationId).toBe(
      "listAnalyticsBundles"
    );
    expect(document.paths?.["/v1/analytics/bundles"]?.["post"]?.operationId).toBe(
      "generateAnalyticsBundle"
    );
    expect(document.paths?.["/v1/analytics/bundles/{id}"]?.["get"]?.operationId).toBe(
      "getAnalyticsBundle"
    );
    expect(document.paths?.["/v1/analytics/journey-samples"]?.["get"]?.operationId).toBe(
      "listAnalyticsJourneySamples"
    );
    expect(document.paths?.["/v1/analytics/journey-samples/{id}"]?.["get"]?.operationId).toBe(
      "getAnalyticsJourneySample"
    );
    expect(document.paths?.["/v1/analytics/incidents/{id}/impact"]?.["get"]?.operationId).toBe(
      "getAnalyticsIncidentImpact"
    );
    expect(
      document.paths?.["/v1/projects/{id}/analytics/saved-funnels"]?.["post"]?.operationId
    ).toBe("createSavedAnalyticsFunnel");
    expect(
      document.paths?.["/v1/projects/{id}/analytics/saved-funnels/{funnelKey}"]?.["delete"]
        ?.operationId
    ).toBe("archiveSavedAnalyticsFunnel");
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
    expect(
      document.paths?.["/v1/analytics/summary"]?.["get"]?.parameters?.find(
        (parameter) => parameter.name === "route"
      )?.schema?.pattern
    ).toBe("^[^?#]+$");
    const availabilityCheckResponseSchema = (
      document as {
        components?: {
          schemas?: Record<
            string,
            { properties?: Record<string, { properties?: Record<string, unknown> }> }
          >;
        };
      }
    ).components?.schemas?.["AvailabilityCheckResponse"];
    expect(availabilityCheckResponseSchema?.properties?.["check"]?.properties).toHaveProperty(
      "linked_incident_status"
    );
    const analyticsBundleCreateSchema = (
      document as {
        components?: { schemas?: Record<string, { properties?: Record<string, unknown> }> };
      }
    ).components?.schemas?.["AnalyticsBundleCreate"];
    expect(analyticsBundleCreateSchema?.properties).toHaveProperty("opportunity_id");
    expect(
      (
        analyticsBundleCreateSchema?.properties?.["route"] as
          | { anyOf?: Array<{ pattern?: string }> }
          | undefined
      )?.anyOf?.[0]?.pattern
    ).toBe("^[^?#]+$");
  });
});
