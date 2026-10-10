import { z } from "zod";
import {
  AnalyticsFlowDefinitionInputSchema,
  AnalyticsSavedFunnelCreateSchema,
  AnalyticsSavedFunnelUpdateSchema,
  AnalyticsBundleAnalysisKindSchema,
  parseAnalyticsRelativeDurationMs,
  ANALYTICS_BUNDLE_GENERATION_ID_HEADER
} from "../../packages/shared-types/src/index.js";
import type {
  AnalyticsFlowDefinition,
  AnalyticsSavedFunnel,
  AnalyticsBundleV1
} from "../../packages/shared-types/src/index.js";
import type { createDevMockFixtures, MockRecord } from "./fixtures.js";
import type { MockResponse } from "./api.js";

const reply = (body: unknown, status = 200): MockResponse => ({ status, body });
const missing = (): MockResponse => reply({ error: "mock_record_not_found" }, 404);
const invalid = (): MockResponse => reply({ error: "invalid_mock_payload" }, 400);

/** Synthetic artifact identifiers remain distinct from fixture-owned project identifiers. */
export function mockProjectUuid(index: number): string {
  return `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
}

export function createAnalyticsMocks(data: ReturnType<typeof createDevMockFixtures>) {
  const now = new Date().toISOString();
  let sequence = 100;
  const projectUuid = (id: string): string => id;
  const definitions = new Map<string, AnalyticsFlowDefinition[]>([
    [
      "00000000-0000-4000-8000-000000000001",
      [
        {
          id: mockProjectUuid(100),
          project_id: projectUuid("00000000-0000-4000-8000-000000000001"),
          flow_key: "checkout",
          display_name: "Checkout journey",
          kind: "activation",
          timeout_minutes: 60,
          version: 1,
          archived_at: null,
          steps: [
            {
              step_key: "browse",
              display_name: "Browse events",
              origin: "https://app.example.test"
            },
            {
              step_key: "checkout",
              display_name: "Open checkout",
              origin: "https://app.example.test"
            },
            {
              step_key: "complete",
              display_name: "Complete payment",
              origin: "https://app.example.test"
            }
          ]
        }
      ]
    ]
  ]);
  const saved = new Map<string, AnalyticsSavedFunnel[]>([
    [
      "00000000-0000-4000-8000-000000000001",
      [
        {
          project_id: projectUuid("00000000-0000-4000-8000-000000000001"),
          funnel_key: "checkout",
          display_name: "Checkout completion",
          created_at: now,
          updated_at: now,
          archived_at: null,
          steps: [
            { step_key: "start", display_name: "Start checkout" },
            { step_key: "shipping", display_name: "Choose shipping" },
            { step_key: "complete", display_name: "Complete checkout" }
          ]
        }
      ]
    ]
  ]);
  const artifacts = new Map<string, AnalyticsBundleV1>();
  function window(query: URLSearchParams) {
    const days =
      query.get("last") === "7d" || query.get("window") === "7d"
        ? 7
        : query.get("last") === "90d" || query.get("window") === "90d"
          ? 90
          : 30;
    return {
      from:
        query.get("from") ??
        new Date(
          Date.now() -
            (parseAnalyticsRelativeDurationMs(query.get("last") ?? "") ?? days * 86400000)
        ).toISOString(),
      to: query.get("to") ?? now,
      granularity: query.get("granularity") === "hour" ? ("hour" as const) : ("day" as const)
    };
  }
  function artifact(record: MockRecord, query: URLSearchParams): AnalyticsBundleV1 {
    return {
      schema_version: "analytics_bundle.v1",
      bundle_type: "analytics",
      analysis_kind: AnalyticsBundleAnalysisKindSchema.parse(record["analysis_kind"]),
      project: {
        project_id: projectUuid(String(record["project_id"])),
        service: "saycheese-frontend",
        environment: "production"
      },
      analysis_window: window(query),
      summary: {
        title: "Checkout completion drops after shipping",
        description:
          "Synthetic local preview evidence: mobile checkout has a drop in completion after the shipping step.",
        confidence: "high",
        severity: "medium"
      },
      metrics: {
        sessions_analyzed: 500,
        affected_sessions: 180,
        baseline: { conversion_rate: 0.7 },
        current: { conversion_rate: 0.45 }
      },
      segments: [{ dimension: "device_type", value: "mobile", sessions: 180 }],
      journey_patterns: [
        {
          from_route_key: "/checkout",
          to_route_key: "/shipping",
          transition_count: 180,
          transition_share: 0.36
        }
      ],
      representative_journeys: [{ sample_id: "journey_demo" }],
      linked_incidents: [{ incident_id: "inc_normal", title: "Checkout resource failed to load" }],
      linked_deploys: [],
      recommendations: [
        {
          title: "Review mobile shipping validation",
          description: "Inspect required fields and retry feedback."
        }
      ],
      redaction: { rules_applied: ["synthetic_preview"], omitted_fields: [] },
      metadata: { input_fingerprint: `sha256:${"a".repeat(64)}` }
    };
  }
  function handle(
    method: string,
    path: string,
    query: URLSearchParams,
    payload: unknown
  ): MockResponse | undefined {
    const pathProject = /^\/v1\/projects\/([^/]+)/.exec(path)?.[1];
    const inputProject = z.object({ project_id: z.string().optional() }).safeParse(payload);
    const projectId =
      pathProject ??
      query.get("project_id") ??
      (inputProject.success ? inputProject.data.project_id : undefined);
    const route = path.replace(/^\/v1\/projects\/[^/]+/, "/v1");
    const read = method === "GET";
    const project = data.projects.find((row) => row["project_id"] === projectId);
    const metricsWindow = {
      ...window(query),
      project_id: projectId,
      service: query.get("service") ?? null,
      environment: query.get("environment") ?? "production"
    };
    const flowMatch = /^\/v1\/analytics\/flows(?:\/([^/]+)(\/report)?)?$/.exec(route);
    if (flowMatch) {
      if (!project || !projectId) return missing();
      const rows = definitions.get(projectId) ?? [];
      const flow = rows.find((row) => row.flow_key === flowMatch[1] && row.archived_at === null);
      if (read && !flowMatch[1])
        return reply({ flows: rows.filter((row) => row.archived_at === null) });
      if (read && flowMatch[2]) {
        if (!flow) return missing();
        return reply({
          flow,
          window: {
            from: metricsWindow.from,
            to: metricsWindow.to,
            previous_from: new Date(
              Date.parse(metricsWindow.from) -
                (Date.parse(metricsWindow.to) - Date.parse(metricsWindow.from))
            ).toISOString()
          },
          starts: 500,
          previous_starts: 450,
          completions: 220,
          steps: flow.steps.map((step, i) => ({
            step_key: step.step_key,
            display_name: step.display_name,
            reached: Math.max(0, 500 - i * 140),
            previous_reached: Math.max(0, 450 - i * 120),
            unlinked: 5,
            dropoff: i === flow.steps.length - 1 ? 0 : 140,
            average_seconds: 30 + i * 10
          })),
          sources: [{ source: "direct", campaign: "preview", starts: 300, completions: 180 }],
          coverage: {
            observation: "explicit_integration_signals",
            incomplete: true,
            sources_truncated: false
          }
        });
      }
      if (method === "PUT") {
        const input = AnalyticsFlowDefinitionInputSchema.safeParse(payload);
        if (!input.success || input.data.flow_key !== flowMatch[1]) return invalid();
        const next = {
          ...input.data,
          id: flow?.id ?? mockProjectUuid(sequence++),
          project_id: projectUuid(projectId),
          version: (flow?.version ?? 0) + 1,
          archived_at: null
        };
        if (flow) rows.splice(rows.indexOf(flow), 1, next);
        else rows.push(next);
        definitions.set(projectId, rows);
        return reply({ flow: next });
      }
      if (method === "DELETE" && flow) {
        flow.archived_at = now;
        return reply({ archived: true });
      }
      return missing();
    }
    const savedMatch = /^\/v1\/analytics\/saved-funnels(?:\/([^/]+))?$/.exec(route);
    if (savedMatch) {
      if (!project || !projectId) return missing();
      const rows = saved.get(projectId) ?? [];
      const funnel = rows.find(
        (row) => row.funnel_key === savedMatch[1] && row.archived_at === null
      );
      if (read) return reply({ funnels: rows.filter((row) => row.archived_at === null) });
      if (method === "POST") {
        const input = AnalyticsSavedFunnelCreateSchema.safeParse(payload);
        if (!input.success) return invalid();
        if (
          rows.some((row) => row.funnel_key === input.data.funnel_key && row.archived_at === null)
        )
          return reply({ error: "funnel_key_exists" }, 409);
        const created = {
          ...input.data,
          project_id: projectUuid(projectId),
          created_at: now,
          updated_at: now,
          archived_at: null
        };
        rows.push(created);
        saved.set(projectId, rows);
        return reply({ funnel: created });
      }
      if (!funnel) return missing();
      if (method === "PATCH") {
        const input = AnalyticsSavedFunnelUpdateSchema.safeParse(payload);
        if (!input.success) return invalid();
        Object.assign(funnel, input.data, { updated_at: now });
        return reply({ funnel });
      }
      if (method === "DELETE") {
        funnel.archived_at = now;
        return reply({ archived: true });
      }
    }
    const funnelMatch = /^\/v1\/analytics\/funnels(?:\/([^/]+))?$/.exec(route);
    if (read && funnelMatch) {
      if (!project || !projectId) return missing();
      const funnels = (saved.get(projectId) ?? [])
        .filter((row) => row.archived_at === null)
        .map((row) => ({
          funnel_key: row.funnel_key,
          sessions_entered: 500,
          sessions_completed: 220,
          dropoffs: 280,
          conversion_rate: 0.44
        }));
      if (!funnelMatch[1]) return reply({ window: metricsWindow, funnels });
      const definition = (saved.get(projectId) ?? []).find(
        (row) => row.funnel_key === funnelMatch[1] && row.archived_at === null
      );
      const metric = funnels.find((row) => row.funnel_key === funnelMatch[1]);
      if (!definition || !metric) return missing();
      return reply({
        funnel: { ...metricsWindow, ...metric },
        steps: definition.steps.map((step, i) => ({
          step_key: step.step_key,
          step_order: i,
          sessions_entered: 500 - i * 140,
          sessions_completed: i === definition.steps.length - 1 ? 220 : 360 - i * 140,
          dropoffs: i === definition.steps.length - 1 ? 0 : 140,
          conversion_rate: 0.72 - i * 0.1
        }))
      });
    }
    if (read && route === "/v1/analytics/journey-patterns")
      return reply({
        window: metricsWindow,
        patterns:
          projectId === "00000000-0000-4000-8000-000000000001"
            ? [
                {
                  from_route_key: "/events",
                  to_route_key: "/checkout",
                  transition_count: 300,
                  unique_sessions: 220,
                  transition_share: 0.6,
                  sample_ids: ["journey_demo"]
                }
              ]
            : []
      });
    const sampleId = mockProjectUuid(910);
    const sample = {
      sample_id: sampleId,
      project_id: projectUuid("00000000-0000-4000-8000-000000000001"),
      service: "saycheese-frontend",
      environment: "production",
      session_id_hash: `sha256:${"b".repeat(64)}`,
      visitor_id_hash: null,
      analysis_tags: ["checkout_friction"],
      first_seen_at: now,
      last_seen_at: now,
      dimensions_summary: { device_type: "mobile", browser_family: "Safari", language: "en" },
      has_artifact: true,
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      created_at: now
    };
    if (read && route === "/v1/analytics/actions")
      return reply({
        window: {
          ...metricsWindow,
          project_id: projectUuid(projectId ?? "00000000-0000-4000-8000-000000000001")
        },
        actions:
          projectId === "00000000-0000-4000-8000-000000000001"
            ? [
                {
                  action_key: "checkout",
                  kind: "conversion",
                  event_count: 220,
                  unique_sessions: 200
                }
              ]
            : []
      });
    if (read && route === "/v1/analytics/journey-samples") {
      const limit = z.coerce
        .number()
        .int()
        .min(1)
        .max(100)
        .safeParse(query.get("limit") ?? 20);
      if (!limit.success) return invalid();
      const matches =
        projectId === "00000000-0000-4000-8000-000000000001" &&
        !query.has("cursor") &&
        (!query.has("tag") || query.get("tag") === "checkout_friction") &&
        (!query.has("service") || query.get("service") === sample.service) &&
        (!query.has("environment") || query.get("environment") === sample.environment);
      return reply({ samples: matches ? [sample] : [], next_cursor: null });
    }
    const journeyMatch = /^\/v1\/analytics\/journey-samples\/([^/]+)$/.exec(path);
    if (read && journeyMatch) {
      if (
        projectId !== "00000000-0000-4000-8000-000000000001" ||
        !["journey_demo", sampleId].includes(journeyMatch[1]!)
      )
        return missing();
      return reply({
        sample,
        journey: {
          schema_version: "analytics_journey_sample.v1",
          sample_id: sampleId,
          project_id: sample.project_id,
          service: sample.service,
          environment: sample.environment,
          session_id_hash: sample.session_id_hash,
          visitor_id_hash: null,
          first_seen_at: now,
          last_seen_at: now,
          analysis_tags: sample.analysis_tags,
          dimensions_summary: {},
          events: []
        }
      });
    }
    const opportunityMatch = /^\/v1\/analytics\/opportunities\/([^/]+)$/.exec(path);
    if (read && opportunityMatch) {
      const opportunity = data.opportunities.find(
        (row) => row["project_id"] === projectId && row["opportunity_id"] === opportunityMatch[1]
      );
      return opportunity ? reply({ opportunity }) : missing();
    }
    const bundleMatch = /^\/v1\/analytics\/bundles\/([^/]+)$/.exec(path);
    if (read && bundleMatch) {
      const record = data.bundles.find(
        (row) => row["project_id"] === projectId && row["generation_id"] === bundleMatch[1]
      );
      if (!record) return missing();
      return reply(artifacts.get(bundleMatch[1]!) ?? artifact(record, query));
    }
    if (path === "/v1/analytics/bundles" && method === "POST") {
      const input = z
        .object({
          project_id: z.string(),
          opportunity_id: z.string().optional(),
          analysis_kind: AnalyticsBundleAnalysisKindSchema
        })
        .safeParse(payload);
      if (!input.success) return invalid();
      if (!project) return missing();
      const opportunity = data.opportunities.find(
        (row) =>
          row["project_id"] === projectId && row["opportunity_id"] === input.data.opportunity_id
      );
      if (input.data.opportunity_id && !opportunity) return missing();
      const id = `mock_generation_${sequence++}`;
      const record = {
        ...data.bundles[0],
        generation_id: id,
        project_id: projectId,
        project_name: project["name"],
        opportunity_id: input.data.opportunity_id ?? null,
        analysis_kind: input.data.analysis_kind,
        status: "completed",
        has_artifact: true,
        completed_at: now,
        created_at: now,
        updated_at: now
      };
      data.bundles.unshift(record);
      if (opportunity)
        Object.assign(opportunity, {
          bundle_generation_id: id,
          bundle_status: "completed",
          bundle_created_at: now,
          bundle_updated_at: now
        });
      const bundle = artifact(record, query);
      artifacts.set(id, bundle);
      return { ...reply(bundle), headers: { [ANALYTICS_BUNDLE_GENERATION_ID_HEADER]: id } };
    }
    return undefined;
  }
  return { handle };
}
