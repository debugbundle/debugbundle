import { describe, expect, it, vi } from "vitest";
import { runCli } from "../../../apps/cli/src/main.js";
import { reportsWithAuthCommand } from "../../../apps/cli/src/report-commands.js";
import {
  reportDefinitionFixture,
  reportDefinitionInput,
  reportId,
  reportOrg,
  reportRequest
} from "../../helpers/smart-reports.js";
describe("Smart Report CLI", () => {
  it("requires the saved version for deletion and preserves it through the authenticated request", async () => {
    const command = vi.fn();
    for (const version of [undefined, "0"]) {
      const result = await runCli(
        [
          "reports",
          "delete",
          reportOrg,
          reportId,
          ...(version === undefined ? [] : ["--expected-version", version])
        ],
        { reportsCommand: command }
      );
      expect(result.exitCode).not.toBe(0);
    }
    expect(command).not.toHaveBeenCalled();
    expect(
      (
        await runCli(
          ["reports", "delete", reportOrg, reportId, "--expected-version", "7", "--json"],
          { reportsCommand: command.mockResolvedValue({ exitCode: 0, output: "deleted" }) }
        )
      ).exitCode
    ).toBe(0);
    expect(command).toHaveBeenCalledWith({
      action: "delete",
      organizationId: reportOrg,
      definitionId: reportId,
      expectedVersion: 7,
      json: true
    });
  });
  it("parses the full consent, stable request and explicit project selection", async () => {
    const command = vi.fn().mockResolvedValue({ exitCode: 0, output: "ok" });
    expect(
      (
        await runCli(
          [
            "reports",
            "create",
            reportOrg,
            "--request-id",
            reportRequest,
            "--definition-json",
            JSON.stringify(reportDefinitionInput()),
            "--json"
          ],
          { reportsCommand: command }
        )
      ).exitCode
    ).toBe(0);
    expect(command).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "create",
        organizationId: reportOrg,
        requestId: reportRequest,
        json: true,
        definition: expect.objectContaining({
          project_ids: reportDefinitionInput().project_ids,
          privacy_mode: "full",
          source_collection_consent: true
        })
      })
    );
  });
  it("refuses stale-free updates and unknown options before transport", async () => {
    const command = vi.fn();
    expect(
      (
        await runCli(
          [
            "reports",
            "update",
            reportOrg,
            reportId,
            "--definition-json",
            JSON.stringify(reportDefinitionInput())
          ],
          { reportsCommand: command }
        )
      ).exitCode
    ).not.toBe(0);
    expect(
      (
        await runCli(
          ["reports", "delete", reportOrg, reportId, "--expected-version", "1", "--force"],
          { reportsCommand: command }
        )
      ).exitCode
    ).not.toBe(0);
    expect(command).not.toHaveBeenCalled();
  });
  it("uses the same validated HTTP client and returns server policy failures", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ status: 200, body: { definitions: [reportDefinitionFixture()] } })
      .mockResolvedValueOnce({ status: 403, body: { error: "forbidden" } });
    const dependencies = {
      readAuthState: vi
        .fn()
        .mockResolvedValue({ bearer_token: "member", base_url: "https://app.debugbundle.com" }),
      createHttpClient: () => ({ request })
    };
    const input = { action: "list" as const, organizationId: reportOrg, json: true };
    expect(
      JSON.parse((await reportsWithAuthCommand(input, dependencies)).output).definitions[0].id
    ).toBe(reportId);
    expect((await reportsWithAuthCommand(input, dependencies)).exitCode).toBe(4);
  });
});

it("exposes shared allowance forecast without a report mutation", async () => {
  const command = vi.fn().mockResolvedValue({ exitCode: 0, output: "ok" });
  expect(
    (
      await runCli(["reports", "allowance", reportOrg, reportId, "--json"], {
        reportsCommand: command
      })
    ).exitCode
  ).toBe(0);
  expect(command).toHaveBeenCalledWith({
    action: "allowance",
    organizationId: reportOrg,
    definitionId: reportId,
    json: true
  });
});
