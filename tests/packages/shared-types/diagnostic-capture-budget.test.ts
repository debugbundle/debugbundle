import { expect, it } from "vitest";
import { DiagnosticCaptureBudget } from "../../../packages/shared-types/src/diagnostic-capture-budget.js";
import type {
  DiagnosticContextPayload,
  EvidenceReference
} from "../../../packages/shared-types/src/diagnostic-context.js";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const reference = (n = 1): EvidenceReference => ({
  version: 1,
  failure_ref: id(n),
  scope: { kind: "operation", operation_id: id(999) }
});
const payload = (failure = 1, attempt = 100): DiagnosticContextPayload => ({
  ...reference(failure),
  kind: "recovery",
  attempt_id: id(attempt),
  state: "attempt_started"
});
it("bounds collected observations/attempts independently from pending byte release", () => {
  const budget = new DiagnosticCaptureBudget();
  for (let n = 0; n < 20; n++)
    expect(budget.reserve(id(n + 200), payload(1, 100 + (n % 5)), 500, n)).toBe(true);
  expect(budget.reserve(id(500), payload(), 500, 21)).toBe(false);
  budget.release(Array.from({ length: 20 }, (_, n) => id(n + 200)));
  expect(budget.reserve(id(501), payload(), 500, 22)).toBe(false);
  expect(budget.reserve(id(502), payload(2, 100), 500, 22)).toBe(true);
  for (let n = 1; n <= 4; n++)
    expect(budget.reserve(id(502 + n), payload(2, 100 + n), 500, 22)).toBe(true);
  expect(budget.reserve(id(508), payload(2, 105), 500, 22)).toBe(false);
});
it("bounds fifty failure scopes and 64 KiB accounted state plus pending payloads", () => {
  const budget = new DiagnosticCaptureBudget();
  for (let n = 1; n <= 50; n++)
    expect(budget.registerFailure(reference(n), id(n + 100), 0)).toBe(true);
  expect(budget.registerFailure(reference(51), id(151), 0)).toBe(false);
  expect(budget.reserve(id(500), payload(), 64 * 1024, 1)).toBe(false);
  expect(budget.reserve(id(501), payload(), 1024, 1)).toBe(true);
  expect(budget.accountedBytes).toBeLessThanOrEqual(64 * 1024);
  expect(budget.adjust(id(501), 64 * 1024)).toBe(false);
  budget.clear();
  expect(budget.accountedBytes).toBe(0);
});
it("retains offline pending ownership, expires unused scopes and rejects reused references", () => {
  const budget = new DiagnosticCaptureBudget();
  budget.registerFailure(reference(), id(50), 0);
  expect(budget.reserve(id(51), payload(), 500, 10)).toBe(true);
  expect(budget.registerFailure(reference(), id(52), 20)).toBe(false);
  expect(budget.reserve(id(53), payload(), 500, 30)).toBe(false);
  budget.release([id(51)]);
  expect(budget.registerFailure(reference(), id(54), 300_001)).toBe(true);
  expect(budget.reserve(id(55), payload(), 500, 300_002)).toBe(true);
});
it("charges late-correlation metadata against the same byte ceiling and supports release", () => {
  const budget = new DiagnosticCaptureBudget();
  expect(budget.retainMetadata(id(1), 40 * 1024)).toBe(true);
  expect(budget.reserve(id(2), payload(), 30 * 1024, 0)).toBe(false);
  expect(budget.retainMetadata(id(1), 1024)).toBe(true);
  expect(budget.reserve(id(2), payload(), 30 * 1024, 0)).toBe(true);
  budget.release([id(2)]);
  budget.releaseMetadata(id(1));
  expect(budget.accountedBytes).toBeLessThan(1024);
  budget.clear();
  expect(budget.accountedBytes).toBe(0);
});

it("adjusts only owned payload bytes and rejects invalid growth without changing accounting", () => {
  const budget = new DiagnosticCaptureBudget();
  expect(budget.adjust(id(1), 500)).toBe(false);
  expect(budget.reserve(id(1), payload(), 500, 0)).toBe(true);
  const initial = budget.accountedBytes;
  for (const bytes of [-1, 0.5, NaN, Infinity, 64 * 1024]) {
    expect(budget.adjust(id(1), bytes)).toBe(false);
    expect(budget.accountedBytes).toBe(initial);
  }
  expect(budget.adjust(id(1), 1500)).toBe(true);
  expect(budget.accountedBytes).toBe(initial + 1000);
  expect(budget.adjust(id(1), 100)).toBe(true);
  expect(budget.accountedBytes).toBe(initial - 400);
  expect(budget.reserve(id(1), payload(), 100, 0)).toBe(false);
});

