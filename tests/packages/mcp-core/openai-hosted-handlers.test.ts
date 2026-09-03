import { describe, expect, it, vi } from "vitest";

import { createOpenAiHostedToolHandlers } from "../../../packages/mcp-core/src/index.js";

describe("OpenAI hosted MCP handlers", () => {
  it("uses injected dedicated readers and enforces the combined incident/artifact scope", async () => {
    const getIncidentContext = vi.fn().mockResolvedValue({
      incident: {
        incident_id: "inc_1",
        project_id: "proj_1",
        service_name: null,
        environment: "production",
        title: "Checkout failure",
        severity: "high",
        status: "open",
        first_seen_at: "2026-08-30T10:00:00.000Z",
        last_seen_at: "2026-08-30T10:01:00.000Z",
        occurrence_count: 1,
        regressed_at: null,
        dashboard_url: "https://debugbundle.com/incidents/inc_1"
      },
      primary_signal: {
        description: "Checkout request failed",
        error_type: "TypeError",
        error_message: "Payment provider unavailable",
        request_method: "POST",
        request_path: "/checkout",
        route_template: "/checkout",
        response_status: 500,
        first_application_frame: null
      },
      bundle_status: "missing",
      reproduction_status: "missing",
      deploy: {
        commit_sha: null,
        deploy_version: null,
        branch: null,
        deployed_at: null,
        regression_window: null
      },
      redaction: null,
      suggested_next_checks: [],
      continuation_url: "https://debugbundle.com/incidents/inc_1"
    });
    const handlers = createOpenAiHostedToolHandlers({
      operations: { get_incident_context: getIncidentContext }
    });

    await expect(
      handlers.get_incident_context({
        principal: {
          userId: "user_1",
          organizationId: "org_1",
          grantId: "grant_1",
          scopes: ["debugbundle:incidents:read"]
        },
        input: { projectId: "proj_1", incidentId: "inc_1" }
      })
    ).rejects.toThrow("openai_mcp_insufficient_scope:debugbundle:artifacts:read");
    expect(getIncidentContext).not.toHaveBeenCalled();

    await expect(
      handlers.get_incident_context({
        principal: {
          userId: "user_1",
          organizationId: "org_1",
          grantId: "grant_1",
          scopes: ["debugbundle:incidents:read", "debugbundle:artifacts:read"]
        },
        input: { projectId: "proj_1", incidentId: "inc_1" }
      })
    ).resolves.toMatchObject({ structuredContent: { bundle_status: "missing" } });
    expect(getIncidentContext).toHaveBeenCalledTimes(1);
  });

  it("requires both analytics and incident scopes before incident-impact reads", async () => {
    const getIncidentImpact = vi.fn();
    const handlers = createOpenAiHostedToolHandlers({
      operations: { get_incident_impact: getIncidentImpact }
    });
    const request = {
      input: { projectId: "proj_1", incidentId: "inc_1" }
    };

    await expect(
      handlers.get_incident_impact({
        ...request,
        principal: {
          userId: "user_1",
          organizationId: "org_1",
          grantId: "grant_1",
          scopes: ["debugbundle:analytics:read"]
        }
      })
    ).rejects.toThrow("openai_mcp_insufficient_scope:debugbundle:incidents:read");
    await expect(
      handlers.get_incident_impact({
        ...request,
        principal: {
          userId: "user_1",
          organizationId: "org_1",
          grantId: "grant_1",
          scopes: ["debugbundle:incidents:read"]
        }
      })
    ).rejects.toThrow("openai_mcp_insufficient_scope:debugbundle:analytics:read");
    expect(getIncidentImpact).not.toHaveBeenCalled();
  });
});
