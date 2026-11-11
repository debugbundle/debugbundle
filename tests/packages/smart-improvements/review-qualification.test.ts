import { expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { planningCases } from "../../../evals/smart-improvements/planning-cases.js";
import {
  planReview,
  validatePlannedGuidance
} from "../../../packages/smart-improvements/src/review-planning.js";
import {
  buildReviewModelRequest,
  createReviewModelClient
} from "../../../packages/smart-improvements/src/model-client.js";
import { vi } from "vitest";
it("binds final qualification to current request hashes and validates every retained response offline", () => {
  const receipt = JSON.parse(
    readFileSync(
      new URL(
        "../../../evals/smart-improvements/guidance-qualification-final-20261111.json",
        import.meta.url
      ),
      "utf8"
    )
  ) as {
    cases: {
      id: string;
      fixture_sha256: string;
      request_sha256?: string;
      guidance?: unknown;
    }[];
  };
  expect(receipt.cases).toHaveLength(20);
  for (const saved of receipt.cases) {
    const c = planningCases().find((c) => c.id === saved.id)!;
    expect(createHash("sha256").update(JSON.stringify(c)).digest("hex")).toBe(saved.fixture_sha256);
    if (saved.guidance === undefined) {
      expect(() => buildReviewModelRequest(c.facts, c.context)).toThrow("review_no_model_evidence");
      continue;
    }
    expect(buildReviewModelRequest(c.facts, c.context).request_hash).toBe(saved.request_sha256);
    expect(
      validatePlannedGuidance(c.facts, c.context, saved.guidance, ["HiddenAcme", "隠された"])
    ).toEqual(saved.guidance);
  }
});
it("preserves the failed evaluation provenance and rejects its repetitive monitor guidance", () => {
  const receipt = JSON.parse(
    readFileSync(
      new URL(
        "../../../evals/smart-improvements/guidance-evaluation-20261111.json",
        import.meta.url
      ),
      "utf8"
    )
  ) as {
    ledgers: Record<string, { entries: { id: string; request_hash: string }[] }>;
    cases: {
      id: string;
      fixture_sha256?: string;
      request_sha256?: string;
      guidance?: unknown;
    }[];
  };
  const paid = receipt.cases.filter((c) => c.guidance !== undefined);
  expect(paid).toHaveLength(18);
  for (const saved of paid) {
    const c = planningCases().find((c) => c.id === saved.id)!;
    expect(createHash("sha256").update(JSON.stringify(c)).digest("hex")).toBe(saved.fixture_sha256);
    expect(Object.values(receipt.ledgers).flatMap((l) => l.entries)).toContainEqual(
      expect.objectContaining({ id: saved.id, request_hash: saved.request_sha256 })
    );
    if (saved.id === "overlapping-monitored-failures") {
      expect(() =>
        validatePlannedGuidance(c.facts, c.context, saved.guidance, ["HiddenAcme", "隠された"])
      ).toThrow("review_duplicate_guidance");
      continue;
    }
    expect(
      validatePlannedGuidance(c.facts, c.context, saved.guidance, ["HiddenAcme", "隠された"])
    ).toEqual(saved.guidance);
  }
});
it("uses positive repeated-delivery evidence even when the bounded count is incomplete", () => {
  const c = planningCases().find((c) => c.id === "repeated-alert-delivery")!;
  c.context.configuration.coverage = "partial";
  c.context.configuration.alerts[0]!.delivered_rows = null;
  expect(
    planReview(c.facts, c.context)[0]!.controls.some((x) => x.control === "alert_delivery")
  ).toBe(true);
});
it("keeps distinct critical deliveries out of repeated-notification tuning", () => {
  const c = planningCases().find((c) => c.id === "repeated-alert-delivery")!;
  c.context.configuration.alerts[0]!.repeated_source_refs = [];
  expect(
    planReview(c.facts, c.context)[0]!.controls.some((x) => x.control === "alert_delivery")
  ).toBe(false);
});
it("describes linked existing and expired rules as snapshots without assuming they fixed anything", () => {
  for (const id of ["existing-demotion", "expired-rule"]) {
    const c = planningCases().find((c) => c.id === id)!;
    c.context.configuration.rules[0]!.source_refs = ["e1"];
    const check = planReview(c.facts, c.context)[0]!.controls.find(
      (c) => c.control === "capture_rules"
    )!;
    expect(check.check).toContain(id === "expired-rule" ? "demote (expired)" : "demote (enabled)");
    expect(check.verification).toContain("genuine failure");
  }
});
it("keeps an active serious failure ahead of equally severe measured friction", () => {
  const c = planningCases().find((c) => c.id === "linked-not-causal")!;
  c.facts.sources.forEach((s) => {
    s.severity = "high";
  });
  c.context.signals[0]!.measurements.push({
    key: "affected_sessions",
    value: 30,
    unit: "count",
    basis: "period"
  });
  expect(planReview(c.facts, c.context)[0]!.action).toBe("investigate_failure");
});
it("does not treat normal balanced diagnostic capture as a temporary investigation", () => {
  const c = planningCases().find((c) => c.id === "broad-capture-review")!;
  c.context.configuration.origins[0]!.preset = "balanced";
  c.context.configuration.origins[0]!.diagnostic_capture = true;
  expect(
    planReview(c.facts, c.context)[0]!.controls.some((x) => x.control === "temporary_diagnostics")
  ).toBe(false);
});
it.each(planningCases())("provides a safe factual next step for $id", (c) => {
  const plans = planReview(c.facts, c.context);
  if (c.expected_action === null) {
    expect(plans).toEqual([]);
    expect(() => buildReviewModelRequest(c.facts, c.context)).toThrow("review_no_model_evidence");
    return;
  }
  expect(plans[0]!.action).toBe(c.expected_action);
  expect(plans.length).toBeLessThanOrEqual(5);
  expect(plans.every((p) => p.inspection.length > 0 && p.verification.length > 0)).toBe(true);
  if (c.expected_control)
    expect(plans.flatMap((p) => p.controls.map((k) => k.control))).toContain(c.expected_control);
  const req = buildReviewModelRequest(c.facts, c.context);
  expect(req.body).not.toContain(c.facts.project_id);
  expect(Buffer.byteLength(req.body)).toBeLessThan(128 * 1024);
});
it.each(planningCases().filter((c) => c.expected_action === null))(
  "makes no counter or paid request for $id",
  async (c) => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    await expect(
      createReviewModelClient({ apiKey: "sk-synthetic-evaluation", fetch }).prepare({
        facts: c.facts,
        context: c.context,
        identities: []
      })
    ).rejects.toThrow("review_no_model_evidence");
    expect(fetch).not.toHaveBeenCalled();
  }
);
it.each([
  "Disable exception capture",
  "Drop all failures",
  "Suppress authentication failures",
  "Increase cooldown",
  "Change the capture policy",
  "Set the project sampling rate",
  "Adjust the notification cooldown",
  "Change matching rules",
  "Configure project capture",
  "Use beforeSend to hide errors"
])("rejects provider configuration prescriptions: %s", (title) => {
  const c = planningCases().find((c) => c.id === "repeated-alert-delivery")!;
  expect(() =>
    validatePlannedGuidance(c.facts, c.context, {
      version: 1,
      investigations: [
        {
          title,
          hypothesis: null,
          checks: ["Inspect the retained evidence."],
          evidence_refs: ["e1"]
        }
      ]
    })
  ).toThrow("review_unsafe_configuration_guidance");
});
it.each([
  "If evidence supports a bounded change, add a regression check and compare subsequent observations using equivalent sampling, denominator and capture policy.",
  "Reproduce the affected flow before choosing a bounded change; add a regression check and compare subsequent observations with equivalent sampling, denominator and capture policy.",
  "Test any explanation against the reproduced failure before making a bounded change. Add a regression check and observe the same path under comparable traffic and capture settings."
])("permits a bounded fix followed by a comparable observation: %s", (check) => {
  const c = planningCases().find((c) => c.id === "repeated-alert-delivery")!;
  expect(
    validatePlannedGuidance(c.facts, c.context, {
      version: 1,
      investigations: [
        {
          title: "Investigate the retained failure",
          hypothesis: null,
          checks: [check],
          evidence_refs: ["e1"]
        }
      ]
    }).investigations
  ).toHaveLength(1);
});
it("does not treat words in separate output fields as a configuration prescription", () => {
  const c = planningCases().find((c) => c.id === "repeated-alert-delivery")!;
  expect(
    validatePlannedGuidance(c.facts, c.context, {
      version: 1,
      investigations: [
        {
          title: "Verify a bounded change",
          hypothesis: null,
          checks: ["Inspect capture coverage before interpreting missing evidence."],
          evidence_refs: ["e1"]
        }
      ]
    }).investigations
  ).toHaveLength(1);
});
it("does not collapse an analytics relationship into a proven common-cause investigation", () => {
  const c = planningCases().find((c) => c.id === "linked-not-causal")!;
  expect(planReview(c.facts, c.context)).toHaveLength(2);
  expect(() =>
    validatePlannedGuidance(c.facts, c.context, {
      version: 1,
      investigations: [
        {
          title: "Inspect a shared cause",
          hypothesis: null,
          checks: ["Inspect evidence."],
          evidence_refs: ["e1", "e2"]
        }
      ]
    })
  ).toThrow("review_unplanned_guidance");
});
it("permits investigating a conversion drop and inspecting a retained sample without prescribing filtering", () => {
  const c = planningCases().find((c) => c.id === "measured-checkout-drop")!;
  expect(
    validatePlannedGuidance(c.facts, c.context, {
      version: 1,
      investigations: [
        {
          title: "Investigate the checkout drop",
          hypothesis: null,
          checks: ["Inspect a bounded sample of retained flow evidence."],
          evidence_refs: ["e1"]
        }
      ]
    }).investigations
  ).toHaveLength(1);
});
