import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { openReviewEvaluationBudget } from "../../../packages/smart-improvements/src/evaluation-budget.js";
it("persists both counter and paid request intent and retains uncertainty across restart", async () => {
  const dir = await mkdtemp(join(tmpdir(), "review-eval-"));
  try {
    const b = await openReviewEvaluationBudget(dir),
      input = { id: "case", fixture_hash: "a".repeat(64), request_hash: "b".repeat(64) };
    expect(await b.begin(input)).toBe(true);
    await b.request("case", "counter");
    await b.request("case", "paid");
    await expect(b.request("case", "paid")).rejects.toThrow();
    await b.close();
    const next = await openReviewEvaluationBudget(dir);
    expect(await next.begin(input)).toBe(false);
    expect(next.snapshot().entries[0]).toMatchObject({
      charged_nano_usd: null,
      endpoints: ["counter", "paid"]
    });
    await expect(next.begin({ ...input, fixture_hash: "c".repeat(64) })).rejects.toThrow(
      "fixture_changed"
    );
    await next.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
it("caps the entire persisted qualification at forty HTTP requests and refuses concurrent owners", async () => {
  const dir = await mkdtemp(join(tmpdir(), "review-eval-"));
  try {
    const b = await openReviewEvaluationBudget(dir);
    await expect(openReviewEvaluationBudget(dir)).rejects.toThrow();
    for (let i = 0; i < 20; i++) {
      const id = `case-${i}`;
      await b.begin({ id, fixture_hash: "a".repeat(64), request_hash: "b".repeat(64) });
      await b.request(id, "counter");
      await b.request(id, "paid");
      await b.finish(id, { state: "uncertain" });
    }
    expect(b.snapshot().entries.reduce((n, e) => n + e.endpoints.length, 0)).toBe(40);
    await expect(
      b.begin({ id: "extra", fixture_hash: "a".repeat(64), request_hash: "b".repeat(64) })
    ).rejects.toThrow("budget_exceeded");
    await b.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
