import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BundleV1Schema,
  createEventEnvelope,
  type EventEnvelope
} from "../../../packages/shared-types/src/index.js";
import {
  associateDiagnosticEvidence,
  buildEvidenceProvenance
} from "../../../packages/bundle-engine/src/diagnostic-evidence.js";
import { buildBundle, type BuildBundleInput } from "../../../packages/bundle-engine/src/index.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const scope = { kind: "operation" as const, operation_id: id(90) };
const at = (seconds: number) =>
  new Date(Date.parse("2026-10-26T00:00:00.000Z") + seconds * 1000).toISOString();
const service = { name: "api", environment: "test", runtime: "node" };
function failure(): EventEnvelope {
  return createEventEnvelope({
    event_id: id(1),
    event_type: "backend_exception",
    occurred_at: at(0),
    sdk_name: "test",
    sdk_version: "1",
    service,
    correlation: { trace_id: "trace" },
    context: { evidence_reference: { version: 1, failure_ref: id(91), scope } },
    payload: {
      name: "Error",
      message: "Failed",
      stack: "unavailable",
      handled: true,
      request: { method: "GET", path: "/", query: {}, headers: {} },
      response: { status_code: 500 },
      runtime: { version: "24" }
    }
  });
}
function observation(
  n: number,
  state:
    | "attempt_started"
    | "attempt_completed"
    | "attempt_failed"
    | "recovery_observed"
    | "failure_persisted",
  seconds = n
) {
  return {
    event: createEventEnvelope({
      event_id: id(n),
      event_type: "diagnostic_context",
      occurred_at: at(seconds),
      sdk_name: "test",
      sdk_version: "1",
      service,
      correlation: { trace_id: "trace" },
      payload: {
        version: 1,
        kind: "recovery",
        failure_ref: id(91),
        scope,
        attempt_id: id(92),
        state,
        status_code: 200
      }
    }),
    received_at: at(seconds)
  };
}
describe("typed diagnostic association", () => {
  it("keeps HTTP completion and missing terminal outcomes unknown", () => {
    const result = associateDiagnosticEvidence({
      failure: failure(),
      sources: [failure()],
      contexts: [observation(2, "attempt_started"), observation(3, "attempt_completed")]
    });
    expect(result.recovery).toMatchObject({
      outcome: "unknown",
      attempts: [{ outcome: "unknown" }]
    });
    expect(
      associateDiagnosticEvidence({ failure: failure(), sources: [failure()], contexts: [] })
        .recovery?.outcome
    ).toBe("unknown");
  });
  it("requires explicit recovery and retains conflicting outcomes deterministically", () => {
    const contexts = [observation(2, "recovery_observed"), observation(3, "failure_persisted")];
    const input = { failure: failure(), sources: [failure()], contexts };
    expect(associateDiagnosticEvidence(input).recovery?.outcome).toBe("conflicting");
    expect(associateDiagnosticEvidence(input)).toEqual(
      associateDiagnosticEvidence({ ...input, contexts: [...contexts].reverse().concat(contexts) })
    );
    expect(
      associateDiagnosticEvidence({ ...input, contexts: [contexts[0]!] }).recovery?.outcome
    ).toBe("recovered");
  });
  it("isolates service, environment, trace, scope, reference and event time", () => {
    const good = observation(2, "recovery_observed");
    const variants = [
      { ...good, event: { ...good.event, service: { ...service, name: "other" } } },
      { ...good, event: { ...good.event, service: { ...service, environment: "other" } } },
      {
        ...good,
        event: { ...good.event, correlation: { ...good.event.correlation!, trace_id: "other" } }
      },
      observation(3, "recovery_observed", -1),
      observation(4, "recovery_observed", 301),
      { ...good, received_at: at(-60) }
    ];
    for (const candidate of variants)
      expect(
        associateDiagnosticEvidence({
          failure: failure(),
          sources: [failure()],
          contexts: [candidate]
        }).events
      ).toEqual([]);
    expect(
      associateDiagnosticEvidence({ failure: null, sources: [], contexts: [good] }).events
    ).toEqual([]);
    const reused = { ...failure(), event_id: id(88), occurred_at: at(1) };
    expect(
      associateDiagnosticEvidence({
        failure: failure(),
        sources: [failure(), reused],
        contexts: [good]
      }).events
    ).toEqual([]);
  });
  it("uses authoritative failure classification when related context repeats a reference", () => {
    const original = failure(),
      related = { ...failure(), event_id: id(88) };
    const input = {
      failure: original,
      sources: [original, related],
      contexts: [observation(2, "recovery_observed")]
    };
    expect(
      associateDiagnosticEvidence({ ...input, failureEventIds: [original.event_id] }).recovery
        ?.outcome
    ).toBe("recovered");
    expect(
      associateDiagnosticEvidence({
        ...input,
        failureEventIds: [original.event_id, related.event_id]
      }).events
    ).toEqual([]);
    expect(associateDiagnosticEvidence({ ...input, failureEventIds: [] }).events).toEqual([]);
  });
  it("requires exact page/session identity and bounds attempts and observations", () => {
    const original = failure();
    const pageScope = { kind: "page" as const, page_id: id(93) };
    const pageFailure = createEventEnvelope({
      ...original,
      correlation: { session_id: "page-session" },
      context: { evidence_reference: { version: 1, failure_ref: id(91), scope: pageScope } }
    });
    const contexts = Array.from({ length: 25 }, (_, n) => {
      const item = observation(n + 2, "recovery_observed");
      if (item.event.event_type !== "diagnostic_context" || item.event.payload.kind !== "recovery")
        throw new Error("fixture");
      return {
        ...item,
        event: createEventEnvelope({
          ...item.event,
          correlation: { session_id: "page-session" },
          payload: { ...item.event.payload, scope: pageScope, attempt_id: id(100 + (n % 6)) }
        })
      };
    });
    const result = associateDiagnosticEvidence({
      failure: pageFailure,
      sources: [pageFailure],
      contexts
    });
    expect(result.recovery?.attempts).toHaveLength(5);
    expect(result.events.length).toBeLessThanOrEqual(20);
    expect(result.recovery?.truncated).toBe(true);
    expect(
      associateDiagnosticEvidence({
        failure: pageFailure,
        sources: [pageFailure],
        contexts: [
          {
            ...contexts[0]!,
            event: {
              ...contexts[0]!.event,
              correlation: {
                session_id: "other",
                trace_id: null,
                request_id: null,
                user_id_hash: null
              }
            }
          }
        ]
      }).events
    ).toEqual([]);
  });
  it("never refreshes a future event's first receipt or selects conflicting copies", () => {
    const item = observation(2, "recovery_observed", 62);
    expect(
      associateDiagnosticEvidence({
        failure: failure(),
        sources: [failure()],
        contexts: [{ ...item, received_at: at(0) }, item]
      }).events
    ).toEqual([]);
    const original = observation(2, "recovery_observed");
    const conflicting = observation(2, "failure_persisted");
    expect(
      associateDiagnosticEvidence({
        failure: failure(),
        sources: [failure()],
        contexts: [original, conflicting]
      }).events
    ).toEqual([]);
  });
  it("retains at most one late resource event with the exact source ID and 30-second bound", () => {
    const resource = (n: number, seconds: number) => ({
      event: createEventEnvelope({
        event_id: id(n),
        event_type: "diagnostic_context",
        occurred_at: at(seconds),
        sdk_name: "test",
        sdk_version: "1",
        service,
        correlation: { trace_id: "trace" },
        payload: {
          version: 1,
          kind: "resource_observation",
          failure_ref: id(91),
          scope,
          source_event_id: id(1),
          observations: {
            version: 1,
            items: [
              {
                kind: "timing",
                observed_at: at(seconds),
                source_url: "/image.png",
                availability: "observed",
                response_status: 404,
                duration_ms: 2,
                transfer_size_bytes: null
              }
            ]
          }
        }
      }),
      received_at: at(seconds)
    });
    const result = associateDiagnosticEvidence({
      failure: failure(),
      sources: [failure()],
      contexts: [resource(3, 31), resource(4, 20), resource(2, 10)]
    });
    expect(result.events.map((event) => event.event_id)).toEqual([id(2)]);
    expect(result.resources?.items[0]?.observation).toMatchObject({ response_status: 404 });
  });
  it("describes retained inputs without replacing the primary event or inferring unsupported capture", () => {
    const sources = [failure(), { ...failure(), event_id: id(8), occurred_at: at(10) }];
    const provenance = buildEvidenceProvenance({
      primary: sources[0]!,
      sources: [...sources].reverse().concat(sources),
      contexts: []
    });
    expect(provenance).toMatchObject({
      primary_event_id: id(1),
      retained_event_count: 2,
      retained_first_at: at(0),
      retained_last_at: at(10)
    });
    expect(provenance.observations.every((item) => item.availability === "unknown")).toBe(true);
  });
});