it("transfers final hook identity without renewing offline time or observation allowance", () => {
  const budget = new DiagnosticCaptureBudget();
  for (let index = 0; index < 20; index++) {
    expect(budget.reserve(id(200 + index), payload(), 100, 0)).toBe(true);
  }
  expect(budget.replace(id(200), id(300), payload(), 200, 600_000)).toBe(true);
  expect(budget.isEligible(id(200), payload())).toBe(false);
  expect(budget.isEligible(id(300), payload())).toBe(true);
  expect(budget.replace(id(300), id(300), payload(), 150, 600_001)).toBe(true);
  expect(budget.reserve(id(400), payload(), 100, 600_002)).toBe(false);
  budget.release([id(300), ...Array.from({ length: 19 }, (_, index) => id(201 + index))]);
  expect(budget.reserve(id(401), payload(), 100, 600_003)).toBe(true);
});

it("rejects hook identity collisions while preserving the other pending owner", () => {
  const budget = new DiagnosticCaptureBudget();
  budget.reserve(id(1), payload(), 500, 0);
  budget.reserve(id(2), payload(2), 500, 0);
  expect(budget.replace(id(1), id(2), payload(), 500, 1)).toBe(false);
  expect(budget.isEligible(id(1), payload())).toBe(false);
  expect(budget.isEligible(id(2), payload(2))).toBe(true);
  expect(budget.isEligible(id(2), payload())).toBe(false);
});

it("releases rejected final growth and re-admits a changed hook scope against its own budget", () => {
  const budget = new DiagnosticCaptureBudget();
  budget.reserve(id(1), payload(), 500, 0);
  expect(budget.replace(id(1), id(2), payload(), 64 * 1024, 1)).toBe(false);
  expect(budget.isEligible(id(2), payload())).toBe(false);
  expect(budget.accountedBytes).toBeLessThan(1024);
  budget.reserve(id(3), payload(), 500, 1);
  expect(budget.replace(id(3), id(4), payload(2, 101), 600, 2)).toBe(true);
  expect(budget.isEligible(id(3), payload())).toBe(false);
  expect(budget.isEligible(id(4), payload(2, 101))).toBe(true);
  expect(budget.replace(id(4), id(5), payload(3), 500, NaN)).toBe(false);
  expect(budget.isEligible(id(4), payload(2, 101))).toBe(false);
});

it("invalidates pending ownership after a reference becomes ambiguous", () => {
  const budget = new DiagnosticCaptureBudget();
  budget.registerFailure(reference(), id(40), 0);
  budget.reserve(id(1), payload(), 500, 1);
  expect(budget.registerFailure(reference(), id(41), 2)).toBe(false);
  expect(budget.isEligible(id(1), payload())).toBe(false);
  expect(budget.replace(id(1), id(2), payload(), 500, 3)).toBe(false);
  expect(budget.accountedBytes).toBeLessThan(1024);
});

it("admits only one timely resource follow-up for the registered primary", () => {
  const resource: DiagnosticContextPayload = {
    ...reference(),
    kind: "resource_observation",
    source_event_id: id(40),
    observations: {
      version: 1,
      items: [
        {
          kind: "timing",
          observed_at: "2026-10-29T00:00:00.000Z",
          source_url: "/image.png",
          availability: "observed",
          response_status: 404,
          duration_ms: 20,
          transfer_size_bytes: 0
        }
      ]
    }
  };
  const budget = new DiagnosticCaptureBudget();
  expect(budget.reserve(id(1), resource, 500, 0)).toBe(false);
  budget.registerFailure(reference(), id(40), 0);
  expect(budget.reserve(id(1), { ...resource, source_event_id: id(41) }, 500, 1)).toBe(false);
  expect(budget.reserve(id(1), resource, 500, 30_001)).toBe(false);
  expect(budget.reserve(id(1), resource, 500, 30_000)).toBe(true);
  expect(budget.isEligible(id(1), resource)).toBe(true);
  expect(budget.replace(id(1), id(2), { ...resource, source_event_id: id(41) }, 500, 30_001)).toBe(
    false
  );
  expect(budget.reserve(id(3), resource, 500, 30_000)).toBe(false);
});

it("bounds metadata cardinality and rejects invalid receipt times and bytes", () => {
  const budget = new DiagnosticCaptureBudget();
  expect(budget.registerFailure(reference(), id(1), Infinity)).toBe(false);
  expect(budget.reserve(id(1), payload(), -1, 0)).toBe(false);
  expect(budget.reserve(id(1), payload(), 500, NaN)).toBe(false);
  for (let index = 1; index <= 50; index++)
    expect(budget.retainMetadata(id(index), 100)).toBe(true);
  expect(budget.retainMetadata(id(51), 100)).toBe(false);
  expect(budget.retainMetadata(id(1), NaN)).toBe(false);
  budget.releaseMetadata(id(100));
  budget.releaseMetadata(id(1));
  expect(budget.retainMetadata(id(51), 100)).toBe(true);
  budget.release([id(100)]);
  expect(budget.reserve(id(200), payload(), 100, 100)).toBe(true);
  expect(budget.reserve(id(201), payload(), 100, 99)).toBe(false);
});
