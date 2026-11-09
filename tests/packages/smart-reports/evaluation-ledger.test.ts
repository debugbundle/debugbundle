import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openReportEvaluationLedger } from "../../../packages/smart-reports/src/evaluation-ledger.js";
import { reportModelProfile } from "../../../packages/smart-reports/src/model-request.js";
const roots: string[] = [];
async function root() {
  const value = await mkdtemp(join(tmpdir(), "report-eval-test-"));
  roots.push(value);
  return value;
}
const metadata = {
  case_id: "quiet-complete",
  fixture_hash: "a".repeat(64),
  request_hash: "b".repeat(64),
  profile: reportModelProfile("gpt-6.1-terra")
};
afterEach(async () => {
  for (const path of roots.splice(0)) await rm(path, { recursive: true, force: true });
});
describe("paid report evaluation ledger", () => {
  it("holds unknown paid outcomes across reopen and refuses concurrent execution", async () => {
    const directory = await root(),
      ledger = await openReportEvaluationLedger(directory);
    const attempt = await ledger.reserve(metadata);
    expect(ledger.used_nano_usd()).toBe(24_750_000);
    await expect(openReportEvaluationLedger(directory)).rejects.toThrow("report_evaluation_locked");
    await ledger.finish(attempt.id, {
      state: "uncertain",
      reason: "report_provider_outcome_unknown",
      maximum_nano_usd: 24_750_000,
      elapsed_ms: 5
    });
    await ledger.close();
    const recovered = await openReportEvaluationLedger(directory);
    expect(recovered.used_nano_usd()).toBe(24_750_000);
    expect(recovered.attempts()).toHaveLength(1);
    await recovered.close();
  });
  it("fails before another reservation can exceed the single approved total", async () => {
    const ledger = await openReportEvaluationLedger(await root());
    try {
      for (let index = 0; index < 40; index++)
        await ledger.reserve({ ...metadata, case_id: `case-${index}` });
      expect(ledger.used_nano_usd()).toBe(990_000_000);
      await expect(ledger.reserve({ ...metadata, case_id: "one-too-many" })).rejects.toThrow(
        "report_evaluation_budget_exceeded"
      );
      expect(ledger.attempts()).toHaveLength(40);
    } finally {
      await ledger.close();
    }
  });
  it("settles verified usage conservatively and cannot overwrite a terminal outcome", async () => {
    const ledger = await openReportEvaluationLedger(await root());
    try {
      const attempt = await ledger.reserve(metadata);
      const result = {
        state: "rejected" as const,
        reason: "report_output_incomplete",
        provider_response_id: "resp_synthetic",
        elapsed_ms: 4,
        cost_nano_usd: 660000,
        usage: {
          input_tokens: 100,
          output_tokens: 100,
          total_tokens: 200,
          input_tokens_details: {
            cached_tokens: 0,
            cache_write_tokens: 0,
            cache_write_tokens_details: { ttl_30m_tokens: 0, ttl_12h_tokens: 0 }
          },
          output_tokens_details: { reasoning_tokens: 0 }
        }
      };
      await ledger.finish(attempt.id, result);
      await ledger.finish(attempt.id, result);
      expect(ledger.used_nano_usd()).toBe(660000);
      await expect(ledger.finish(attempt.id, { ...result, elapsed_ms: 5 })).rejects.toThrow(
        "report_evaluation_outcome_conflict"
      );
    } finally {
      await ledger.close();
    }
  });
  it("refuses a corrupt ledger rather than creating a fresh spend allowance", async () => {
    const directory = await root(),
      ledger = await openReportEvaluationLedger(directory);
    await ledger.reserve(metadata);
    await ledger.close();
    const fs = await import("node:fs/promises");
    await fs.writeFile(join(directory, "budget.json"), "{}");
    await expect(openReportEvaluationLedger(directory)).rejects.toThrow(
      "report_evaluation_ledger_invalid"
    );
    expect(await readFile(join(directory, "budget.json"), "utf8")).toBe("{}");
  });
});