describe("primary evidence provenance", () => {
  it("continues reading the unchanged historical Bundle v1 golden", () => {
    const legacy = JSON.parse(
      readFileSync(
        new URL("../../fixtures/build-bundle.legacy.deploy-metadata.golden.json", import.meta.url),
        "utf8"
      )
    ) as unknown;
    expect(BundleV1Schema.parse(legacy).context.evidence).toBeUndefined();
  });
  function input(): BuildBundleInput {
    return {
      job: { trigger: "new_context_type" },
      incident: {
        incident_id: "incident",
        project_id: "project",
        service_id: null,
        service_runtime: "node",
        service_framework: null,
        service_name: service.name,
        environment: service.environment,
        fingerprint: "unchanged",
        title: "Failed",
        severity: "high",
        first_seen_at: at(0),
        last_seen_at: at(10),
        occurrence_count: 2,
        source_event_types: ["backend_exception"]
      },
      bundleMetadata: {
        generation_number: 3,
        created_at: at(0),
        updated_at: at(20),
        source_event_id: id(1),
        source_occurred_at: at(0)
      },
      sourceEnvelopes: [failure()],
      diagnosticContexts: [observation(2, "recovery_observed")],
      probeDataItems: []
    };
  }
  it("keeps runtime, stack, SDK and capture time attached to the selected occurrence", () => {
    const base = input(),
      newer = failure();
    if (newer.event_type !== "backend_exception") throw new Error("fixture");
    newer.event_id = id(8);
    newer.occurred_at = at(10);
    newer.payload.runtime.version = "other-runtime";
    newer.payload.stack = "at other (/srv/other.js:99:1)";
    newer.context = {};
    newer.sdk_name = "other-sdk";
    const bundle = buildBundle({ ...base, sourceEnvelopes: [newer, ...base.sourceEnvelopes] });
    expect(bundle.context.runtime?.runtime_version).toBe("24");
    expect(bundle.context.error?.stack).toBe("unavailable");
    expect(bundle.captured_at).toBe(at(0));
    expect(bundle.sdk.name).toBe("test");
    expect(bundle.signal.signal_id).toBe(id(1));
    expect(bundle.context.recovery?.outcome).toBe("recovered");
    expect(bundle.context.evidence).toMatchObject({
      primary_event_id: id(1),
      retained_event_count: 3,
      retained_first_at: at(0),
      retained_last_at: at(10)
    });
    expect(bundle.metadata.updated_at).toBe(at(20));
    expect(bundle.signal.last_seen_at).toBe(at(10));
    expect(bundle.context.error?.exception_evidence).toMatchObject({
      truncated: false,
      nodes: [{ trace_origin: "unavailable", stack: null }]
    });
    expect(
      buildBundle({ ...base, sourceEnvelopes: [...base.sourceEnvelopes, newer].reverse() })
    ).toEqual(bundle);
  });
  it("does not promote a retained neighbour when the primary input is absent", () => {
    const base = input(),
      neighbour = { ...failure(), event_id: id(8), occurred_at: at(10) };
    const bundle = buildBundle({ ...base, sourceEnvelopes: [neighbour] });
    expect(bundle.signal.signal_id).toBe(id(1));
    expect(bundle.captured_at).toBe(at(0));
    expect(bundle.context.runtime).toBeNull();
    expect(bundle.context.error?.stack).toBe("unavailable");
    expect(bundle.context.recovery).toBeUndefined();
  });
});
