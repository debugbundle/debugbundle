import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EventEnvelopeSchema,
  EvidenceReferenceSchema
} from "../../packages/shared-types/src/index.js";

const corpus = JSON.parse(
  readFileSync("tests/fixtures/evidence/before-send-budget.json", "utf8")
) as {
  original: unknown;
  cases: Array<{
    id: string;
    event: { payload: Record<string, unknown>; context: Record<string, unknown> };
    outcome: string;
    bytes?: number;
  }>;
};

describe("shared hook budget contract", () => {
  it("starts with a canonical original", () => {
    expect(EventEnvelopeSchema.safeParse(corpus.original).success).toBe(true);
  });
  it.each(corpus.cases)("$id retains strict receiving validation", (fixture) => {
    expect(EventEnvelopeSchema.safeParse(fixture.event).success).toBe(fixture.outcome === "keep");
    if (fixture.bytes === undefined) return;
    const additions: Record<string, unknown> = Object.fromEntries(
      ["exception_evidence", "execution", "resource_observations"]
        .filter((field) => field in fixture.event.payload)
        .map((field) => [field, fixture.event.payload[field]])
    );
    const reference = EvidenceReferenceSchema.safeParse(
      fixture.event.context["evidence_reference"]
    );
    if (reference.success) additions["evidence_reference"] = reference.data;
    expect(Buffer.byteLength(JSON.stringify(additions))).toBe(fixture.bytes);
    expect(Buffer.byteLength(JSON.stringify(additions["exception_evidence"]))).toBeLessThanOrEqual(
      32768
    );
  });
});
