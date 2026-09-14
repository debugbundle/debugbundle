import { expect, it } from "vitest";
import { mapPrimarySignal } from "../../../apps/api/src/openai-mcp-projections.js";
import { projectOpenAiToolOutput } from "../../../packages/mcp-core/src/openai-contract.js";
import { projectBrowserEvidence } from "../../../packages/mcp-core/src/browser-evidence.js";

const capturedAt = "2026-09-13T12:00:00.000Z";
function bundle() {
  return {
    captured_at: capturedAt,
    signal: { signal_type: "frontend_exception" },
    summary: { error_type: "Error", error_message: "Window error" },
    context: {
      error: { name: "Error", message: "Window error" },
      frontend: {
        exceptions: [
          {
            name: "Error",
            message: "Window error",
            ts: capturedAt,
            route: "/checkout/123?token=secret#payment",
            browser_event: {
              kind: "resource_error",
              opaque: true,
              file_name: "https://user:secret@cdn.example/app.js?token=secret#load",
              line_number: 42,
              column_number: 9,
              target: {
                tag_name: "script",
                source_url: "https://user:secret@cdn.example/app.js?token=secret",
                outerHTML: "private text"
              },
              page: {
                url: "https://app.example/checkout/123?token=secret",
                ready_state: "complete",
                visibility_state: "visible",
                referrer: "private referrer"
              }
            }
          }
        ]
      }
    }
  };
}

it("exposes bounded browser clues and the route without treating a resource as an application stack", () => {
  const signal = mapPrimarySignal(bundle());
  expect(signal).toMatchObject({
    route_template: "/checkout/{param}",
    first_application_frame: null,
    browser_context: {
      kind: "resource_error",
      opaque: true,
      source_file: "/app.js",
      line: 42,
      column: 9,
      resource_type: "script",
      resource_host: "cdn.example",
      resource_path: "/app.js",
      ready_state: "complete",
      visibility_state: "visible"
    }
  });
  expect(JSON.stringify(signal)).not.toMatch(/secret|private text|private referrer|https:/);
});

it("retains additive browser evidence through the public output allowlist", () => {
  const projected = projectOpenAiToolOutput("get_incident_context", {
    incident: {
      incident_id: "00000000-0000-4000-8000-000000000001",
      project_id: "00000000-0000-4000-8000-000000000002",
      service_name: "web",
      environment: "production",
      title: "Window error",
      severity: "low",
      status: "open",
      first_seen_at: capturedAt,
      last_seen_at: capturedAt,
      occurrence_count: 1,
      regressed_at: null,
      dashboard_url: "https://app.debugbundle.com/projects/test"
    },
    primary_signal: mapPrimarySignal(bundle()),
    bundle_status: "ready",
    reproduction_status: "missing",
    deploy: {
      commit_sha: null,
      deploy_version: null,
      branch: null,
      deployed_at: null,
      regression_window: false
    },
    redaction: null,
    suggested_next_checks: [],
    continuation_url: "https://app.debugbundle.com/projects/test"
  });
  expect(projected).toHaveProperty("primary_signal.browser_context.resource_host", "cdn.example");
});

it("does not borrow browser context from another primary failure or a later occurrence", () => {
  const other = bundle();
  other.signal.signal_type = "backend_exception";
  expect(mapPrimarySignal(other)).not.toHaveProperty("browser_context");
  const later = bundle();
  later.context.frontend.exceptions[0]!.ts = "2026-09-14T12:00:00.000Z";
  expect(mapPrimarySignal(later)).not.toHaveProperty("browser_context");
});

it.each([
  [{ kind: "window_error", opaque: true, message: "Script error." }, "browser_details_withheld"],
  [{ kind: "window_error", opaque: true, message: "Window error" }, "context_missing"],
  [{ kind: "window_error", opaque: false }, "details_available"],
  [{}, "context_missing"]
])("reports browser evidence limitations precisely: %j", (browserEvent, status) => {
  const input = bundle();
  const entry = input.context.frontend.exceptions[0]!;
  const result = projectBrowserEvidence({
    ...input,
    context: { frontend: { exceptions: [{ ...entry, browser_event: browserEvent }] } }
  });
  expect(result?.context["evidence_status"]).toBe(status);
  expect(result?.context["line"]).toBeNull();
});

it("bounds evidence selection and ignores invalid URLs, timestamps, and unrelated fields", () => {
  const input = bundle();
  const entry = input.context.frontend.exceptions[0]!;
  const invalid = {
    ...entry,
    route: null,
    browser_event: {
      file_name: "javascript:private()",
      line_number: -1,
      column_number: 1.5,
      page: { url: "data:text/plain,private", ready_state: "private", visibility_state: "private" },
      target: { source_url: "http://[broken]" }
    }
  };
  const project = (exceptions: unknown, captured_at = capturedAt) =>
    projectBrowserEvidence({
      captured_at,
      summary: { primary_signal: "frontend_exception" },
      context: { error: { message: "Window error" }, frontend: { exceptions } }
    });
  expect(project([invalid])).toMatchObject({
    route: null,
    context: {
      source_file: null,
      resource_host: null,
      resource_path: null,
      ready_state: null,
      visibility_state: null
    }
  });
  expect(project([entry], "invalid")).toBeNull();
  expect(project(null)).toBeNull();
  expect(
    project([null, [], { ...entry, ts: "invalid" }, { ...entry, message: "Another failure" }])
  ).toBeNull();
  expect(
    project([entry, ...Array.from({ length: 50 }, () => ({ message: "another" }))])
  ).toBeNull();
  const relative = {
    ...entry,
    route: "/users/123e4567-e89b-42d3-a456-426614174000",
    browser_event: { target: { source_url: "/assets/app.js" }, page: { url: "x".repeat(8193) } }
  };
  expect(project([relative, { ...entry, ts: "2026-09-12T12:00:00Z" }])).toMatchObject({
    route: "/users/{param}",
    context: { resource_path: "/assets/app.js", resource_host: null }
  });
});
