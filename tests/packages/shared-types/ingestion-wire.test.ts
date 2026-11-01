import { expect, it } from "vitest";
import {
  createEventEnvelope,
  EVENT_ENVELOPE_MAX_WIRE_BYTES,
  fitEventToIngestionWire,
  partitionEventsForIngestion
} from "../../../packages/shared-types/src/index.js";

function event() {
  return createEventEnvelope({
    event_type: "backend_exception",
    service: { name: "api", environment: "test" },
    payload: {
      name: "Error",
      message: "original",
      stack: "retained",
      handled: true,
      request: { method: "GET", path: "/", query: {}, headers: {} },
      response: { status_code: 503 },
      runtime: { version: "fixture" }
    },
    context: { padding: "" }
  });
}
const bytes = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), "utf8");

it("keeps owned admissible events and counts actual escaped UTF-8 at the wire boundary", () => {
  const input = event();
  input.context!["padding"] = "x".repeat(EVENT_ENVELOPE_MAX_WIRE_BYTES - bytes(input));
  expect(fitEventToIngestionWire(input)).toBe(input);
  input.context!["padding"] = `${String(input.context!["padding"]).slice(1)}é`;
  expect(fitEventToIngestionWire(input)).toBeNull();
});

it("removes a valid optional reference only when necessary to preserve the primary", () => {
  const input = event();
  input.context!["padding"] = "x".repeat(EVENT_ENVELOPE_MAX_WIRE_BYTES - bytes(input));
  input.context!["evidence_reference"] = {
    version: 1,
    failure_ref: "11111111-1111-4111-8111-111111111111",
    scope: { kind: "operation", operation_id: "22222222-2222-4222-8222-222222222222" }
  };
  const output = fitEventToIngestionWire(input);
  expect(output?.event_id).toBe(input.event_id);
  expect(output?.payload).toEqual(input.payload);
  expect(output?.context).not.toHaveProperty("evidence_reference");
  expect(input.context).toHaveProperty("evidence_reference");
  expect(bytes(output)).toBe(EVENT_ENVELOPE_MAX_WIRE_BYTES);
  input.context!["evidence_reference"] = "application-defined";
  expect(fitEventToIngestionWire(input)).toBeNull();
});

it("drops optional execution before the primary and omits a budget marker when even it cannot fit", () => {
  const input = event();
  input.context!["padding"] = "x".repeat(EVENT_ENVELOPE_MAX_WIRE_BYTES - bytes(input));
  input.payload.execution = {
    version: 1,
    kind: "job",
    name: null,
    elapsed_ms: null,
    limit_ms: null
  };
  const output = fitEventToIngestionWire(input);
  expect(output?.payload).not.toHaveProperty("execution");
  expect(output?.payload).toMatchObject({ message: "original", stack: "retained" });
  expect(output?.context).toEqual(input.context);
  expect(bytes(output)).toBe(EVENT_ENVELOPE_MAX_WIRE_BYTES);
});

it("partitions final escaped UTF-8 bytes including the request wrapper and commas", () => {
  const events = Array.from({ length: 40 }, () => {
    const input = event();
    input.context!["padding"] = "é\n\u0001".repeat(4000);
    return input;
  });
  const batches = partitionEventsForIngestion(events);
  expect(batches).not.toBeNull();
  expect(batches!.length).toBeGreaterThan(1);
  expect(batches!.flat().map((item) => item.event_id)).toEqual(events.map((item) => item.event_id));
  for (const batch of batches!) expect(bytes({ events: batch })).toBeLessThanOrEqual(256 * 1024);
  expect(partitionEventsForIngestion([])).toEqual([]);
});
it("preflights the entire input and fails closed when a primary cannot fit", () => {
  const oversized = event();
  oversized.payload.message = "x".repeat(256 * 1024);
  expect(partitionEventsForIngestion([event(), oversized, event()])).toBeNull();
});
