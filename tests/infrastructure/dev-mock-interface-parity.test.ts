import { describe, expect, it } from "vitest";
import { createDevMockApi } from "../../scripts/dev-mock/api.js";
import {
  AnalyticsActionMetricsResponseSchema,
  AnalyticsJourneySamplesListResponseSchema,
  AnalyticsJourneySampleResponseSchema
} from "../../packages/shared-types/src/index.js";
import {
  IncidentContextSchema,
  LogsResponseSchema
} from "../../packages/retrieval-client/src/index.js";
import { AgentTokenSchema } from "../../packages/token-management/src/index.js";
import { AlertGroupListResponseSchema } from "../../packages/alert-client/src/index.js";
describe("opt-in parity preview fixtures", () => {
  it("serves contract-valid actions, retained samples and sample artifacts", () => {
    const api = createDevMockApi();
    expect(
      AnalyticsActionMetricsResponseSchema.parse(
        api.handle("GET", "/v1/projects/proj_123/analytics/actions?granularity=hour&last=24h").body
      ).window.granularity
    ).toBe("hour");
    const samples = AnalyticsJourneySamplesListResponseSchema.parse(
      api.handle("GET", "/v1/analytics/journey-samples?project_id=proj_123&limit=20").body
    ).samples;
    expect(samples).toHaveLength(1);
    AnalyticsJourneySampleResponseSchema.parse(
      api.handle(
        "GET",
        `/v1/analytics/journey-samples/${samples[0]!.sample_id}?project_id=proj_123`
      ).body
    );
    expect(
      api.handle("GET", "/v1/analytics/journey-samples?project_id=proj_new").body
    ).toMatchObject({ samples: [] });
  });
  it("provides bounded incident evidence and keeps issuance disabled", () => {
    const api = createDevMockApi();
    IncidentContextSchema.parse(api.handle("GET", "/v1/incidents/inc_long/context").body);
    LogsResponseSchema.parse(api.handle("GET", "/v1/logs?incident_id=inc_long&limit=20").body);
    const body = api.handle("GET", "/v1/projects/proj_123/agent-tokens").body as {
      tokens: unknown[];
    };
    const token = AgentTokenSchema.parse(body.tokens[0]);
    expect(token.plaintext).toBeUndefined();
    expect(
      api.handle("POST", "/v1/projects/proj_123/agent-tokens", { label: "Preview" }).status
    ).toBe(503);
    expect(
      api.handle("POST", `/v1/projects/proj_123/agent-tokens/${token.token_id}/revoke`, {}).body
    ).toHaveProperty("token.revoked_at");
    AlertGroupListResponseSchema.parse(
      api.handle("GET", "/v1/alert-groups?project_id=proj_123&limit=20").body
    );
  });
  it("disconnects synthetic installation and repository state without provider access", () => {
    const api = createDevMockApi();
    expect(api.handle("DELETE", "/v1/github/installation").status).toBe(204);
    expect(api.handle("GET", "/v1/github/installation?project_id=proj_123").body).toEqual({
      installation: null
    });
    expect(api.handle("GET", "/v1/projects/proj_123/github/repo").body).toEqual({ repo: null });
  });
});
