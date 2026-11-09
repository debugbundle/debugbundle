import { expect, it } from "vitest";
import cases from "../../../evals/smart-reports/cases.json" with { type: "json" };
import {
  compactReportModelPayload,
  projectReportNarrativeFacts
} from "../../../packages/smart-reports/src/model-projection.js";
import { prepareReportModelInput } from "../../../packages/smart-reports/src/model-evidence.js";
import { buildReportModelRequest } from "../../../packages/smart-reports/src/model-request.js";

const maximum = cases.cases.find((item) => item.id === "production-maximum-month")!;
it("keeps every numeric fact while reserving old, recent urgent and solved evidence per view", () => {
  const original = structuredClone(maximum.facts),
    facts = projectReportNarrativeFacts(original);
  expect(original).toEqual(maximum.facts);
  expect(original.evidence).toHaveLength(100);
  expect(facts.metrics).toHaveLength(140);
  expect(facts.evidence).toHaveLength(30);
  for (const project of facts.projects) {
    expect(
      facts.evidence.filter((item) => item.project_ref === project.ref).map((item) => item.ref)
    ).toEqual([`${project.ref}_detail0`, `${project.ref}_detail1`, `${project.ref}_detail2`]);
  }
  expect(facts.selection_notes).toHaveLength(20);
  expect(facts.selection_notes).toEqual(expect.arrayContaining(original.selection_notes));
  expect(
    facts.evidence.reduce((total, item) => total + Buffer.byteLength(item.context ?? ""), 0)
  ).toBeLessThanOrEqual(4500);
  expect(JSON.stringify(compactReportModelPayload(facts)).length).toBeLessThan(30000);
});
it("preserves numeric values and server-computed rate versus snapshot semantics in compact tuples", () => {
  const facts = projectReportNarrativeFacts(maximum.facts),
    payload = compactReportModelPayload(facts);
  const rows = payload["metrics"] as unknown[][];
  const detailRows = payload["evidence"] as unknown[][];
  expect(
    detailRows.map((row) =>
      Object.fromEntries(
        (payload["evidence_columns"] as string[]).map((key, index) => [key, row[index]])
      )
    )
  ).toEqual(facts.evidence);
  const dictionary = payload["note_dictionary"] as string[];
  expect(
    (payload["selection_notes"] as [string | null, number][]).map(
      ([project, index]) => `${project === null ? "" : project + ": "}${dictionary[index]}`
    )
  ).toEqual(facts.selection_notes);
  for (const [index, item] of facts.metrics.entries()) {
    expect(rows[index]?.slice(0, 2)).toEqual([item.ref, item.project_ref]);
    expect(rows[index]?.slice(3, 7)).toEqual([
      item.current,
      item.previous,
      item.current_complete,
      item.previous_complete
    ]);
  }
  expect(rows.find((row) => row[0] === "p01_m11")?.[8]).toBe("unchanged");
  expect(rows.find((row) => row[0] === "p01_m6")?.[8]).toBe("unavailable");
  const snapshot = structuredClone(maximum.facts);
  snapshot.metrics.forEach((item) => {
    item.current_complete = true;
    item.previous_complete = true;
  });
  expect(
    (
      compactReportModelPayload(projectReportNarrativeFacts(snapshot))["metrics"] as unknown[][]
    ).find((row) => row[0] === "p01_m6")?.[8]
  ).toBe("unchanged");
});
it("never restores restricted text and keeps the complete prompt/schema in the same preflight request", () => {
  const facts = projectReportNarrativeFacts({ ...maximum.facts, privacy_mode: "restricted" });
  expect(facts.evidence.every((item) => item.context === null)).toBe(true);
  expect(facts.projects[0]?.name).toBe("Project A");
  const request = buildReportModelRequest({ model: "gpt-6.1-terra", facts: maximum.facts });
  expect(request.facts).toEqual(projectReportNarrativeFacts(maximum.facts));
  expect(request.profile.max_input_tokens).toBe(12000);
  expect(JSON.parse(request.counter_body).input).toEqual(JSON.parse(request.body).input);
  expect(JSON.parse(request.counter_body).text).toEqual(JSON.parse(request.body).text);
  expect(prepareReportModelInput(maximum.facts).evidence).toHaveLength(100);
});
