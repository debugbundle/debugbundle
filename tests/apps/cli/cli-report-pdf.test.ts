import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, writeFile, stat, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runCli } from "../../../apps/cli/src/main.js";
import { reportRunsWithAuthCommand } from "../../../apps/cli/src/report-run-commands.js";
import { reportOrg, reportRequest } from "../../helpers/smart-reports.js";
const pdf = { run_id: reportRequest, status: "queued", retry_after_seconds: 2 };
const bytes = new TextEncoder().encode("%PDF-1.7\nfixture\n%%EOF\n");
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "debugbundle-report-pdf-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
function fixture() {
  const request = vi.fn().mockResolvedValue({ status: 202, body: { pdf } }),
    requestBinary = vi
      .fn()
      .mockResolvedValue({ status: 200, body: bytes, contentType: "application/pdf" });
  return {
    request,
    requestBinary,
    dependencies: {
      readAuthState: vi
        .fn()
        .mockResolvedValue({ base_url: "https://api.example.test", bearer_token: "member" }),
      createHttpClient: () => ({ request, requestBinary })
    }
  };
}
describe("report PDF CLI", () => {
  it("parses explicit preparation/status/download commands and requires an output path without force", async () => {
    const command = vi.fn().mockResolvedValue({ exitCode: 0, output: "ok" }),
      path = join(directory, "monthly.pdf");
    expect(
      (
        await runCli(["report-runs", "pdf-prepare", reportOrg, reportRequest], {
          reportRunsCommand: command
        })
      ).exitCode
    ).toBe(0);
    expect(command).toHaveBeenLastCalledWith({
      action: "pdf-prepare",
      organizationId: reportOrg,
      runId: reportRequest
    });
    expect(
      (
        await runCli(["report-runs", "pdf-download", reportOrg, reportRequest, "--output", path], {
          reportRunsCommand: command
        })
      ).exitCode
    ).toBe(0);
    expect(command).toHaveBeenLastCalledWith({
      action: "pdf-download",
      organizationId: reportOrg,
      runId: reportRequest,
      outputPath: path
    });
    expect(
      (
        await runCli(["report-runs", "pdf-download", reportOrg, reportRequest], {
          reportRunsCommand: command
        })
      ).exitCode
    ).not.toBe(0);
    expect(
      (
        await runCli(
          ["report-runs", "pdf-download", reportOrg, reportRequest, "--output", path, "--force"],
          { reportRunsCommand: command }
        )
      ).exitCode
    ).not.toBe(0);
    expect(command).toHaveBeenCalledTimes(2);
  });
  it("writes only a fully validated PDF with private permissions and never overwrites existing output", async () => {
    const { dependencies, requestBinary } = fixture(),
      path = join(directory, "monthly.pdf"),
      input = {
        action: "pdf-download" as const,
        organizationId: reportOrg,
        runId: reportRequest,
        outputPath: path,
        json: true
      };
    expect((await reportRunsWithAuthCommand(input, dependencies)).exitCode).toBe(0);
    expect(await readFile(path)).toEqual(Buffer.from(bytes));
    if (process.platform !== "win32") expect((await stat(path)).mode & 0o777).toBe(0o600);
    await writeFile(path, "preserved");
    const refused = await reportRunsWithAuthCommand(input, dependencies);
    expect(refused.exitCode).not.toBe(0);
    expect(refused.output).toContain("report_pdf_output_exists");
    expect(await readFile(path, "utf8")).toBe("preserved");
    expect(requestBinary).toHaveBeenCalledOnce();
  });
  it("leaves no partial file after a denied or invalid download and exposes preparation state as JSON", async () => {
    const { dependencies, requestBinary } = fixture(),
      path = join(directory, "monthly.pdf");
    requestBinary.mockResolvedValueOnce({
      status: 200,
      body: new TextEncoder().encode("not a PDF"),
      contentType: "application/pdf"
    });
    expect(
      (
        await reportRunsWithAuthCommand(
          {
            action: "pdf-download",
            organizationId: reportOrg,
            runId: reportRequest,
            outputPath: path
          },
          dependencies
        )
      ).exitCode
    ).not.toBe(0);
    expect(await readdir(directory)).toEqual([]);
    expect(
      JSON.parse(
        (
          await reportRunsWithAuthCommand(
            { action: "pdf-prepare", organizationId: reportOrg, runId: reportRequest },
            dependencies
          )
        ).output
      )
    ).toEqual({ pdf });
  });
});
