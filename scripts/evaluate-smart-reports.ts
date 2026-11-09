import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { createHash } from "node:crypto";
import { readManaged, safePath, writeManaged } from "../packages/agent-setup/src/files.js";
import { openReportEvaluationLedger } from "../packages/smart-reports/src/evaluation-ledger.js";
import {
  ReportEvaluationFixturesSchema,
  runReportModelEvaluation
} from "../packages/smart-reports/src/evaluation-runner.js";
import {
  createReportModelClient,
  type ReportModelClient
} from "../packages/smart-reports/src/model-client.js";
import { buildReportModelRequest } from "../packages/smart-reports/src/model-request.js";

async function protectedKey(path: string): Promise<string> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 16 || stat.size > 1024 || (stat.mode & 0o077) !== 0)
      throw new Error("report_evaluation_key_file_invalid");
    const buffer = Buffer.alloc(1025),
      read = await handle.read(buffer, 0, buffer.length, 0);
    if (read.bytesRead > 1024) throw new Error("report_evaluation_key_file_invalid");
    return buffer.subarray(0, read.bytesRead).toString("utf8").trim();
  } finally {
    await handle.close();
  }
}
async function main(): Promise<void> {
  const keyFile = process.argv[2];
  if (keyFile === undefined || process.argv.length !== 3)
    throw new Error("report_evaluation_key_file_required");
  const root = process.cwd(),
    raw = await readManaged(root, "evals/smart-reports/cases.json", 2 * 1024 * 1024);
  if (raw === undefined) throw new Error("report_evaluation_fixtures_missing");
  const fixtures = ReportEvaluationFixturesSchema.parse(JSON.parse(raw)),
    fixtureHash = createHash("sha256").update(raw).digest("hex");
  const transport = createReportModelClient({ apiKey: await protectedKey(keyFile) });
  // This path is deliberately fixed: rerunning never creates another allowance.
  const relative = ".tmp/business-implementation/report-model-evaluation";
  const client: ReportModelClient = {
    async prepare(input) {
      const request = buildReportModelRequest(input),
        file = `${relative}/requests/${request.request_hash}.json`;
      const previous = await readManaged(root, file, 512 * 1024);
      if (previous === undefined)
        await writeManaged(root, file, request.body, undefined, 512 * 1024);
      else if (previous !== request.body)
        throw new Error("report_evaluation_request_archive_conflict");
      return transport.prepare(input);
    }
  };
  const directory = await safePath(root, `${relative}/budget.json`);
  const ledger = await openReportEvaluationLedger(directory.slice(0, -"/budget.json".length));
  try {
    const summary = await runReportModelEvaluation({
      ledger,
      client,
      cases: fixtures.cases,
      fixture_hash: fixtureHash,
      writeOutcome: async (artifact) =>
        writeManaged(
          root,
          `${relative}/outcomes/${artifact.record_id}.json`,
          JSON.stringify(artifact, null, 2) + "\n",
          undefined,
          512 * 1024
        ),
      log: (event) => process.stdout.write(JSON.stringify(event) + "\n")
    });
    process.stdout.write(
      JSON.stringify({
        summary,
        fixture_hash: fixtureHash,
        variant_models: { A: "gpt-6-luna", B: "gpt-6.1-terra" },
        cost_note:
          "Conservative computed USD cost including regional premium; unresolved reservations remain held."
      }) + "\n"
    );
  } finally {
    await ledger.close();
  }
}
main().catch((error) => {
  const message =
    error instanceof Error && /^report_[a-z0-9_]{1,100}$/.test(error.message)
      ? error.message
      : "report_evaluation_failed";
  process.stderr.write(message + "\n");
  process.exitCode = 1;
});
