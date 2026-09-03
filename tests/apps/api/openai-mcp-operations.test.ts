import { gzipSync } from "node:zlib";

import { describe, expect, it, vi } from "vitest";

import {
  OPENAI_TOOL_NAMES,
  createOpenAiHostedToolHandlers,
  type OpenAiMcpPrincipal
} from "../../../packages/mcp-core/src/index.js";
import { createOpenAiHostedOperations } from "../../../apps/api/src/openai-mcp-operations.js";

const NOW = new Date().toISOString();
const PRINCIPAL: OpenAiMcpPrincipal = {
  userId: "user_1",
  organizationId: "org_1",
  grantId: "grant_1",
  scopes: [
    "debugbundle:projects:read",
    "debugbundle:incidents:read",
    "debugbundle:artifacts:read",
    "debugbundle:improvements:read",
    "debugbundle:analytics:read",
    "debugbundle:health:read"
  ]
};

interface AnalyticsInputFixture {
  project_id: string;
  from: string;
  to: string;
  granularity: "hour" | "day";
  service?: string;
  environment?: string;
  funnel_key?: string;
  incident_id?: string;
}

const incident = {
  incident_id: "incident_1",
  project_id: "project_1",
  service_name: "api",
  environment: "production",
  title: "Request failed",
  severity: "high",
  status: "open",
  first_seen_at: NOW,
  last_seen_at: NOW,
  occurrence_count: 3,
  regressed_at: null
};

const improvement = {
  improvement_id: "improvement_1",
  project_id: "project_1",
  service_name: "api",
  environment: "production",
  kind: "request_failure_pattern",
  status: "open",
  severity: "medium",
  confidence: 0.8,
  title: "Handle repeated failures",
  summary: "A bounded improvement summary.",
  occurrence_count: 4,
  related_incident_ids: ["incident_1"],
  first_detected_at: NOW,
  last_detected_at: NOW,
  bundle_generation_number: 1,
  bundle_failure_reason: null
};

const bundle = gzipSync(
  JSON.stringify({
    bundle_version: 1,
    summary: {
      title: "Request failed",
      description: "The request handler returned 500.",
      likely_cause: "Unhandled exception",
      confidence: 0.8,
      recommended_action: "Inspect the request handler.",
      severity: "high",
      error_type: "TypeError",
      error_message: "Request failed",
      first_application_frame: { file: "src/api.ts", line: 12, function: "handler" }
    },
    context: {
      request: { method: "GET", path: "/orders", route_template: "/orders" },
      response: { status_code: 500 },
      error: { name: "TypeError", message: "Request failed" },
      deploy: {
        commit_sha: "abc123",
        deploy_version: "1.2.3",
        branch: "main",
        deployed_at: NOW,
        regression_window: true
      },
      logs: { items: [{ message: "must not escape" }] }
    },
    redaction: { redacted: true, fields: ["authorization"], notes: null }
  })
);
const reproduction = gzipSync(
  JSON.stringify({
    possible: true,
    confidence: 0.7,
    reason: "Safe bounded reproduction",
    curl: "curl https://example.test/orders",
    httpie: null,
    steps: ["Send a GET request."]
  })
);

