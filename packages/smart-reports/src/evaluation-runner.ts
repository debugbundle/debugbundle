import { randomUUID } from "node:crypto";
import { z } from "zod";
import { BUSINESS_SMART_REPORT_RUNS_PER_MONTH } from "../../shared-types/src/smart-report-limits.js";
import { maximumReportRunCost } from "./model-cost.js";
import { ReportModelFactsSchema, ReportReferenceSchema } from "./model-evidence.js";
import { buildReportModelRequest } from "./model-request.js";
import type { ReportNarrative } from "./model-narrative.js";
import type { ReportModelClient, ReportModelAttemptOutcome } from "./model-client.js";
import { ReportModelInputLimitError } from "./model-client.js";
import type { ReportEvaluationLedger } from "./evaluation-ledger.js";

const caseSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,79}$/),
    description: z.string().max(500),
    facts: ReportModelFactsSchema,
    expected: z
      .object({
        required_priority_refs: z.array(ReportReferenceSchema).max(100),
        forbidden_text: z.array(z.string().min(1).max(200)).max(20),
        review_expectations: z.array(z.string().max(500)).max(10)
      })
      .strict()
  })
  .strict();
export const ReportEvaluationFixturesSchema = z
  .object({ version: z.literal(1), cases: z.array(caseSchema).min(1).max(100) })
  .strict();
export interface ReportEvaluationArtifact {
  record_id: string;
  case_id: string;
  variant: "A" | "B";
  fixture_hash: string;
  request_hash: string;
  attempt_id: string | null;
  state: "preflight_failed" | ReportModelAttemptOutcome["state"];
  input_tokens: number | null;
  maximum_nano_usd: number;
  worst_case_month_nano_usd: number;
  cost_nano_usd: number | null;
  elapsed_ms: number;
  reason: string | null;
  usage: Extract<ReportModelAttemptOutcome, { cost_nano_usd: number }>["usage"] | null;
  narrative: ReportNarrative | null;
  gate_failures: string[];
}
export interface ReportEvaluationSummary {
  attempted: number;
  skipped: number;
  preflight_failed: number;
  succeeded: number;
  rejected: number;
  uncertain: number;
  gate_failures: number;
  used_or_held_nano_usd: number;
}
function safePreflightReason(error: unknown): string {
  const known = new Set([
    "report_input_limit_exceeded",
    "report_input_preflight_failed",
    "report_egress_budget_exceeded",
    "report_request_size_exceeded"
  ]);
  return error instanceof Error &&
    (known.has(error.message) || /^report_preflight_http_\d{3}$/.test(error.message))
    ? error.message
    : "report_preflight_failed";
}
/** The paid comparison uses the exact production request builder/client. Expected
 * facts are evaluated locally and never become model instructions or input. */
