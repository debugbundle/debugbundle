import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, realpath, unlink } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import { readManaged, safePath, writeManaged } from "../../agent-setup/src/files.js";
import {
  actualReportAttemptCost,
  maximumReportRunCost,
  ReportAttemptProfileSchema,
  ReportModelUsageSchema,
  REPORT_AI_EVALUATION_BUDGET_NANO_USD
} from "./model-cost.js";
import type { ReportModelAttemptOutcome } from "./model-client.js";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const metadataSchema = z
  .object({
    case_id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,79}$/),
    fixture_hash: hash,
    request_hash: hash,
    profile: ReportAttemptProfileSchema
  })
  .strict();
const attemptSchema = metadataSchema
  .extend({
    id: z.uuid(),
    reserved_nano_usd: z.number().int().positive(),
    state: z.enum(["reserved", "uncertain", "settled"]),
    settled_nano_usd: z.number().int().nonnegative().nullable(),
    outcome_digest: hash.nullable(),
    started_at: z.string().datetime(),
    finished_at: z.string().datetime().nullable(),
    outcome: z.enum(["succeeded", "rejected", "uncertain"]).nullable(),
    reason: z
      .string()
      .regex(/^report_[a-z0-9_]{1,100}$/)
      .nullable(),
    usage: ReportModelUsageSchema.nullable()
  })
  .strict();
const ledgerSchema = z
  .object({
    version: z.literal(1),
    authorization: z.literal("2026-11-07-afipal-one-usd"),
    budget_nano_usd: z.literal(REPORT_AI_EVALUATION_BUDGET_NANO_USD),
    attempts: z.array(attemptSchema).max(1000)
  })
  .strict();
type Attempt = z.infer<typeof attemptSchema>;
type Metadata = z.infer<typeof metadataSchema>;
function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function charged(attempts: Attempt[]): number {
  return attempts.reduce(
    (sum, entry) =>
      sum + (entry.state === "settled" ? entry.settled_nano_usd! : entry.reserved_nano_usd),
    0
  );
}
export interface ReportEvaluationLedger {
  reserve(input: Metadata): Promise<Attempt>;
  finish(id: string, outcome: ReportModelAttemptOutcome): Promise<void>;
  used_nano_usd(): number;
  attempts(): Attempt[];
  close(): Promise<void>;
}
/** Evaluation-only file adapter. One exclusive process owns the fixed ledger;
 * the production report lane must use transactional organisation reservations.
 * Every reservation is flushed before a paid request is permitted. */
