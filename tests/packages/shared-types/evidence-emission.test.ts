import { expect, it } from "vitest";
import { createEventEnvelope } from "../../../packages/shared-types/src/index.js";
import {
  EvidenceDeliveryState,
  stripUnsupportedEvidence
} from "../../../packages/shared-types/src/evidence-emission.js";
const pin = { version: 1, features: ["exception_evidence_v1", "recovery_v1"] };
it("keeps independent per-instance proof and downgrades on missing or invalid discovery", () => {
  const first = new EvidenceDeliveryState(pin),
    other = new EvidenceDeliveryState();
  expect(first.supports("exception_evidence_v1")).toBe(true);
  expect(other.supports("exception_evidence_v1")).toBe(false);
  first.observe(undefined);
  expect(first.supports("exception_evidence_v1")).toBe(false);
  first.observe(pin);
  expect(first.supports("recovery_v1")).toBe(true);
  first.observe({ version: 1, features: ["unknown"] });
  expect(first.supports("recovery_v1")).toBe(false);
});
it("strips unsupported additions without changing original error identity or message", () => {
  const event = createEventEnvelope({
    event_type: "backend_exception",
    service: { name: "api", environment: "test" },
    context: {
      preserved: true,
      evidence_reference: {
        version: 1,
        failure_ref: "11111111-1111-4111-8111-111111111111",
        scope: { kind: "operation", operation_id: "22222222-2222-4222-8222-222222222222" }
      }
    },
    payload: {
      name: "Error",
      message: "original",
      stack: "unavailable",
      handled: true,
      request: { method: "GET", path: "/", query: {}, headers: {} },
      response: { status_code: 500 },
      runtime: { version: "24" },
      execution: { version: 1, kind: "request", name: "/", elapsed_ms: 2, limit_ms: null }
    }
  });
  const result = stripUnsupportedEvidence(event, { version: 1, features: [] });
  expect(result?.event_id).toBe(event.event_id);
  expect(result?.payload).toMatchObject({ message: "original" });
  expect(result?.context).toEqual({ preserved: true });
  expect(result?.payload).not.toHaveProperty("execution");
  expect(event.context).toHaveProperty("evidence_reference");
  expect(event.payload).toHaveProperty("execution");
});
it("drops unsupported standalone context and retains supported recovery without granting policy permission", () => {
  const event = createEventEnvelope({
    event_type: "diagnostic_context",
    service: { name: "api", environment: "test" },
    payload: {
      version: 1,
      kind: "recovery",
      failure_ref: "11111111-1111-4111-8111-111111111111",
      scope: { kind: "operation", operation_id: "22222222-2222-4222-8222-222222222222" },
      attempt_id: "33333333-3333-4333-8333-333333333333",
      state: "attempt_started"
    }
  });
  expect(stripUnsupportedEvidence(event, undefined)).toBeNull();
  expect(stripUnsupportedEvidence(event, pin)).toBe(event);
});