export async function runReportModelEvaluation(input: {
  ledger: ReportEvaluationLedger;
  client: ReportModelClient;
  cases: unknown[];
  fixture_hash: string;
  writeOutcome: (artifact: ReportEvaluationArtifact) => Promise<void>;
  log: (event: Record<string, unknown>) => void;
}): Promise<ReportEvaluationSummary> {
  const cases = z.array(caseSchema).min(1).max(100).parse(input.cases),
    fixtureHash = z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .parse(input.fixture_hash);
  if (new Set(cases.map((item) => item.id)).size !== cases.length)
    throw new Error("report_evaluation_duplicate_case");
  const summary: ReportEvaluationSummary = {
    attempted: 0,
    skipped: 0,
    preflight_failed: 0,
    succeeded: 0,
    rejected: 0,
    uncertain: 0,
    gate_failures: 0,
    used_or_held_nano_usd: input.ledger.used_nano_usd()
  };
  const variants = [
    { model: "gpt-6-luna", variant: "A" },
    { model: "gpt-6.1-terra", variant: "B" }
  ] as const;
  for (const fixture of cases) {
    for (const candidate of variants) {
      const planned = buildReportModelRequest({ model: candidate.model, facts: fixture.facts });
      if (
        input.ledger
          .attempts()
          .some(
            (entry) =>
              entry.case_id === fixture.id &&
              entry.fixture_hash === fixtureHash &&
              entry.profile.model === candidate.model &&
              entry.request_hash === planned.request_hash
          )
      ) {
        summary.skipped++;
        input.log({ case_id: fixture.id, variant: candidate.variant, state: "skipped" });
        continue;
      }
      const base = {
        record_id: randomUUID(),
        case_id: fixture.id,
        variant: candidate.variant,
        fixture_hash: fixtureHash,
        request_hash: planned.request_hash,
        maximum_nano_usd: planned.maximum_nano_usd,
        worst_case_month_nano_usd:
          maximumReportRunCost(planned.profile).run_nano_usd * BUSINESS_SMART_REPORT_RUNS_PER_MONTH
      };
      let prepared: Awaited<ReturnType<ReportModelClient["prepare"]>>;
      try {
        prepared = await input.client.prepare({ model: candidate.model, facts: fixture.facts });
      } catch (error) {
        const artifact: ReportEvaluationArtifact = {
          ...base,
          state: "preflight_failed",
          attempt_id: null,
          input_tokens: error instanceof ReportModelInputLimitError ? error.input_tokens : null,
          cost_nano_usd: null,
          elapsed_ms: 0,
          reason: safePreflightReason(error),
          usage: null,
          narrative: null,
          gate_failures: ["preflight_failed"]
        };
        await input.writeOutcome(artifact);
        summary.preflight_failed++;
        summary.gate_failures++;
        input.log({
          case_id: fixture.id,
          variant: candidate.variant,
          state: artifact.state,
          reason: artifact.reason
        });
        if (
          /^report_preflight_http_\d{3}$/.test(artifact.reason ?? "") ||
          artifact.reason === "report_input_preflight_failed" ||
          artifact.reason === "report_preflight_failed"
        )
          throw new Error(artifact.reason ?? "report_preflight_failed");
        continue;
      }
      if (
        prepared.request_hash !== planned.request_hash ||
        prepared.maximum_nano_usd !== planned.maximum_nano_usd
      )
        throw new Error("report_evaluation_request_changed");
      let attemptId: string | null = null;
      const outcome = await prepared.run(async () => {
        const reserved = await input.ledger.reserve({
          case_id: fixture.id,
          fixture_hash: fixtureHash,
          request_hash: planned.request_hash,
          profile: planned.profile
        });
        attemptId = reserved.id;
      });
      if (attemptId === null) throw new Error("report_evaluation_admission_missing");
      const gates: string[] = [];
      if (outcome.state === "succeeded") {
        const prose = JSON.stringify(outcome.narrative);
        if (
          fixture.expected.forbidden_text.some((text) =>
            prose.toLowerCase().includes(text.toLowerCase())
          )
        )
          gates.push("forbidden_text");
        const priorities = new Set(
          outcome.narrative.priorities.flatMap((item) => item.evidence_refs)
        );
        if (fixture.expected.required_priority_refs.some((ref) => !priorities.has(ref)))
          gates.push("expected_priority_missing");
      } else
        gates.push(outcome.state === "uncertain" ? "uncertain_outcome" : "model_output_rejected");
      const artifact: ReportEvaluationArtifact = {
        ...base,
        attempt_id: attemptId,
        input_tokens: prepared.input_tokens,
        state: outcome.state,
        cost_nano_usd: outcome.state === "uncertain" ? null : outcome.cost_nano_usd,
        elapsed_ms: outcome.elapsed_ms,
        reason: outcome.state === "succeeded" ? null : outcome.reason,
        usage: outcome.state === "uncertain" ? null : outcome.usage,
        narrative: outcome.state === "succeeded" ? outcome.narrative : null,
        gate_failures: gates
      };
      // A failed artifact write leaves the durable reservation intact. Restart
      // skips that attempt rather than buying the same unknown result again.
      await input.writeOutcome(artifact);
      await input.ledger.finish(attemptId, outcome);
      summary.attempted++;
      summary[outcome.state]++;
      summary.gate_failures += gates.length;
      input.log({
        case_id: fixture.id,
        variant: candidate.variant,
        state: outcome.state,
        cost_nano_usd: artifact.cost_nano_usd,
        held_nano_usd: outcome.state === "uncertain" ? planned.maximum_nano_usd : 0,
        elapsed_ms: outcome.elapsed_ms,
        gate_failures: gates
      });
    }
  }
  summary.used_or_held_nano_usd = input.ledger.used_nano_usd();
  return summary;
}
