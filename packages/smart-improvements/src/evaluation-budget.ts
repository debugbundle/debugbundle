import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import { readManaged, writeManaged } from "../../agent-setup/src/files.js";
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const entry = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,80}$/),
    fixture_hash: hash,
    request_hash: hash,
    endpoints: z.array(z.enum(["counter", "paid"])).max(2),
    charged_nano_usd: z.number().int().min(0).max(24750000).nullable(),
    outcome: z.enum(["pending", "succeeded", "rejected", "uncertain", "preflight_failed"])
  })
  .strict();
const schema = z
  .object({
    version: z.literal(1),
    profile: z.literal("weekly-review-guidance"),
    budget_nano_usd: z.literal(1000000000),
    request_limit: z.literal(40),
    entries: z.array(entry).max(20)
  })
  .strict();
export type ReviewEvaluationState = z.infer<typeof schema>;
export interface ReviewEvaluationBudget {
  snapshot(): ReviewEvaluationState;
  begin(input: { id: string; fixture_hash: string; request_hash: string }): Promise<boolean>;
  request(id: string, endpoint: "counter" | "paid"): Promise<void>;
  finish(
    id: string,
    result: {
      state: "succeeded" | "rejected" | "uncertain" | "preflight_failed";
      cost_nano_usd?: number;
    }
  ): Promise<void>;
  close(): Promise<void>;
}
/** Evaluation-only fixed allowance. Persist reservations and every provider HTTP
 * request before IO. Interrupted paid calls remain held; restart never retries. */
export async function openReviewEvaluationBudget(
  directory: string
): Promise<ReviewEvaluationBudget> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new Error("review_evaluation_unsafe_directory");
  const token = randomUUID(),
    lock = await open(
      join(directory, "evaluation.lock"),
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600
    );
  let closed = false;
  async function close(): Promise<void> {
    if (closed) return;
    closed = true;
    await lock.close();
    if ((await readManaged(directory, "evaluation.lock")) !== token)
      throw new Error("review_evaluation_lock_changed");
    await unlink(join(directory, "evaluation.lock"));
  }
  try {
    await lock.writeFile(token);
    await lock.sync();
    const raw = await readManaged(directory, "budget.json", 128 * 1024);
    if (raw === undefined && (await readdir(directory)).some((p) => p !== "evaluation.lock"))
      throw new Error("review_evaluation_ledger_missing");
    let previous = raw;
    const state = schema.parse(
      raw === undefined
        ? {
            version: 1,
            profile: "weekly-review-guidance",
            budget_nano_usd: 1000000000,
            request_limit: 40,
            entries: []
          }
        : JSON.parse(raw)
    );
    if (
      new Set(state.entries.map((e) => e.id)).size !== state.entries.length ||
      state.entries.some((e) => new Set(e.endpoints).size !== e.endpoints.length) ||
      state.entries.some(
        (e) =>
          (e.endpoints.includes("paid") && e.endpoints[0] !== "counter") ||
          (["pending", "uncertain"].includes(e.outcome) && e.charged_nano_usd !== null) ||
          (e.outcome === "preflight_failed" &&
            (e.endpoints.includes("paid") || e.charged_nano_usd !== 0)) ||
          (["succeeded", "rejected"].includes(e.outcome) &&
            (!e.endpoints.includes("paid") || e.charged_nano_usd === null))
      )
    )
      throw new Error("review_evaluation_ledger_invalid");
    const charged = (): number =>
      state.entries.reduce((n, e) => n + (e.charged_nano_usd ?? 24750000), 0);
    const requests = (): number => state.entries.reduce((n, e) => n + e.endpoints.length, 0);
    if (charged() > state.budget_nano_usd || requests() > state.request_limit)
      throw new Error("review_evaluation_budget_exceeded");
    async function save(): Promise<void> {
      if (closed) throw new Error("review_evaluation_closed");
      const next = JSON.stringify(state, null, 2) + "\n";
      await writeManaged(directory, "budget.json", next, previous, 128 * 1024);
      const file = await open(
        join(directory, "budget.json"),
        constants.O_RDONLY | constants.O_NOFOLLOW
      );
      try {
        await file.sync();
      } finally {
        await file.close();
      }
      const parent = await open(directory, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        await parent.sync();
      } finally {
        await parent.close();
      }
      previous = next;
    }
    if (raw === undefined) await save();
    function get(id: string): z.infer<typeof entry> {
      const item = state.entries.find((e) => e.id === id);
      if (!item) throw new Error("review_evaluation_case_missing");
      return item;
    }
    return {
      snapshot: (): ReviewEvaluationState => structuredClone(state),
      async begin(input: {
        id: string;
        fixture_hash: string;
        request_hash: string;
      }): Promise<boolean> {
        const existing = state.entries.find((e) => e.id === input.id);
        if (existing) {
          if (
            existing.fixture_hash !== input.fixture_hash ||
            existing.request_hash !== input.request_hash
          )
            throw new Error("review_evaluation_fixture_changed");
          return false;
        }
        if (
          state.entries.length >= 20 ||
          charged() + 24750000 > state.budget_nano_usd ||
          requests() + 2 > 40
        )
          throw new Error("review_evaluation_budget_exceeded");
        state.entries.push(
          entry.parse({ ...input, endpoints: [], charged_nano_usd: null, outcome: "pending" })
        );
        await save();
        return true;
      },
      async request(id: string, endpoint: "counter" | "paid"): Promise<void> {
        const item = get(id);
        if (
          item.outcome !== "pending" ||
          item.endpoints.includes(endpoint) ||
          requests() >= 40 ||
          (endpoint === "paid" && !item.endpoints.includes("counter"))
        )
          throw new Error("review_evaluation_request_denied");
        item.endpoints.push(endpoint);
        await save();
      },
      async finish(
        id: string,
        result: {
          state: "succeeded" | "rejected" | "uncertain" | "preflight_failed";
          cost_nano_usd?: number;
        }
      ): Promise<void> {
        const item = get(id);
        if (item.outcome !== "pending") throw new Error("review_evaluation_already_settled");
        if (result.state === "preflight_failed") {
          if (item.endpoints.includes("paid"))
            throw new Error("review_evaluation_paid_outcome_unknown");
          item.charged_nano_usd = 0;
        } else if (result.state !== "uncertain") {
          if (!item.endpoints.includes("paid"))
            throw new Error("review_evaluation_paid_receipt_missing");
          item.charged_nano_usd = z.number().int().min(0).max(24750000).parse(result.cost_nano_usd);
        }
        item.outcome = result.state;
        await save();
      },
      close
    };
  } catch (error) {
    await close();
    throw error;
  }
}
