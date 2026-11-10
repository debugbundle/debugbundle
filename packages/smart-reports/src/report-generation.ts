import { createHash, randomUUID } from "node:crypto";
import { CanonicalReportFactsSchema, type CanonicalReportFacts } from "./report-facts.js";
import {
  ReportDocumentSchema,
  MAX_REPORT_JSON_BYTES,
  type ReportDocument
} from "./report-document.js";
import {
  ReportProcessingStateSchema,
  type ReportProcessingState,
  type ReportArtifactReference
} from "./report-processing.js";
import { maximumReportRunCost } from "./model-cost.js";
import type {
  ReportModelClient,
  ReportModelAttemptOutcome,
  PreparedReportModelAttempt
} from "./model-client.js";
import type { ReportRunRecord } from "./report-run.js";
import { redactReportData } from "./report-redaction.js";

export interface ReportGenerationPorts {
  state(): Promise<ReportProcessingState>;
  check(): Promise<void>;
  facts(): Promise<CanonicalReportFacts>;
  context(report: CanonicalReportFacts): Promise<CanonicalReportFacts>;
  read(reference: ReportArtifactReference): Promise<Buffer>;
  persist(kind: "facts" | "ready", body: Buffer, expires_at: string): Promise<void>;
  begin(input: {
    attempt_id: string;
    facts_sha256: string;
    prepared: PreparedReportModelAttempt;
  }): Promise<void>;
  settle(input: { attempt_id: string; outcome: ReportModelAttemptOutcome }): Promise<void>;
  complete(options: { has_narrative: boolean }): Promise<ReportRunRecord>;
}
function bytes(value: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(value));
  if (body.length > MAX_REPORT_JSON_BYTES) throw new Error("report_document_size_exceeded");
  return body;
}
async function read(
  ports: ReportGenerationPorts,
  reference: ReportArtifactReference
): Promise<unknown> {
  await ports.check();
  const body = await ports.read(reference);
  if (
    body.length > MAX_REPORT_JSON_BYTES ||
    createHash("sha256").update(body).digest("hex") !== reference.sha256
  )
    throw new Error("report_artifact_integrity_failed");
  return JSON.parse(body.toString("utf8")) as unknown;
}
function bindFacts(state: ReportProcessingState, report: CanonicalReportFacts): void {
  if (
    report.organization_id !== state.run.organization_id ||
    report.definition_id !== state.run.definition_id ||
    JSON.stringify(report.scope) !== JSON.stringify(state.run.scope) ||
    JSON.stringify(report.facts.period) !== JSON.stringify(state.run.period) ||
    report.facts.privacy_mode !== state.run.privacy_mode ||
    Date.parse(report.expires_at) <= Date.now()
  )
    throw new Error("report_artifact_scope_invalid");
}
/** One logical run resumes its persisted canonical facts and paid receipt. Only
 * a run with no paid intent may call the model. Storage/provider failures retry
 * the same run; renderer recovery never purchases another model response. */
export async function generateSmartReport(
  ports: ReportGenerationPorts,
  model: ReportModelClient | null
): Promise<ReportRunRecord> {
  let state = ReportProcessingStateSchema.parse(await ports.state());
  if (state.ready !== null) {
    const document = ReportDocumentSchema.parse(await read(ports, state.ready));
    bindFacts(state, document.report);
    if (document.run_id !== state.run.id || document.name !== state.run.name)
      throw new Error("report_artifact_scope_invalid");
    return ports.complete({ has_narrative: document.narrative !== null });
  }
  let report: CanonicalReportFacts;
  if (state.facts !== null)
    report = CanonicalReportFactsSchema.parse(await read(ports, state.facts));
  else {
    await ports.check();
    report = CanonicalReportFactsSchema.parse(await ports.context(await ports.facts()));
    bindFacts(state, report);
    await ports.check();
    await ports.persist("facts", bytes(report), report.expires_at);
    state = ReportProcessingStateSchema.parse(await ports.state());
  }
  bindFacts(state, report);
  if (state.facts === null) throw new Error("report_facts_not_frozen");
  let reason: ReportDocument["analysis"]["reason"] = "model_unavailable",
    narrative: ReportDocument["narrative"] = null;
  if (state.paid_attempts > 0) {
    if (state.attempt === null || state.profile === null)
      throw new Error("report_paid_receipt_missing");
    if (state.attempt.state === "succeeded" && state.attempt.narrative !== null) {
      narrative = state.attempt.narrative;
      reason = null;
    } else if (["sending", "uncertain"].includes(state.attempt.state)) {
      await ports.settle({
        attempt_id: state.attempt.id,
        outcome: {
          state: "uncertain",
          reason: "report_provider_outcome_unknown",
          maximum_nano_usd: maximumReportRunCost(state.profile).attempt_nano_usd,
          elapsed_ms: 0
        }
      });
      reason = "model_uncertain";
    } else
      reason = state.attempt.state === "rejected" ? "model_rejected" : "saved_response_unavailable";
  } else if (model !== null && state.profile?.model === "gpt-6.1-terra") {
    await ports.check();
    let prepared: PreparedReportModelAttempt | null = null;
    try {
      prepared = await model.prepare({ model: "gpt-6.1-terra", facts: report.facts });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "report_input_limit_exceeded") reason = "input_limit";
      else if (
        message === "report_input_preflight_failed" ||
        /^report_preflight_http_\d{3}$/.test(message)
      )
        reason = "preflight_unavailable";
      else throw error;
    }
    if (prepared !== null) {
      const attempt_id = randomUUID(),
        outcome = await prepared.run(() =>
          ports.begin({ attempt_id, facts_sha256: state.facts!.sha256, prepared })
        );
      await ports.settle({ attempt_id, outcome });
      if (outcome.state === "succeeded") {
        narrative = outcome.narrative;
        reason = null;
      } else reason = outcome.state === "uncertain" ? "model_uncertain" : "model_rejected";
      state = ReportProcessingStateSchema.parse(await ports.state());
    }
  }
  // A response buffered by an older worker may predate the client privacy gate.
  // Keep its settled receipt/cost immutable and publish usable facts without
  // unsafe prose; recovery must not buy a replacement response.
  if (
    narrative !== null &&
    JSON.stringify(redactReportData(narrative)) !== JSON.stringify(narrative)
  ) {
    narrative = null;
    reason = "model_rejected";
  }
  const document = ReportDocumentSchema.parse({
    version: 1,
    template_version: 1,
    run_id: state.run.id,
    name: state.run.name,
    report,
    narrative,
    analysis: {
      status: narrative === null ? "unavailable" : "available",
      reason,
      model: state.attempt === null ? null : (state.profile?.model ?? null),
      request_sha256: state.attempt?.request_sha256 ?? null
    }
  });
  await ports.check();
  await ports.persist("ready", bytes(document), report.expires_at);
  return ports.complete({ has_narrative: narrative !== null });
}
