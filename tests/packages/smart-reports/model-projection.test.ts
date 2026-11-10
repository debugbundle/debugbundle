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
it("handles bounded multilingual source text without exhausting the pre-compaction privacy pass", () => {
  const source = structuredClone(maximum.facts);
  source.evidence.forEach((item) => {
    item.title = "調査対象".repeat(30);
    item.context = "障害原因".repeat(400);
  });
  const facts = projectReportNarrativeFacts(source);
  expect(facts.metrics).toHaveLength(140);
  expect(facts.evidence).toHaveLength(30);
  expect(
    facts.evidence.reduce((sum, item) => sum + Buffer.byteLength(item.context ?? ""), 0)
  ).toBeLessThanOrEqual(4500);
});
it("can project a valid fact set with the full selection-note allowance", () => {
  const source = structuredClone(maximum.facts);
  source.selection_notes = Array.from(
    { length: 20 },
    (_, index) =>
      `Selection caveat ${index}: retained coverage does not establish complete history.`
  );
  const facts = projectReportNarrativeFacts(source);
  expect(facts.selection_notes.length).toBeLessThanOrEqual(20);
  expect(facts.metrics).toHaveLength(140);
  expect(facts.selection_notes).toContain(
    "AI input notes are a bounded selection; additional source caveats remain in the full report. Do not assume complete coverage."
  );
  expect(source.selection_notes).toHaveLength(20);
});

it("preserves the nine previously token-counted request hashes and budgets for unchanged fixtures", () => {
  const qualified = {
    "quiet-complete": "83f9a9a62838a54a06c43e67c131c92ac581e9eba2dca72d62ffcc84ab43c056",
    "ten-project-full-month": "cfcd8033f601b0bd89b128ddd0405f82c1ec5e6ff232848d97a0659ddfe61d25",
    "resolution-regression": "fc7c2b476c474008ec34fd1468b8200c60b8a09e0fd48057663d9121ed819355",
    "health-gaps": "6315071eb056a4dc6e4f74882a4df0c1b591825cb5b408e40ed2667e45beb6c2",
    "analytics-gaps": "5795e306d86706f5107a8f5598b685f0adf19b37906bad8dfe875a2194278900",
    "adversarial-context": "397e4a82ea5557d7ee97c4083eb70862f4cc5b6de6363a81fe95f88ce9233bbe",
    restricted: "b8781d3a0e71e5ee9ef2d76331e6c38c942ac2a2a9c9fb2a8db0318efc952d1a",
    "retention-partial": "927884be4c5530ad0945538604725be263c66a58b64b2ea275a7aac404f44703",
    "production-maximum-month": "eb3406febdf4aa1901575d61ceee98b502b23b6a9ef94437081c1ecaeb7515d0"
  } as const;
  for (const [id, hash] of Object.entries(qualified)) {
    const fixture = cases.cases.find((item) => item.id === id)!;
    const request = buildReportModelRequest({ model: "gpt-6.1-terra", facts: fixture.facts });
    expect(request.request_hash, id).toBe(hash);
    expect(request.maximum_nano_usd).toBe(24750000);
    expect(request.profile.max_paid_attempts).toBe(1);
  }
});