function createDependencies(organizationId = "org_1") {
  const listIncidentLogsForOrganization = vi.fn();
  const bundleRegeneration = { requestRegeneration: vi.fn() };
  return {
    listIncidentLogsForOrganization,
    bundleRegeneration,
    dependencies: {
      projectManagement: {
        resolveProjectAccessForUser: vi.fn(async () => ({
          organization_id: organizationId,
          shared_access_suspended: false
        })),
        listProjectsForUser: vi.fn(async () => [
          {
            project_id: "project_1",
            organization_id: "org_1",
            name: "Production API",
            color_tag: "blue",
            shared_access_suspended: false
          }
        ])
      },
      incidentRetrieval: {
        listServicesForOrganization: vi.fn(async () => [
          {
            service_id: "service_1",
            project_id: "project_1",
            name: "api",
            runtime: "node",
            framework: "fastify",
            environment: "production"
          }
        ]),
        listIncidentsForOrganization: vi.fn(async () => [incident]),
        getIncidentForOrganization: vi.fn(async () => incident),
        listIncidentLogsForOrganization
      },
      improvementManagement: {
        listImprovementsForOrganization: vi.fn(async () => [improvement]),
        getImprovementForOrganization: vi.fn(async () => improvement)
      },
      availabilityCheckManagement: {
        listChecksForProjectInOrganization: vi.fn(async () => [
          {
            check_id: "check_1",
            project_id: "project_1",
            name: "API health",
            url: "https://user:pass@EXAMPLE.test/token_secret?api_key=secret#fragment",
            method: "GET",
            expected_status_min: 200,
            expected_status_max: 299,
            timeout_ms: 5000,
            interval_seconds: 60,
            environment: "production",
            service_name: "api",
            enabled: true,
            status: "passing",
            last_checked_at: NOW,
            last_result_status: "success",
            last_result_http_status: 200,
            last_result_duration_ms: 42
          }
        ]),
        getCheckForProjectInOrganization: vi.fn(async () => ({
          check_id: "check_1",
          project_id: "project_1",
          name: "API health",
          url: "https://EXAMPLE.test/health?token=secret",
          method: "GET",
          expected_status_min: 200,
          expected_status_max: 299,
          timeout_ms: 5000,
          interval_seconds: 60,
          environment: "production",
          service_name: "api",
          enabled: true,
          status: "passing",
          last_checked_at: NOW,
          last_result_status: "success",
          last_result_http_status: 200,
          last_result_duration_ms: 42
        })),
        listResultsForCheckInOrganization: vi.fn(async () => [
          {
            result_id: "result_1",
            check_id: "check_1",
            project_id: "project_1",
            started_at: NOW,
            completed_at: NOW,
            duration_ms: 42,
            status: "success",
            http_status: 200,
            error_kind: null,
            error_message: "must not escape",
            redirect_count: 0,
            checked_url_host: "EXAMPLE.test",
            final_url: "https://EXAMPLE.test/health?token=secret"
          }
        ]),
        listDailyRollupsForCheckInOrganization: vi.fn(async () => [
          {
            check_id: "check_1",
            project_id: "project_1",
            day: NOW.slice(0, 10),
            state: "operational",
            total_checks: 10,
            successful_checks: 10,
            failed_checks: 0,
            degraded_checks: 0,
            avg_duration_ms: 42,
            first_checked_at: NOW,
            last_checked_at: NOW,
            downtime_seconds: 0,
            incident_ids: []
          }
        ])
      },
      analyticsMetrics: {
        getUsageSummary: vi.fn(async (input: AnalyticsInputFixture) => ({
          summary: {
            project_id: input.project_id,
            from: input.from,
            to: input.to,
            granularity: input.granularity,
            service: input.service ?? null,
            environment: input.environment ?? null,
            sessions: 12,
            pageviews: 30,
            active_visitors: 8,
            new_visitors: 5,
            returning_visitors: 3,
            exits: 4,
            conversions: 2
          },
          breakdowns: {
            device_types: [{ value: "desktop", sessions: 12, pageviews: 30 }],
            browsers: [],
            os: [],
            languages: [],
            referrers: [],
            auth_states: []
          }
        })),
        getRouteMetrics: vi.fn(async (input: AnalyticsInputFixture) => ({
          window: {
            project_id: input.project_id,
            from: input.from,
            to: input.to,
            granularity: input.granularity,
            service: input.service ?? null,
            environment: input.environment ?? null
          },
          routes: [{
            route_key: "/orders",
            pageviews: 10,
            unique_sessions: 6,
            entrances: 3,
            exits: 2,
            bounces: 1,
            linked_incident_sessions: 2
          }]
        })),
        getJourneyPatterns: vi.fn(async (input: AnalyticsInputFixture) => ({
          window: {
            project_id: input.project_id,
            from: input.from,
            to: input.to,
            granularity: input.granularity,
            service: input.service ?? null,
            environment: input.environment ?? null
          },
          patterns: [{
            from_route_key: "/pricing",
            to_route_key: "/checkout",
            transition_count: 4,
            unique_sessions: 3,
            transition_share: 0.5,
            sample_ids: ["must-not-escape-sample-id"]
          }]
        })),
        getDeviceBreakdown: vi.fn(async (input: AnalyticsInputFixture) => ({
          window: {
            project_id: input.project_id,
            from: input.from,
            to: input.to,
            granularity: input.granularity,
            service: input.service ?? null,
            environment: input.environment ?? null
          },
          device_types: [{ value: "mobile", sessions: 5, pageviews: 9 }],
          browsers: [],
          os: [],
          languages: []
        })),
        getReferrerMetrics: vi.fn(async (input: AnalyticsInputFixture) => ({
          window: {
            project_id: input.project_id,
            from: input.from,
            to: input.to,
            granularity: input.granularity,
            service: input.service ?? null,
            environment: input.environment ?? null
          },
          referrers: [{ value: "example.test", sessions: 4, pageviews: 7 }],
          utm_sources: [],
          utm_mediums: [],
          utm_campaigns: []
        })),
        getActionMetrics: vi.fn(async (input: AnalyticsInputFixture) => ({
          window: {
            project_id: input.project_id,
            from: input.from,
            to: input.to,
            granularity: input.granularity,
            service: input.service ?? null,
            environment: input.environment ?? null
          },
          actions: [{ action_key: "checkout", kind: "action", event_count: 5, unique_sessions: 4 }]
        })),
        listFunnels: vi.fn(async (input: AnalyticsInputFixture) => ({
          window: {
            project_id: input.project_id,
            from: input.from,
            to: input.to,
            granularity: input.granularity,
            service: input.service ?? null,
            environment: input.environment ?? null
          },
          funnels: [{
            funnel_key: "checkout",
            sessions_entered: 8,
            sessions_completed: 3,
            dropoffs: 5,
            conversion_rate: 0.375
          }]
        })),
        getFunnelAnalysis: vi.fn(async (input: AnalyticsInputFixture) => ({
          funnel: {
            project_id: input.project_id,
            funnel_key: input.funnel_key,
            from: input.from,
            to: input.to,
            granularity: input.granularity,
            service: input.service ?? null,
            environment: input.environment ?? null,
            sessions_entered: 8,
            sessions_completed: 3,
            dropoffs: 5,
            conversion_rate: 0.375
          },
          steps: [{
            step_key: "start",
            step_order: 0,
            sessions_entered: 8,
            sessions_completed: 3,
            dropoffs: 5,
            conversion_rate: 0.375
          }]
        })),
        getIncidentImpact: vi.fn(async (input: AnalyticsInputFixture) => ({
          incident_id: input.incident_id,
          window: {
            project_id: input.project_id,
            from: input.from,
            to: input.to,
            granularity: input.granularity,
            service: input.service ?? null,
            environment: input.environment ?? null
          },
          affected_sessions: 4,
          affected_routes: [{ route_key: "/orders", affected_sessions: 4 }],
          affected_funnels: [{ funnel_key: "checkout", affected_sessions: 2 }],
          top_device_types: [{ value: "mobile", affected_sessions: 3 }],
          top_browsers: [],
          journey_patterns: [{
            from_route_key: "/pricing",
            to_route_key: "/checkout",
            affected_sessions: 2,
            sample_ids: ["must-not-escape-impact-sample-id"]
          }],
          conversion_delta: { availability: "unavailable", value: null, unit: "percentage_points" },
          analytics_bundle: {
            status: "failed",
            generation_id: "must-not-escape-generation-id",
            failure_reason: "must not escape bundle reason"
          }
        }))
      },
      objectStoreReader: {
        getObject: vi.fn(async ({ key }: { key: string }) =>
          key.includes("reproductions") ? reproduction : bundle
        )
      },
      bundleRegeneration
    }
  };
}

