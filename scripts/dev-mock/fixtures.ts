import { base } from "./base.js";

export type MockRecord = Record<string, unknown>;

/** Recreated on server restart; dates track today so dashboard filters stay useful. */
export function createDevMockFixtures() {
  const now = new Date().toISOString();
  const dated = (record: MockRecord): MockRecord => ({
    ...structuredClone(record),
    created_at: now,
    updated_at: now
  });
  const project = (id: string, name: string, slug: string, color: string): MockRecord => ({
    ...dated(base.projects),
    project_id: id,
    name,
    slug,
    color_tag: color,
    owner_email: "demo@example.test",
    metrics: {
      ...base.projects.metrics,
      open_incidents: id === "00000000-0000-4000-8000-000000000001" ? 22 : 0,
      attention_incidents_today: id === "00000000-0000-4000-8000-000000000001" ? 22 : 0,
      opened_incidents_today: id === "00000000-0000-4000-8000-000000000001" ? 23 : 0
    }
  });
  const projects = [
    project("00000000-0000-4000-8000-000000000001", "SayCheese", "saycheese", "lime"),
    project("00000000-0000-4000-8000-000000000002", "TaskTime App", "tasktime", "blue"),
    project(
      "00000000-0000-4000-8000-000000000003",
      "Healthbrain Patients",
      "healthbrain-patients",
      "emerald"
    )
  ];
  const check = (
    id: string,
    projectId: string,
    name: string,
    overrides: MockRecord = {}
  ): MockRecord => ({
    ...dated(base.checks),
    check_id: id,
    project_id: projectId,
    name,
    last_checked_at: now,
    next_check_at: now,
    ...overrides
  });
  const checks = [
    check(
      "10000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000001",
      "Events page health"
    ),
    check(
      "10000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000001",
      "Web health"
    ),
    check(
      "10000000-0000-4000-8000-000000000003",
      "00000000-0000-4000-8000-000000000001",
      "API health"
    ),
    check(
      "10000000-0000-4000-8000-000000000004",
      "00000000-0000-4000-8000-000000000002",
      "New health",
      {
        status: "unknown",
        last_checked_at: null,
        last_result_status: null,
        last_result_http_status: null,
        last_result_duration_ms: null
      }
    ),
    check(
      "10000000-0000-4000-8000-000000000005",
      "00000000-0000-4000-8000-000000000003",
      "patients-api",
      {
        service_name: "patients-api",
        status: "failing",
        consecutive_failures: 6,
        consecutive_successes: 0,
        last_result_status: "failure",
        last_result_http_status: 503,
        linked_incident_id: "inc_down",
        linked_incident_status: "open"
      }
    )
  ];
  const rollups = checks
    .flatMap((item) =>
      Array.from({ length: 30 }, (_, i): MockRecord[] => {
        if (
          item["check_id"] === "10000000-0000-4000-8000-000000000004" ||
          (item["check_id"] === "10000000-0000-4000-8000-000000000001" && i < 29)
        )
          return [];
        const day = new Date();
        day.setUTCDate(day.getUTCDate() - (29 - i));
        const failed =
          item["check_id"] === "10000000-0000-4000-8000-000000000003" && i === 28
            ? 85
            : item["check_id"] === "10000000-0000-4000-8000-000000000005" && i === 29
              ? 6
              : item["check_id"] === "10000000-0000-4000-8000-000000000002" && i === 8
                ? 2
                : 0;
        return [
          {
            check_id: item["check_id"],
            project_id: item["project_id"],
            day: day.toISOString().slice(0, 10),
            state: failed === 6 ? "down" : failed ? "degraded" : "operational",
            total_checks: 100,
            successful_checks: 100 - failed,
            failed_checks: failed,
            degraded_checks: failed,
            avg_duration_ms: 120,
            first_checked_at: day.toISOString(),
            last_checked_at: day.toISOString(),
            downtime_seconds: failed * 60,
            incident_ids: failed === 6 ? ["inc_down"] : []
          }
        ];
      })
    )
    .flat();
  const stackTitle =
    "java.lang.IllegalStateException: Unable to process request " +
    "at {dynamic}//io.undertow.servlet.handlers.FilterHandler.doFilter(FilterHandler.java:{dynamic}) ".repeat(
      80
    );
  const incidents = Array.from(
    { length: 23 },
    (_, i): MockRecord => ({
      ...dated(base.incidents),
      incident_id: i === 0 ? "inc_long" : i === 1 ? "inc_normal" : `inc_${i}`,
      title:
        i === 0
          ? stackTitle
          : i === 1
            ? "Image failed to load: checkout-preview.webp (cdn.example.test)"
            : `Request failed: POST /checkout/${i}`,
      status: i === 1 ? "resolved" : "open",
      resolved_at: i === 1 ? now : null,
      first_seen_at: now,
      last_seen_at: now,
      occurrence_count: i + 1
    })
  );
  incidents.push({
    ...incidents[2],
    incident_id: "inc_down",
    project_id: "00000000-0000-4000-8000-000000000003",
    project_name: "Healthbrain Patients",
    project_color_tag: "emerald",
    service_name: "patients-api",
    title: "Health check failed: patients-api",
    occurrence_count: 6
  });
  const repeat = (record: MockRecord, count: number, idKey: string, prefix: string): MockRecord[] =>
    Array.from({ length: count }, (_, i) => ({ ...dated(record), [idKey]: `${prefix}_${i}` }));
  const improvements = repeat(base.improvements, 23, "improvement_id", "imp").map((record, i) => ({
    ...record,
    title: `Warning hotspot: payment provider warning ${i + 1}`,
    first_detected_at: now,
    last_detected_at: now,
    bundle_created_at: now,
    bundle_updated_at: now
  }));
  const captureRules = repeat(base.captureRules, 8, "id", "rule").map((record, i) => ({
    ...record,
    name: `Demote analytics resource errors ${i + 1}`,
    last_matched_at: now
  }));
  const githubRules = repeat(base.githubRules, 2, "rule_id", "ghr").map((record, i) => ({
    ...record,
    name: i ? "Production alerts" : "Default triage rule"
  }));
  const deliveries = repeat(base.deliveries, 5, "delivery_id", "gdd").map((record, i) => ({
    ...record,
    rule_id: "ghr_0",
    incident_id: i ? `inc_${i}` : "inc_long",
    target_title: i === 4 ? "Successful delivery" : `Request failed: POST /checkout/${i}`,
    status: i === 4 ? "delivered" : "failed",
    last_attempt_at: now,
    last_error: i === 4 ? null : "github_dispatch_http_error_422"
  }));
  const alerts = repeat(base.alerts, 3, "alert_id", "alert").map((record, i) => ({
    ...record,
    cooldown_seconds: i === 1 ? 0 : 86400,
    config: { to: "demo@example.test" }
  }));
  const opportunities: MockRecord[] = repeat(base.opportunities, 23, "opportunity_id", "opp").map(
    (record, i) => ({
      ...record,
      title: `Checkout completion drops after shipping ${i + 1}`,
      bundle_generation_id: `gen_${i}`,
      first_detected_at: now,
      last_detected_at: now,
      bundle_created_at: now,
      bundle_updated_at: now
    })
  );
  const bundles: MockRecord[] = repeat(base.bundles, 23, "generation_id", "gen").map(
    (record, i) => ({
      ...record,
      opportunity_id: `opp_${i}`,
      completed_at: now
    })
  );
  return {
    session: {
      ...base.session,
      email: "demo@example.test",
      created_at: now,
      expires_at: new Date(Date.now() + 86400000).toISOString()
    },
    projects,
    checks,
    rollups,
    incidents,
    improvements,
    captureRules,
    githubRules,
    deliveries,
    alerts,
    opportunities,
    bundles,
    analyticsSettings: new Map(
      projects.map((p) => [
        String(p["project_id"]),
        {
          ...structuredClone(base.analyticsSettings),
          settings: {
            ...structuredClone(base.analyticsSettings.settings),
            enabled: p["project_id"] === "00000000-0000-4000-8000-000000000001"
          }
        }
      ])
    ),
    installation: dated(base.installation),
    repo: dated(base.repo),
    repositories: [structuredClone(base.repositories)],
    capturePolicy: {
      preset: "balanced",
      capture_logs: "warning",
      capture_request_events: "failures_only",
      capture_breadcrumbs: "exception_only",
      capture_probe_events: "buffer_only",
      immediate_client_error_statuses: []
    } as MockRecord,
    improvementSettings: {
      automated_improvement_bundles_enabled: true,
      improvement_bundle_sensitivity: "balanced"
    } as MockRecord
  };
}
