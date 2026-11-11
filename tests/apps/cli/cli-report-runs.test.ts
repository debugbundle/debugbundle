import { describe, expect, it, vi } from "vitest";
import { runCli } from "../../../apps/cli/src/main.js";
import { reportRunsWithAuthCommand } from "../../../apps/cli/src/report-run-commands.js";
import { reportDocumentFixture } from "../../helpers/report-document.js";
import {
  reportId,
  reportOrg,
  reportRequest,
  reportRunFixture
} from "../../helpers/smart-reports.js";
const commandInput = {
  request_id: reportRequest,
  definition_id: reportId,
  expected_version: 1,
  period: reportRunFixture().period
};
describe("report run CLI", () => {
  it("reads the canonical content and renders the same HTML without generation", async () => {
    const view = { document: reportDocumentFixture(), available_source_refs: [] };
    const request = vi.fn().mockResolvedValue({ status: 200, body: view });
    const deps = {
      readAuthState: vi
        .fn()
        .mockResolvedValue({ base_url: "https://app.debugbundle.com", bearer_token: "member" }),
      createHttpClient: () => ({ request })
    };
    expect(
      JSON.parse(
        (
          await reportRunsWithAuthCommand(
            { action: "content", organizationId: reportOrg, runId: reportRequest },
            deps
          )
        ).output
      )
    ).toEqual(view);
    const html = await reportRunsWithAuthCommand(
      { action: "html", organizationId: reportOrg, runId: reportRequest },
      deps
    );
    expect(html.exitCode).toBe(0);
    expect(html.output).toContain("<!doctype html>");
    expect(request).toHaveBeenLastCalledWith({
      method: "GET",
      path: `/v1/organizations/${reportOrg}/reports/${reportRequest}/document?version=2`,
      bearerToken: "member"
    });
  });
  it("preserves explicit period, command identity and regeneration through shared HTTP validation", async () => {
    const command = vi.fn().mockResolvedValue({ exitCode: 0, output: "ok" });
    const result = await runCli(
      [
        "report-runs",
        "generate",
        reportOrg,
        "--command-json",
        JSON.stringify({ ...commandInput, regenerate_from_run_id: reportRequest }),
        "--json"
      ],
      { reportRunsCommand: command }
    );
    expect(result.exitCode).toBe(0);
    expect(command).toHaveBeenCalledWith({
      organizationId: reportOrg,
      action: "generate",
      json: true,
      command: { ...commandInput, send_email: false, regenerate_from_run_id: reportRequest }
    });
    for (const input of [
      { ...commandInput, expected_version: undefined },
      { ...commandInput, model: "caller-model" },
      { ...commandInput, request_id: "new-every-retry" }
    ])
      expect(
        (
          await runCli(
            ["report-runs", "generate", reportOrg, "--command-json", JSON.stringify(input)],
            { reportRunsCommand: command }
          )
        ).exitCode
      ).not.toBe(0);
    expect(command).toHaveBeenCalledTimes(1);
  });
  it("supports stable history pagination and rejects unknown switches before transport", async () => {
    const command = vi.fn().mockResolvedValue({ exitCode: 0, output: "ok" });
    expect(
      (
        await runCli(["report-runs", "list", reportOrg, "--limit", "2"], {
          reportRunsCommand: command
        })
      ).exitCode
    ).toBe(0);
    expect(command).toHaveBeenCalledWith({ action: "list", organizationId: reportOrg, limit: 2 });
    expect(
      (
        await runCli(["report-runs", "delete", reportOrg, reportRequest, "--force"], {
          reportRunsCommand: command
        })
      ).exitCode
    ).not.toBe(0);
    expect(command).toHaveBeenCalledTimes(1);
  });
  it("returns domain refusals without leaking internal errors", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ status: 200, body: { run: reportRunFixture() } })
      .mockResolvedValueOnce({ status: 403, body: { error: "report_access_revoked" } });
    const dependencies = {
      readAuthState: vi
        .fn()
        .mockResolvedValue({ base_url: "https://app.debugbundle.com", bearer_token: "member" }),
      createHttpClient: () => ({ request })
    };
    expect(
      (
        await reportRunsWithAuthCommand(
          { action: "generate", organizationId: reportOrg, command: commandInput },
          dependencies
        )
      ).exitCode
    ).toBe(0);
    expect(
      await reportRunsWithAuthCommand(
        { action: "get", organizationId: reportOrg, runId: reportRequest },
        dependencies
      )
    ).toEqual({ exitCode: 4, output: "report_access_revoked" });
  });
});
