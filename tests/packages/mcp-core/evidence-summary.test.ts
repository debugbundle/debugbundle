import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { projectEvidenceSummary } from "../../../packages/mcp-core/src/evidence-summary.js";
import {
  projectOpenAiToolOutput,
  validateOpenAiToolOutput
} from "../../../packages/mcp-core/src/index.js";
it("projects the same interpretation without raw causes, identifiers, stacks or payloads", () => {
  const body = JSON.parse(
    readFileSync(
      new URL("../../fixtures/build-bundle.deploy-metadata.golden.json", import.meta.url),
      "utf8"
    )
  ) as Record<string, unknown>;
  const summary = projectEvidenceSummary(body);
  expect(summary).toMatchObject({
    status: "partial",
    retained_event_count: 1,
    trace_origin: "unavailable",
    recovery: "unknown"
  });
  expect(JSON.stringify(summary)).not.toContain("00000000-");
  expect(JSON.stringify(summary)).not.toContain("TypeError at checkout");
  const output = projectOpenAiToolOutput("get_bundle", {
    incident_id: "inc_1",
    status: "ready",
    artifact: {
      bundle_version: 1,
      primary_signal: {
        description: "Failed",
        error_type: "Error",
        error_message: "Failed",
        request_method: null,
        request_path: null,
        route_template: null,
        response_status: null,
        first_application_frame: null
      },
      deploy: {
        commit_sha: null,
        deploy_version: null,
        branch: null,
        deployed_at: null,
        regression_window: null
      },
      redaction: null,
      suggested_next_checks: [],
      evidence_summary: {
        ...summary,
        exception_evidence: { nodes: [{ message: "RAW_CAUSE_MUST_NOT_APPEAR" }] },
        failure_ref: "RAW_REFERENCE",
        payload: "RAW_PAYLOAD"
      }
    },
    manifest: {
      artifact_type: "bundle",
      redacted: true,
      truncated: false,
      size_bytes: 1,
      omitted_fields: []
    },
    message: "Ready",
    continuation_url: "https://debugbundle.com/incidents/inc_1"
  });
  expect(validateOpenAiToolOutput("get_bundle", output)).toEqual(output);
  const serialized = JSON.stringify(output);
  expect(serialized).toContain('"evidence_summary"');
  expect(serialized).not.toContain("RAW_");
});