const toolInputs: Record<(typeof OPENAI_TOOL_NAMES)[number], Record<string, unknown>> = {
  list_projects: {},
  list_services: { projectId: "project_1" },
  list_incidents: { projectId: "project_1" },
  get_incident: { projectId: "project_1", incidentId: "incident_1" },
  get_incident_context: { projectId: "project_1", incidentId: "incident_1" },
  get_bundle: { projectId: "project_1", incidentId: "incident_1" },
  get_reproduction: { projectId: "project_1", incidentId: "incident_1" },
  list_improvements: { projectId: "project_1" },
  get_improvement: { projectId: "project_1", improvementId: "improvement_1" },
  get_improvement_bundle: { projectId: "project_1", improvementId: "improvement_1" },
  get_usage_summary: { projectId: "project_1" },
  get_route_metrics: { projectId: "project_1" },
  get_journey_patterns: { projectId: "project_1" },
  get_device_breakdown: { projectId: "project_1" },
  get_referrer_metrics: { projectId: "project_1" },
  get_action_metrics: { projectId: "project_1" },
  list_funnel_metrics: { projectId: "project_1" },
  get_funnel_analysis: { projectId: "project_1", funnelKey: "checkout" },
  get_incident_impact: { projectId: "project_1", incidentId: "incident_1" },
  list_health_checks: { projectId: "project_1" },
  get_health_check: { projectId: "project_1", checkId: "check_1" },
  list_health_check_results: { projectId: "project_1", checkId: "check_1" },
  list_health_check_daily_rollups: { projectId: "project_1", checkId: "check_1" }
};

