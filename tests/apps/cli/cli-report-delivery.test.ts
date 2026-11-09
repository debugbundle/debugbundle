import { expect, it, vi } from "vitest";
import { runCli } from "../../../apps/cli/src/main.js";
import { reportRunsWithAuthCommand } from "../../../apps/cli/src/report-run-commands.js";
import {
  reportEmailDeliveryFixture,
  reportOrg,
  reportRequest
} from "../../helpers/smart-reports.js";
it("provides report delivery states through the same authenticated client without triggering a send", async () => {
  const command = vi.fn().mockResolvedValue({ exitCode: 0, output: "ok" });
  expect(
    (
      await runCli(["report-runs", "deliveries", reportOrg, reportRequest, "--json"], {
        reportRunsCommand: command
      })
    ).exitCode
  ).toBe(0);
  expect(command).toHaveBeenCalledWith({
    action: "deliveries",
    organizationId: reportOrg,
    runId: reportRequest,
    json: true
  });
  const delivery = reportEmailDeliveryFixture(),
    request = vi.fn().mockResolvedValue({ status: 200, body: { deliveries: [delivery] } }),
    result = await reportRunsWithAuthCommand(
      { action: "deliveries", organizationId: reportOrg, runId: reportRequest, json: true },
      {
        readAuthState: vi
          .fn()
          .mockResolvedValue({ base_url: "https://api.example.test", bearer_token: "member" }),
        createHttpClient: () => ({ request })
      }
    );
  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.output)).toEqual({ deliveries: [delivery] });
  expect(request.mock.calls[0]?.[0]).toMatchObject({ method: "GET" });
});
