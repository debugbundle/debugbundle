import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { nodeFetch } from "../packages/node-http/src/index.js";
import { writeManaged, safePath } from "../packages/agent-setup/src/files.js";
import { openReviewEvaluationBudget } from "../packages/smart-improvements/src/evaluation-budget.js";
import {
  buildReviewModelRequest,
  createReviewModelClient
} from "../packages/smart-improvements/src/model-client.js";
import { planReview } from "../packages/smart-improvements/src/review-planning.js";
import { planningCases } from "../evals/smart-improvements/planning-cases.js";

async function key(path: string): Promise<string> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 16 || stat.size > 1024 || (stat.mode & 0o077) !== 0)
      throw new Error("review_evaluation_key_invalid");
    const data = Buffer.alloc(1025),
      read = await handle.read(data, 0, data.length, 0);
    if (read.bytesRead > 1024) throw new Error("review_evaluation_key_invalid");
    return data.subarray(0, read.bytesRead).toString("utf8").trim();
  } finally {
    await handle.close();
  }
}
async function main(): Promise<void> {
  const path = process.argv[2];
  if (!path || process.argv.length !== 4 || process.argv[3] !== "--approved-bounded-guidance")
    throw new Error("review_evaluation_explicit_approval_required");
  const apiKey = await key(path),
    root = process.cwd(),
    relative = ".tmp/smart-improvements-guidance-evaluation";
  await safePath(root, `${relative}/budget.json`);
  const budget = await openReviewEvaluationBudget(join(root, relative));
  try {
    for (const fixture of planningCases()) {
      if (planReview(fixture.facts, fixture.context).length === 0) continue;
      const request = buildReviewModelRequest(fixture.facts, fixture.context);
      const fixtureHash = createHash("sha256").update(JSON.stringify(fixture)).digest("hex");
      if (
        !(await budget.begin({
          id: fixture.id,
          fixture_hash: fixtureHash,
          request_hash: request.request_hash
        }))
      )
        continue;
      const fetch: typeof globalThis.fetch = async (url, init) => {
        const endpoint = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
        if (
          endpoint !== "https://api.openai.com/v1/responses" &&
          endpoint !== "https://api.openai.com/v1/responses/input_tokens"
        )
          throw new Error("review_evaluation_origin_denied");
        await budget.request(fixture.id, endpoint.endsWith("input_tokens") ? "counter" : "paid");
        return nodeFetch(url, init);
      };
      const client = createReviewModelClient({ apiKey, fetch });
      let prepared;
      try {
        prepared = await client.prepare({
          facts: fixture.facts,
          context: fixture.context,
          identities: ["HiddenAcme", "隠された"]
        });
      } catch {
        await budget.finish(fixture.id, { state: "preflight_failed" });
        continue;
      }
      const outcome = await prepared.run(async () => {});
      await budget.finish(fixture.id, {
        state: outcome.state,
        ...(outcome.state === "uncertain" ? {} : { cost_nano_usd: outcome.cost_nano_usd })
      });
      await writeManaged(
        root,
        `${relative}/outcomes/${fixture.id}.json`,
        JSON.stringify(
          {
            case_id: fixture.id,
            profile: "weekly-review-guidance",
            fixture_hash: fixtureHash,
            request_hash: request.request_hash,
            outcome,
            qualified: false,
            quality_review:
              "pending; score specificity, practical next step, falsifiability and verification; require at least seven of eight and every safety gate"
          },
          null,
          2
        ) + "\n",
        undefined,
        256 * 1024
      );
      process.stdout.write(JSON.stringify({ case_id: fixture.id, state: outcome.state }) + "\n");
    }
    const state = budget.snapshot();
    process.stdout.write(
      JSON.stringify({
        profile: state.profile,
        factual_only_cases: planningCases()
          .filter((fixture) => planReview(fixture.facts, fixture.context).length === 0)
          .map((fixture) => fixture.id),
        provider_requests: state.entries.reduce((n, e) => n + e.endpoints.length, 0),
        charged_or_held_nano_usd: state.entries.reduce(
          (n, e) => n + (e.charged_nano_usd ?? 24750000),
          0
        ),
        qualified: false,
        quality_review_required: true
      }) + "\n"
    );
  } finally {
    await budget.close();
  }
}
main().catch(() => {
  process.stderr.write("review_evaluation_failed; inspect the bounded ledger before resuming\n");
  process.exitCode = 1;
});