describe("dedicated OpenAI hosted readers", () => {
  it("returns schema-valid bounded projections for all twenty-three tools without side effects", async () => {
    const fixture = createDependencies();
    const operations = createOpenAiHostedOperations({
      dependencies: fixture.dependencies as never,
      dashboardBaseUrl: "https://app.debugbundle.com"
    });
    const handlers = createOpenAiHostedToolHandlers({ operations });

    const results = await Promise.all(
      OPENAI_TOOL_NAMES.map((name) =>
        handlers[name]({ principal: PRINCIPAL, input: toolInputs[name] })
      )
    );

    expect(results).toHaveLength(23);
    expect(JSON.stringify(results)).not.toContain("must not escape");
    expect(JSON.stringify(results)).not.toContain("api_key=secret");
    expect(JSON.stringify(results)).not.toContain("user:pass");
    expect(JSON.stringify(results)).not.toContain("sample-id");
    expect(JSON.stringify(results)).not.toContain("generation-id");
    expect(fixture.dependencies.analyticsMetrics.getJourneyPatterns).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: "project_1", limit: 10 }),
      { includeSampleIds: false }
    );
    expect(fixture.dependencies.analyticsMetrics.getIncidentImpact).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: "project_1", incident_id: "incident_1", limit: 10 }),
      { includeSampleIds: false, includeBundleState: false }
    );
    expect(fixture.listIncidentLogsForOrganization).not.toHaveBeenCalled();
    expect(fixture.bundleRegeneration.requestRegeneration).not.toHaveBeenCalled();
  });

  it("denies project reads when current access no longer matches the grant organization", async () => {
    const fixture = createDependencies("org_other");
    const operations = createOpenAiHostedOperations({
      dependencies: fixture.dependencies as never,
      dashboardBaseUrl: "https://app.debugbundle.com"
    });

    await expect(
      operations.get_incident?.({
        principal: PRINCIPAL,
        input: { projectId: "project_1", incidentId: "incident_1" }
      })
    ).rejects.toThrow("openai_mcp_project_not_found");
    expect(
      fixture.dependencies.incidentRetrieval.getIncidentForOrganization
    ).not.toHaveBeenCalled();
  });

  it("rejects analytics route identifiers containing query or fragment data before storage reads", async () => {
    const fixture = createDependencies();
    const operations = createOpenAiHostedOperations({
      dependencies: fixture.dependencies as never,
      dashboardBaseUrl: "https://app.debugbundle.com"
    });

    await expect(
      operations.get_route_metrics?.({
        principal: PRINCIPAL,
        input: { projectId: "project_1", route: "/checkout?token=must-not-pass" }
      })
    ).rejects.toThrow("openai_mcp_invalid_analytics_route");
    await expect(
      operations.get_journey_patterns?.({
        principal: PRINCIPAL,
        input: { projectId: "project_1", route: "/checkout#private" }
      })
    ).rejects.toThrow("openai_mcp_invalid_analytics_route");
    expect(fixture.dependencies.analyticsMetrics.getRouteMetrics).not.toHaveBeenCalled();
    expect(fixture.dependencies.analyticsMetrics.getJourneyPatterns).not.toHaveBeenCalled();
  });

  it("rejects incident-impact reads when the incident does not belong to the selected project", async () => {
    const fixture = createDependencies();
    const operations = createOpenAiHostedOperations({
      dependencies: fixture.dependencies as never,
      dashboardBaseUrl: "https://app.debugbundle.com"
    });

    await expect(
      operations.get_incident_impact?.({
        principal: PRINCIPAL,
        input: { projectId: "project_other", incidentId: "incident_1" }
      })
    ).rejects.toThrow("openai_mcp_incident_not_found");
    expect(fixture.dependencies.analyticsMetrics.getIncidentImpact).not.toHaveBeenCalled();
  });
});
