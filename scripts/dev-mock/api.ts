import { z } from "zod";
import { randomUUID } from "node:crypto";

import { createDevMockFixtures, type MockRecord } from "./fixtures.js";
import {
  buildIncidentContextRecord,
  type IncidentContextIncidentRecord
} from "../../packages/storage/src/incident-context.js";
import { base } from "./base.js";
import syntheticBundle from "./bundle.json" with { type: "json" };
import { createManagementMocks } from "./management.js";
import { createAnalyticsMocks } from "./analytics.js";
import { createBillingMocks } from "./billing.js";
import { createPublicStatusMocks } from "./public-status.js";

export interface MockResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}
const objectSchema = z.record(z.string(), z.unknown());
const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.coerce.number().int().min(0).default(0)
});
const reply = (body: unknown, status = 200): MockResponse => ({ status, body });
const missing = (): MockResponse => reply({ error: "mock_record_not_found" }, 404);

/** This is a UI simulator, never a proxy or an alternative production API. */
export function createDevMockApi() {
  const data = createDevMockFixtures();
  const management = createManagementMocks(data);
  const analytics = createAnalyticsMocks(data);
  const billing = createBillingMocks(data);
  const publicStatus = createPublicStatusMocks(data, management.isSignedIn);
  const capturePolicies = new Map(
    data.projects.map((project) => [
      String(project["project_id"]),
      structuredClone(data.capturePolicy)
    ])
  );
  const improvementSettings = new Map(
    data.projects.map((project) => [
      String(project["project_id"]),
      structuredClone(data.improvementSettings)
    ])
  );
  let sequence = 100;
  function filtered(
    rows: MockRecord[],
    query: URLSearchParams,
    projectId: string | null
  ): MockRecord[] {
    return rows.filter((row) => {
      if (projectId && row["project_id"] !== projectId) return false;
      for (const key of ["environment", "status", "severity", "kind"]) {
        const value = query.get(key);
        if (key === "status" && value === "active") {
          if (row["status"] !== "open" && row["status"] !== "regressed") return false;
          continue;
        }
        if (value && value !== "all" && row[key] !== value) return false;
      }
      const service = query.get("service");
      if (service && (row["service_name"] ?? row["service"]) !== service) return false;
      const search = query.get("search")?.toLowerCase();
      const title = row["title"] ?? row["name"];
      return !search || (typeof title === "string" && title.toLowerCase().includes(search));
    });
  }
  function page(
    key: string,
    rows: MockRecord[],
    query: URLSearchParams,
    projectId: string | null
  ): MockResponse {
    const parsed = pageSchema.safeParse({
      limit: query.get("limit") ?? undefined,
      cursor: query.get("cursor") ?? undefined
    });
    if (!parsed.success) return reply({ error: "invalid_mock_pagination" }, 400);
    const items = filtered(rows, query, projectId);
    const { limit, cursor } = parsed.data;
    const end = cursor + limit;
    return reply({
      [key]: items.slice(cursor, end),
      next_cursor: end < items.length ? String(end) : null,
      total_count: items.length,
      total_pages: Math.max(1, Math.ceil(items.length / limit))
    });
  }
  function crud(
    rows: MockRecord[],
    template: MockRecord,
    key: string,
    plural: string,
    idKey: string,
    id: string | undefined,
    method: string,
    payload: unknown,
    projectId: string | null
  ): MockResponse {
    const index = rows.findIndex(
      (row) => row[idKey] === id && (!projectId || row["project_id"] === projectId)
    );
    if (method === "GET")
      return id
        ? index < 0
          ? missing()
          : reply({ [key]: rows[index] })
        : reply({ [plural]: filtered(rows, new URLSearchParams(), projectId) });
    if (id && index < 0) return missing();
    if (method === "DELETE" && id) {
      rows.splice(index, 1);
      return reply({ deleted: true });
    }
    if (method !== "PATCH" && method !== "POST")
      return reply({ error: "mock_method_not_supported" }, 405);
    const parsed = objectSchema.safeParse(payload);
    if (!parsed.success || Object.keys(parsed.data).length === 0)
      return reply({ error: "invalid_mock_payload" }, 400);
    const existing = id ? rows[index] : structuredClone(template);
    if (!existing) return missing();
    // Identity fields are fixture-owned, so edits cannot move a row to another project.
    const changes = Object.fromEntries(
      Object.entries(parsed.data).filter(
        ([field]) =>
          ![
            idKey,
            "organization_id",
            "project_id",
            "created_at",
            "__proto__",
            "constructor",
            "prototype"
          ].includes(field)
      )
    );
    Object.assign(existing, changes, { updated_at: new Date().toISOString() });
    if (!id) {
      Object.assign(existing, {
        [idKey]: key === "check" ? randomUUID() : `demo_${key}_${sequence++}`,
        project_id: projectId ?? parsed.data["project_id"] ?? "00000000-0000-4000-8000-000000000001"
      });
      rows.push(existing);
    }
    return reply({ [key]: existing });
  }
  function handle(
    method: string,
    resource: string,
    payload?: unknown,
    origin = "http://localhost:5291"
  ): MockResponse {
    const url = new URL(resource, "http://localhost");
    const path = url.pathname,
      query = url.searchParams;
    const projectMatch = /^\/v1\/projects\/([^/]+)/.exec(path);
    const projectId = projectMatch?.[1] ?? query.get("project_id");
    const route = path.replace(/^\/v1\/projects\/[^/]+/, "/v1");
    const read = method === "GET";
    const published = publicStatus.handle(method, path, query, payload, origin);
    if (published) return published;
    const managed = management.handle(method, path, query, payload);
    if (managed) return managed;
    const analyzed = analytics.handle(method, path, query, payload);
    if (analyzed) return analyzed;
    const billed = billing.handle(method, path, payload);
    if (billed) return billed;
    if (read && path === "/v1/projects")
      return reply({
        projects: data.projects.map((project) => {
          const incidents = data.incidents.filter(
            (row) => row["project_id"] === project["project_id"]
          );
          const open = incidents.filter((row) => row["status"] === "open").length;
          const regressed = incidents.filter((row) => row["status"] === "regressed").length;
          return {
            ...project,
            metrics: {
              ...base.projects.metrics,
              open_incidents: open,
              regressed_incidents: regressed,
              attention_incidents_today: open + regressed,
              opened_incidents_today: incidents.length,
              opened_incidents_month: incidents.length,
              retained_bundles: incidents.length
            }
          };
        })
      });
    if (read && path === "/v1/services")
      return reply({
        services: [
          {
            service_id: "svc_123",
            project_id: projectId ?? "00000000-0000-4000-8000-000000000001",
            name: "saycheese-frontend",
            runtime: "browser",
            framework: null,
            environment: "production"
          }
        ]
      });
    const project = /^\/v1\/projects\/([^/]+)$/.exec(path);
    if (project && method === "PATCH")
      return crud(
        data.projects,
        data.projects[0] ?? {},
        "project",
        "projects",
        "project_id",
        project[1],
        method,
        payload,
        null
      );
    const lists: Record<string, [string, MockRecord[]]> = {
      "/v1/incidents": ["incidents", data.incidents],
      "/v1/improvements": ["improvements", data.improvements],
      "/v1/analytics/opportunities": ["opportunities", data.opportunities],
      "/v1/analytics/bundles": ["bundles", data.bundles]
    };
    const list = lists[route];
    if (read && list) return page(list[0], list[1], query, projectId);
    const lifecycle = /^\/v1\/(incidents|improvements)\/([^/]+)\/(resolve|reopen|snooze)$/.exec(
      route
    );
    if (method === "POST" && lifecycle) {
      const rows: MockRecord[] = lifecycle[1] === "incidents" ? data.incidents : data.improvements;
      const key = lifecycle[1] === "incidents" ? "incident" : "improvement";
      const row = rows.find((item) => item[`${key}_id`] === lifecycle[2]);
      if (!row || (projectId && row["project_id"] !== projectId)) return missing();
      if (lifecycle[3] === "snooze") {
        const input = z.object({ snoozed_until: z.string().datetime() }).safeParse(payload);
        if (!input.success || key !== "improvement")
          return reply({ error: "invalid_mock_payload" }, 400);
        row["snoozed_until"] = input.data.snoozed_until;
      }
      row["status"] =
        lifecycle[3] === "snooze" ? "snoozed" : lifecycle[3] === "resolve" ? "resolved" : "open";
      row["resolved_at"] = lifecycle[3] === "resolve" ? new Date().toISOString() : null;
      return reply({ [key]: row });
    }
    const bulk = /^\/v1\/incidents\/(resolve|reopen)$/.exec(path);
    if (method === "POST" && bulk) {
      const parsed = z.object({ incident_ids: z.array(z.string()).max(100) }).safeParse(payload);
      if (!parsed.success) return reply({ error: "invalid_mock_payload" }, 400);
      const incidents = data.incidents.filter((row) =>
        parsed.data.incident_ids.includes(String(row["incident_id"]))
      );
      incidents.forEach((row) => {
        row["status"] = bulk[1] === "resolve" ? "resolved" : "open";
      });
      return reply({ incidents });
    }
    const contextMatch = /^\/v1\/incidents\/([^/]+)\/context$/.exec(route);
    if (read && contextMatch) {
      const incident = data.incidents.find(
        (row) =>
          row["incident_id"] === contextMatch[1] && (!projectId || row["project_id"] === projectId)
      );
      if (!incident) return missing();
      return reply(
        buildIncidentContextRecord({
          incident: incident as IncidentContextIncidentRecord,
          bundle: { status: "pending" },
          reproduction: { status: "pending" },
          logs: { logs: [], next_cursor: null }
        })
      );
    }
    if (read && path === "/v1/logs") {
      if (!data.incidents.some((row) => row["incident_id"] === query.get("incident_id")))
        return missing();
      return reply({ logs: [], next_cursor: null });
    }
    const detail = /^\/v1\/(incidents|improvements)\/([^/]+)(?:\/(bundle|reproduction))?$/.exec(
      route
    );
    if (read && detail) {
      const key = detail[1] === "incidents" ? "incident" : "improvement";
      const rows: MockRecord[] = key === "incident" ? data.incidents : data.improvements;
      const row = rows.find((item) => item[`${key}_id`] === detail[2]);
      if (!row || (projectId && row["project_id"] !== projectId)) return missing();
      if (detail[3] === "reproduction") return reply(syntheticBundle.reproduction);
      if (detail[3] === "bundle") {
        const bundle = structuredClone(syntheticBundle);
        bundle.bundle_type = key === "improvement" ? "improvement" : "failure";
        bundle.bundle_id = `demo_bundle_${detail[2]}`;
        bundle.captured_at = String(row["last_seen_at"] ?? row["last_detected_at"]);
        bundle.project.id = String(row["project_id"]);
        bundle.summary.title = String(row["title"]).slice(0, 180);
        bundle.context.error.message = bundle.summary.title;
        bundle.metadata.created_at = bundle.captured_at;
        bundle.metadata.updated_at = bundle.captured_at;
        return reply(bundle);
      }
      return reply({ [key]: row });
    }
    const collections: Array<[RegExp, MockRecord[], MockRecord, string, string, string]> = [
      [/^\/v1\/alerts(?:\/([^/]+))?$/, data.alerts, base.alerts, "alert", "alerts", "alert_id"],
      [
        /^\/v1\/capture-rules(?:\/([^/]+))?$/,
        data.captureRules,
        base.captureRules,
        "rule",
        "rules",
        "id"
      ],
      [
        /^\/v1\/github\/rules(?:\/([^/]+))?$/,
        data.githubRules,
        base.githubRules,
        "rule",
        "rules",
        "rule_id"
      ],
      [
        /^\/v1\/availability-checks(?:\/([^/]+))?$/,
        data.checks,
        base.checks,
        "check",
        "checks",
        "check_id"
      ]
    ];
    for (const [pattern, rows, template, key, plural, idKey] of collections) {
      const match = pattern.exec(route);
      if (!match || match[1] === "test") continue;
      const response = crud(
        rows,
        template,
        key,
        plural,
        idKey,
        match[1],
        method,
        payload,
        projectId
      );
      if (read && !match[1] && key === "check")
        return reply({
          ...(response.body as MockRecord),
          limits: {
            max_checks_per_project: 10,
            max_monitored_projects_per_organization: 10,
            max_active_checks_per_organization: 50,
            min_interval_seconds: 60,
            recommended_failure_threshold: 2
          }
        });
      if (read && key === "rule" && route.includes("capture-rules"))
        return reply({ ...(response.body as MockRecord), access_mode: "manage" });
      return response;
    }
    const history = /^\/v1\/availability-checks\/([^/]+)\/(daily-rollups|results)$/.exec(route);
    if (read && history) {
      const check = data.checks.find(
        (row) => row["check_id"] === history[1] && row["project_id"] === projectId
      );
      if (!check) return missing();
      return history[2] === "results"
        ? reply({
            results: [
              {
                result_id: `mock_result_${history[1]}`,
                check_id: history[1],
                project_id: projectId,
                started_at: check["last_checked_at"],
                completed_at: check["last_checked_at"],
                duration_ms: 120,
                status: check["status"] === "failing" ? "http_status_mismatch" : "success",
                http_status: check["last_result_http_status"],
                error_kind: null,
                error_message: null,
                redirect_count: 0,
                checked_url_host: "health.example.test",
                final_url: check["url"]
              }
            ]
          })
        : reply({
            rollups: data.rollups.filter(
              (row) => row["check_id"] === history[1] && row["project_id"] === projectId
            )
          });
    }
    if (method === "POST" && route === "/v1/availability-checks/test") {
      const parsed = z.object({ url: z.string().url() }).safeParse(payload);
      if (!parsed.success) return reply({ error: "invalid_mock_payload" }, 400);
      return reply({
        normalized_url: parsed.data.url,
        result: {
          status: "success",
          http_status: 200,
          duration_ms: 120,
          error_kind: null,
          error_message: null,
          redirect_count: 0,
          checked_url_host: new URL(parsed.data.url).host,
          checked_url_path: new URL(parsed.data.url).pathname,
          checked_url_query: Object.fromEntries(new URL(parsed.data.url).searchParams),
          final_url: parsed.data.url
        }
      });
    }
    const retry = /^\/v1\/github\/deliveries\/([^/]+)\/retry$/.exec(route);
    if (method === "POST" && retry) {
      const rows: MockRecord[] = data.deliveries;
      const delivery =
        projectId === "00000000-0000-4000-8000-000000000001"
          ? rows.find((row) => row["delivery_id"] === retry[1])
          : undefined;
      if (!delivery) return missing();
      delivery["status"] = "retrying";
      delivery["last_error"] = null;
      return reply({ delivery });
    }
    if (read && route === "/v1/github/deliveries")
      return reply({
        deliveries: projectId === "00000000-0000-4000-8000-000000000001" ? data.deliveries : []
      });
    if (read && path === "/v1/github/installation")
      return reply({ installation: data.installation });
    if (read && path === "/v1/github/repositories")
      return reply({ repositories: data.repositories });
    if (read && path === "/v1/github/app/install-url")
      return reply({ install_url: "/projects/00000000-0000-4000-8000-000000000001/github" });
    if (route === "/v1/analytics-settings") {
      const settings = data.analyticsSettings.get(
        projectId ?? "00000000-0000-4000-8000-000000000001"
      );
      if (!settings) return missing();
      if (method === "PATCH") {
        const parsed = objectSchema.safeParse(payload);
        if (!parsed.success) return reply({ error: "invalid_mock_payload" }, 400);
        Object.assign(settings.settings, parsed.data);
      } else if (!read) return reply({ error: "mock_method_not_supported" }, 405);
      return reply(settings);
    }
    if (route === "/v1/capture-policy" || route === "/v1/improvement-settings") {
      const records = route.endsWith("capture-policy") ? capturePolicies : improvementSettings;
      const id = projectId ?? "00000000-0000-4000-8000-000000000001";
      if (!data.projects.some((project) => project["project_id"] === id)) return missing();
      const record =
        records.get(id) ??
        structuredClone(
          route.endsWith("capture-policy") ? data.capturePolicy : data.improvementSettings
        );
      records.set(id, record);
      if (method === "PATCH") {
        const parsed = objectSchema.safeParse(payload);
        if (!parsed.success) return reply({ error: "invalid_mock_payload" }, 400);
        Object.assign(record, parsed.data);
      } else if (!read) return reply({ error: "mock_method_not_supported" }, 405);
      return route.endsWith("capture-policy")
        ? reply({ access_mode: "manage", policy: record, overrides: {} })
        : reply({ access_mode: "manage", cloud_automation_available: true, settings: record });
    }
    const window = {
      project_id: projectId ?? "00000000-0000-4000-8000-000000000001",
      from: new Date(Date.now() - 30 * 86400000).toISOString(),
      to: new Date().toISOString(),
      granularity: "day",
      service: null,
      environment: "production"
    };
    if (read && route.endsWith("/impact"))
      return reply({
        incident_id: path.split("/").at(-2),
        window,
        affected_sessions: 0,
        affected_routes: [],
        affected_funnels: [],
        top_device_types: [],
        top_browsers: [],
        journey_patterns: [],
        conversion_delta: { availability: "unavailable", value: null, unit: "percentage_points" },
        analytics_bundle: { status: "not_requested", generation_id: null, failure_reason: null }
      });
    const devices = {
      device_types: [
        { value: "desktop", sessions: 320, pageviews: 940 },
        { value: "mobile", sessions: 180, pageviews: 480 }
      ],
      browsers: [
        { value: "Chrome", sessions: 320, pageviews: 940 },
        { value: "Safari", sessions: 180, pageviews: 480 }
      ],
      os: [
        { value: "macOS", sessions: 320, pageviews: 940 },
        { value: "iOS", sessions: 180, pageviews: 480 }
      ],
      languages: [{ value: "en", sessions: 500, pageviews: 1420 }]
    };
    const referrers = [
      { value: "direct", sessions: 300, pageviews: 900 },
      { value: "search", sessions: 200, pageviews: 520 }
    ];
    if (read && route === "/v1/analytics/summary")
      return reply({
        summary: {
          ...window,
          sessions: 500,
          pageviews: 1420,
          active_visitors: 420,
          new_visitors: 300,
          returning_visitors: 120,
          exits: 490,
          conversions: 82
        },
        breakdowns: {
          ...devices,
          referrers,
          auth_states: [{ value: "anonymous", sessions: 400, pageviews: 1200 }]
        }
      });
    if (read && route === "/v1/analytics/routes")
      return reply({
        window,
        routes: ["/", "/events", "/checkout"].map((route_key, i) => ({
          route_key,
          pageviews: 600 - i * 180,
          unique_sessions: 300 - i * 80,
          entrances: 100,
          exits: 80,
          bounces: 20,
          linked_incident_sessions: i === 2 ? 12 : 0
        }))
      });
    if (read && route === "/v1/analytics/devices") return reply({ window, ...devices });
    if (read && route === "/v1/analytics/referrers")
      return reply({ window, referrers, utm_sources: [], utm_mediums: [], utm_campaigns: [] });
    if (read && route === "/v1/analytics/funnels") return reply({ window, funnels: [] });
    if (read && route === "/v1/analytics/journey-patterns") return reply({ window, patterns: [] });
    if (read && route === "/v1/analytics/saved-funnels") return reply({ funnels: [] });
    return reply(
      {
        error: "Not available in the local mock preview. Use normal development for this operation."
      },
      501
    );
  }
  return { handle };
}
