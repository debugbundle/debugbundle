import { describe, expect, it } from "vitest";
import { buildBundle, type BuildBundleInput } from "../../../packages/bundle-engine/src/index.js";
import { parseStackFrames } from "../../../packages/bundle-engine/src/stack-frames.js";
import {
  classifyEvent,
  fingerprint,
  normalizeEvent,
  validateEvent
} from "../../../packages/event-normalizer/src/index.js";
import { validateEventAtAdmission } from "../../../packages/event-normalizer/src/admission.js";
import { rustSdkEvents } from "../../helpers/rust-sdk-fixtures.js";

describe("Rust artifact evidence reader", () => {
  it("accepts real local arrays and keeps optional evidence outside the incident fingerprint", () => {
    const events = rustSdkEvents();
    for (const event of events) {
      expect(validateEvent(event).success).toBe(true);
      expect(validateEventAtAdmission(event, event.occurred_at).success).toBe(true);
      expect(event.sdk_name).toBe("@debugbundle/sdk-rust");
      expect(event.service.runtime).toBe("rust");
      expect(classifyEvent(event.event_type)).toBe(
        event.event_type === "backend_exception" ? "incident_signal" : "context_signal"
      );
    }
    const primary = events.find((event) => event.event_type === "backend_exception");
    if (!primary || primary.event_type !== "backend_exception")
      throw new Error("Missing Rust primary fixture");
    const legacy = structuredClone(primary);
    delete legacy.payload.exception_evidence;
    delete legacy.payload.execution;
    delete legacy.payload.probe_data;
    delete legacy.context;
    expect(fingerprint(normalizeEvent(primary))).toBe(fingerprint(normalizeEvent(legacy)));
    expect(parseStackFrames(primary.payload.stack, "unknown").frames).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          function: "checkout::authorize",
          file: "/srv/src/checkout.rs",
          line: 42,
          column: 7
        })
      ])
    );
    expect(JSON.stringify(events)).not.toContain("BROWSER_SECRET");
  });

  it("preserves Rust graph, execution, recovery and event identity deterministically in Bundle v1", () => {
    const events = rustSdkEvents();
    const primary = events.find((event) => event.event_type === "backend_exception");
    if (!primary) throw new Error("Missing Rust primary fixture");
    const diagnostics = events
      .filter((event) => event.event_type === "diagnostic_context")
      .map((event) => ({ event, received_at: event.occurred_at }));
    const input: BuildBundleInput = {
      job: { trigger: "new_context_type" },
      incident: {
        incident_id: "rust-incident",
        project_id: "rust-project",
        service_id: null,
        service_runtime: "rust",
        service_framework: null,
        service_name: primary.service.name,
        environment: primary.service.environment,
        fingerprint: fingerprint(normalizeEvent(primary)),
        title: "CheckoutFailure",
        severity: "high",
        first_seen_at: primary.occurred_at,
        last_seen_at: primary.occurred_at,
        occurrence_count: 1,
        source_event_types: ["backend_exception"]
      },
      bundleMetadata: {
        generation_number: 1,
        created_at: primary.occurred_at,
        updated_at: primary.occurred_at,
        source_event_id: primary.event_id,
        source_occurred_at: primary.occurred_at
      },
      sourceEnvelopes: [primary],
      diagnosticContexts: diagnostics,
      probeDataItems: []
    };
    const bundle = buildBundle(input);
    expect(bundle.service.runtime).toBe("rust");
    expect(bundle.sdk.name).toBe("@debugbundle/sdk-rust");
    expect(bundle.context.error?.exception_evidence?.runtime).toBe("unknown");
    expect(bundle.context.error?.exception_evidence?.nodes).toHaveLength(2);
    expect(bundle.context.recovery?.outcome).toBe("recovered");
    expect(bundle.context.evidence?.primary_event_id).toBe(primary.event_id);
    expect(bundle.signal.occurrence_count).toBe(1);
    expect(bundle.context.execution).toMatchObject({ kind: "command", name: "checkout.retry" });
    expect(JSON.stringify(bundle)).toBe(
      JSON.stringify(buildBundle({ ...input, diagnosticContexts: [...diagnostics].reverse() }))
    );
  });
});
