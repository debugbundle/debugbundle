import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  EventEnvelopeSchema,
  createEventEnvelope
} from "../../../packages/shared-types/src/index.js";
import { ExceptionEvidenceV1Schema } from "../../../packages/shared-types/src/exception-evidence.js";
import { DiagnosticContextPayloadSchema } from "../../../packages/shared-types/src/diagnostic-context.js";
import { classifyEvent } from "../../../packages/event-normalizer/src/index.js";
import {
  PRESET_DEFAULTS,
  shouldCaptureEvent
} from "../../../packages/shared-types/src/capture-policy.js";

const failure = "11111111-1111-4111-8111-111111111111";
const attempt = "22222222-2222-4222-8222-222222222222";
const page = "33333333-3333-4333-8333-333333333333";
const observation = () => ({
  version: 1 as const,
  kind: "recovery" as const,
  failure_ref: failure,
  scope: { kind: "page" as const, page_id: page },
  attempt_id: attempt,
  state: "attempt_completed" as const,
  status_code: 200
});

describe("typed diagnostic context", () => {
  it("keeps the neutral SDK corpus aligned with accepting schema refinements", () => {
    const corpus = JSON.parse(
      readFileSync(
        new URL("../../fixtures/evidence/evidence-wire-cases.json", import.meta.url),
        "utf8"
      )
    ) as { events: Array<{ id: string; valid: boolean; event: unknown }> };
    for (const fixture of corpus.events)
      expect(EventEnvelopeSchema.safeParse(fixture.event).success, fixture.id).toBe(fixture.valid);
  });
  it("bounds all added exception JSON together while preserving legacy custom context", () => {
    const graph = {
      version: 1,
      runtime: "browser",
      root_id: 0,
      truncated: false,
      unavailable_reason: null,
      nodes: [0, 1].map((id) => ({
        id,
        name: "Error",
        message: "failure",
        stack: "x".repeat(14 * 1024),
        trace_origin: "runtime_reported",
        parsing_status: "unparsed",
        frames: [],
        relationships: id === 0 ? [{ kind: "cause", target_id: 1 }] : []
      }))
    };
    expect(ExceptionEvidenceV1Schema.safeParse(graph).success).toBe(true);
    const event = createEventEnvelope({
      event_type: "frontend_exception",
      service: { name: "web", environment: "test" },
      payload: {
        name: "Error",
        message: "failure",
        stack: "unavailable",
        route: "/",
        browser: { name: "test", version: "1" },
        breadcrumbs: []
      }
    });
    const observations = {
      version: 1,
      items: Array.from({ length: 5 }, () => ({
        kind: "timing",
        observed_at: event.occurred_at,
        source_url: `https://cdn.example/${"x".repeat(1800)}`,
        availability: "withheld",
        response_status: null,
        duration_ms: null,
        transfer_size_bytes: null
      }))
    };
    expect(
      EventEnvelopeSchema.safeParse({
        ...event,
        payload: {
          ...event.payload,
          exception_evidence: graph,
          resource_observations: observations
        }
      }).success
    ).toBe(false);
    expect(
      EventEnvelopeSchema.safeParse({
        ...event,
        context: { evidence_reference: "x".repeat(40 * 1024) }
      }).success
    ).toBe(true);
  });
  it.each([
    "attempt_started",
    "attempt_completed",
    "attempt_failed",
    "recovery_observed",
    "failure_persisted"
  ])("accepts the closed recovery state %s", (state) => {
    expect(DiagnosticContextPayloadSchema.safeParse({ ...observation(), state }).success).toBe(
      true
    );
  });
  it("accepts independent context without an exception or probe activation", () => {
    const event = createEventEnvelope({
      event_type: "diagnostic_context",
      service: { name: "web", environment: "test" },
      correlation: { session_id: "synthetic-session" },
      payload: observation()
    });
    expect(EventEnvelopeSchema.safeParse(event).success).toBe(true);
    expect(classifyEvent(event.event_type, "fatal", attempt)).toBe("context_signal");
    expect(
      shouldCaptureEvent(
        { preset: "minimal", ...PRESET_DEFAULTS.minimal },
        event.event_type,
        event.payload
      )
    ).toBe(false);
    expect(
      shouldCaptureEvent(
        { preset: "balanced", ...PRESET_DEFAULTS.balanced },
        event.event_type,
        event.payload
      )
    ).toBe(true);
  });
  it("keeps minimal disabled even with an explicit independent-context override", () => {
    expect(
      shouldCaptureEvent(
        { preset: "minimal", ...PRESET_DEFAULTS.minimal, capture_diagnostic_context: true },
        "diagnostic_context",
        observation()
      )
    ).toBe(false);
  });
  it("retains unrelated historical custom context without treating it as a typed reference", () => {
    const event = createEventEnvelope({
      event_type: "log_event",
      service: { name: "legacy", environment: "test" },
      context: { evidence_reference: "historical custom value" },
      payload: { level: "error", message: "Original failure", attributes: {} }
    });
    expect(event.context?.["evidence_reference"]).toBe("historical custom value");
  });
  it("requires a page session and fresh opaque v4 references", () => {
    const event = {
      schema_version: "2026-03-01",
      event_id: failure,
      event_type: "diagnostic_context",
      sdk_name: "test",
      sdk_version: "1.0.0",
      occurred_at: "2026-10-26T00:00:00.000Z",
      service: { name: "web", environment: "test" },
      payload: observation()
    };
    expect(EventEnvelopeSchema.safeParse(event).success).toBe(false);
    expect(
      DiagnosticContextPayloadSchema.safeParse({ ...observation(), failure_ref: "customer-42" })
        .success
    ).toBe(false);
    expect(
      DiagnosticContextPayloadSchema.safeParse({
        ...observation(),
        attempt_id: "22222222-2222-1222-8222-222222222222"
      }).success
    ).toBe(false);
    expect(
      EventEnvelopeSchema.safeParse({
        ...event,
        payload: { ...observation(), scope: { kind: "operation", operation_id: page } }
      }).success
    ).toBe(true);
  });
  it.each([
    { kind: "arbitrary", data: {} },
    { ...observation(), data: { secret: "value" } },
    { ...observation(), state: "resolved" },
    { ...observation(), status_code: 0 },
    { ...observation(), duration_ms: -1 },
    { ...observation(), operation: "x".repeat(65) }
  ])("rejects undeclared or malformed diagnostic fields", (payload) => {
    expect(DiagnosticContextPayloadSchema.safeParse(payload).success).toBe(false);
  });
  it("keeps status zero, report-only CSP and asset status distinct", () => {
    const resource = {
      version: 1,
      kind: "resource_observation",
      failure_ref: failure,
      scope: observation().scope,
      source_event_id: failure,
      observations: {
        version: 1,
        items: [
          {
            kind: "timing",
            observed_at: "2026-10-26T00:00:01.000Z",
            source_url: "https://static.example.test/a.png",
            availability: "withheld",
            response_status: null,
            duration_ms: 0,
            transfer_size_bytes: 0
          }
        ]
      }
    };
    expect(DiagnosticContextPayloadSchema.safeParse(resource).success).toBe(true);
    const timing = resource.observations.items[0]!;
    expect(
      DiagnosticContextPayloadSchema.safeParse({
        ...resource,
        observations: { version: 1, items: [{ ...timing, response_status: 0 }] }
      }).success
    ).toBe(false);
    expect(
      DiagnosticContextPayloadSchema.safeParse({
        ...resource,
        observations: {
          version: 1,
          items: [
            {
              kind: "csp",
              observed_at: timing.observed_at,
              source_url: timing.source_url,
              effective_directive: "img-src",
              disposition: "report",
              document_status_code: 200
            }
          ]
        }
      }).success
    ).toBe(true);
  });
  it.each([
    "https://user:pass@static.example.test/a",
    "https://static.example.test/a?secret=value",
    "https://static.example.test/a#secret",
    "data:text/html,private"
  ])("rejects an unsanitised resource identity %s", (source_url) => {
    expect(
      DiagnosticContextPayloadSchema.safeParse({
        version: 1,
        kind: "resource_observation",
        failure_ref: failure,
        scope: observation().scope,
        source_event_id: failure,
        observations: {
          version: 1,
          items: [
            {
              kind: "csp",
              source_url,
              observed_at: "2026-10-26T00:00:01.000Z",
              effective_directive: "img-src",
              disposition: "enforce",
              document_status_code: null
            }
          ]
        }
      }).success
    ).toBe(false);
  });
});