export async function openReportEvaluationLedger(
  directory: string
): Promise<ReportEvaluationLedger> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new Error("report_evaluation_unsafe_directory");
  const root = await realpath(directory),
    lockPath = await safePath(root, "evaluation.lock"),
    lockToken = randomUUID();
  const lock = await open(
    lockPath,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600
  ).catch(() => {
    throw new Error("report_evaluation_locked");
  });
  let closed = false;
  async function release(): Promise<void> {
    if (closed) return;
    closed = true;
    await lock.close();
    if ((await readManaged(root, "evaluation.lock")) !== lockToken)
      throw new Error("report_evaluation_lock_changed");
    await unlink(lockPath);
  }
  try {
    await lock.writeFile(lockToken);
    await lock.sync();
    let previous = await readManaged(root, "budget.json", 2 * 1024 * 1024);
    if (previous === undefined && (await readdir(root)).some((name) => name !== "evaluation.lock"))
      throw new Error("report_evaluation_ledger_missing");
    let state: z.infer<typeof ledgerSchema>;
    try {
      state = ledgerSchema.parse(
        previous === undefined
          ? {
              version: 1,
              authorization: "2026-11-07-afipal-one-usd",
              budget_nano_usd: REPORT_AI_EVALUATION_BUDGET_NANO_USD,
              attempts: []
            }
          : JSON.parse(previous)
      );
      if (new Set(state.attempts.map((entry) => entry.id)).size !== state.attempts.length)
        throw new Error("invalid");
      for (const entry of state.attempts) {
        if (entry.reserved_nano_usd !== maximumReportRunCost(entry.profile).attempt_nano_usd)
          throw new Error("invalid");
        if (entry.state === "settled") {
          if (
            entry.usage === null ||
            entry.settled_nano_usd !==
              actualReportAttemptCost({
                model: entry.profile.model,
                regional_processing: entry.profile.regional_processing,
                usage: entry.usage
              }) ||
            entry.settled_nano_usd > entry.reserved_nano_usd ||
            entry.outcome === "uncertain" ||
            entry.outcome === null ||
            entry.outcome_digest === null ||
            entry.finished_at === null
          )
            throw new Error("invalid");
        } else if (
          entry.settled_nano_usd !== null ||
          entry.usage !== null ||
          (entry.state === "reserved" &&
            (entry.outcome !== null ||
              entry.outcome_digest !== null ||
              entry.finished_at !== null)) ||
          (entry.state === "uncertain" &&
            (entry.outcome !== "uncertain" ||
              entry.outcome_digest === null ||
              entry.finished_at === null))
        )
          throw new Error("invalid");
      }
      if (charged(state.attempts) > REPORT_AI_EVALUATION_BUDGET_NANO_USD)
        throw new Error("invalid");
    } catch {
      throw new Error("report_evaluation_ledger_invalid");
    }
    async function persist(): Promise<void> {
      if (closed) throw new Error("report_evaluation_closed");
      const next = JSON.stringify(ledgerSchema.parse(state), null, 2) + "\n";
      await writeManaged(root, "budget.json", next, previous, 2 * 1024 * 1024);
      const file = await open(join(root, "budget.json"), constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        await file.sync();
      } finally {
        await file.close();
      }
      const parent = await open(root, constants.O_RDONLY);
      try {
        await parent.sync();
      } finally {
        await parent.close();
      }
      previous = next;
    }
    if (previous === undefined) await persist();
    return {
      async reserve(raw) {
        const input = metadataSchema.parse(raw),
          reserved = maximumReportRunCost(input.profile).attempt_nano_usd;
        if (charged(state.attempts) + reserved > REPORT_AI_EVALUATION_BUDGET_NANO_USD)
          throw new Error("report_evaluation_budget_exceeded");
        if (state.attempts.length >= 1000) throw new Error("report_evaluation_attempt_limit");
        const attempt: Attempt = {
          ...input,
          id: randomUUID(),
          reserved_nano_usd: reserved,
          state: "reserved",
          settled_nano_usd: null,
          outcome_digest: null,
          started_at: new Date().toISOString(),
          finished_at: null,
          outcome: null,
          reason: null,
          usage: null
        };
        state.attempts.push(attempt);
        await persist();
        return structuredClone(attempt);
      },
      async finish(id, outcome) {
        const entry = state.attempts.find((entry) => entry.id === id);
        if (entry === undefined) throw new Error("report_evaluation_attempt_missing");
        const outcomeDigest = digest(outcome);
        if (entry.state !== "reserved") {
          if (entry.outcome_digest !== outcomeDigest)
            throw new Error("report_evaluation_outcome_conflict");
          return;
        }
        if (outcome.state === "uncertain") {
          if (outcome.maximum_nano_usd !== entry.reserved_nano_usd)
            throw new Error("report_evaluation_usage_invalid");
          entry.state = "uncertain";
          entry.reason = outcome.reason;
        } else {
          const usage = ReportModelUsageSchema.parse(outcome.usage),
            cost = actualReportAttemptCost({
              model: entry.profile.model,
              regional_processing: entry.profile.regional_processing,
              usage
            });
          if (
            cost !== outcome.cost_nano_usd ||
            cost > entry.reserved_nano_usd ||
            usage.input_tokens > entry.profile.max_input_tokens ||
            usage.output_tokens > entry.profile.max_output_tokens
          )
            throw new Error("report_evaluation_usage_invalid");
          entry.state = "settled";
          entry.settled_nano_usd = cost;
          entry.usage = usage;
          entry.reason = outcome.state === "rejected" ? outcome.reason : null;
        }
        entry.outcome = outcome.state;
        entry.outcome_digest = outcomeDigest;
        entry.finished_at = new Date().toISOString();
        await persist();
      },
      used_nano_usd: () => charged(state.attempts),
      attempts: () => structuredClone(state.attempts),
      close: release
    };
  } catch (error) {
    await release();
    throw error;
  }
}
