import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import cases from "../../../evals/smart-reports/cases.json" with { type: "json" };
import { runReportModelEvaluation } from "../../../packages/smart-reports/src/evaluation-runner.js";
import { openReportEvaluationLedger } from "../../../packages/smart-reports/src/evaluation-ledger.js";
import { buildReportModelRequest } from "../../../packages/smart-reports/src/model-request.js";
import type { ReportModelClient } from "../../../packages/smart-reports/src/model-client.js";
describe("report comparison orchestration", () => {
  it("reserves each paid send, preserves unknown charges and skips prior attempt identities on rerun", async () => {
    const directory = await mkdtemp(join(tmpdir(), "report-eval-runner-")),
      ledger = await openReportEvaluationLedger(directory),
      writeOutcome = vi.fn().mockResolvedValue(undefined);
    try {
      let paid = 0;
      const prepare = vi.fn<ReportModelClient["prepare"]>().mockImplementation(async (input) => {
        const request = buildReportModelRequest(input);
        return {
          input_tokens: 1000,
          profile: request.profile,
          request_hash: request.request_hash,
          maximum_nano_usd: request.maximum_nano_usd,
          run: async (before) => {
            await before();
            expect(ledger.used_nano_usd()).toBeGreaterThan(0);
            paid++;
            return {
              state: "uncertain",
              reason: "report_provider_outcome_unknown",
              maximum_nano_usd: request.maximum_nano_usd,
              elapsed_ms: 10
            };
          }
        };
      });
      const input = {
        ledger,
        client: { prepare },
        cases: [cases.cases[0]!],
        fixture_hash: "a".repeat(64),
        writeOutcome,
        log: vi.fn()
      };
      expect(await runReportModelEvaluation(input)).toMatchObject({ attempted: 2, uncertain: 2 });
      expect(paid).toBe(2);
      expect(ledger.used_nano_usd()).toBe(34_650_000);
      expect(await runReportModelEvaluation(input)).toMatchObject({ skipped: 2, attempted: 0 });
      expect(paid).toBe(2);
      expect(prepare).toHaveBeenCalledTimes(2);
      expect(writeOutcome).toHaveBeenCalledTimes(2);
    } finally {
      await ledger.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("records a candidate preflight failure without admitting a paid attempt", async () => {
    const directory = await mkdtemp(join(tmpdir(), "report-eval-runner-")),
      ledger = await openReportEvaluationLedger(directory),
      writeOutcome = vi.fn().mockResolvedValue(undefined);
    try {
      const prepare = vi.fn().mockRejectedValue(new Error("report_input_limit_exceeded"));
      const result = await runReportModelEvaluation({
        ledger,
        client: { prepare },
        cases: [cases.cases[0]!],
        fixture_hash: "a".repeat(64),
        writeOutcome,
        log: vi.fn()
      });
      expect(result).toMatchObject({ attempted: 0, preflight_failed: 2 });
      expect(ledger.used_nano_usd()).toBe(0);
      expect(writeOutcome).toHaveBeenCalledTimes(2);
    } finally {
      await ledger.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("stops after a provider authentication failure instead of repeating it for more cases", async () => {
    const directory = await mkdtemp(join(tmpdir(), "report-eval-runner-")),
      ledger = await openReportEvaluationLedger(directory),
      writeOutcome = vi.fn().mockResolvedValue(undefined);
    try {
      const prepare = vi.fn().mockRejectedValue(new Error("report_preflight_http_401"));
      await expect(
        runReportModelEvaluation({
          ledger,
          client: { prepare },
          cases: [cases.cases[0]!],
          fixture_hash: "a".repeat(64),
          writeOutcome,
          log: vi.fn()
        })
      ).rejects.toThrow("report_preflight_http_401");
      expect(prepare).toHaveBeenCalledTimes(1);
      expect(ledger.used_nano_usd()).toBe(0);
      expect(writeOutcome).toHaveBeenCalledOnce();
    } finally {
      await ledger.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
