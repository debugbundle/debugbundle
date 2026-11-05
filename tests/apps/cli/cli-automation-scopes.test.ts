import { describe, expect, it, vi } from "vitest";
import { runCli } from "../../../apps/cli/src/main.js";

describe("explicit automation scope options", () => {
  it("opts into alert scope reads without widening any saved rule", async () => {
    const listAlertsCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "listed" });
    expect(
      (
        await runCli(
          ["alert", "list", "--project-id", "project", "--include-scope", "true", "--json"],
          { listAlertsCommand }
        )
      ).exitCode
    ).toBe(0);
    expect(listAlertsCommand).toHaveBeenCalledWith({
      projectId: "project",
      includeScope: true,
      json: true
    });
    expect(
      (
        await runCli(["alert", "list", "--project-id", "project", "--include-scope", "all"], {
          listAlertsCommand
        })
      ).exitCode
    ).toBe(4);
    expect(listAlertsCommand).toHaveBeenCalledTimes(1);
  });
  it.each([
    ["alert", "update", "rule", "updateAlertCommand"],
    ["webhook", "update", "rule", "updateWebhookCommand"],
    ["github", "rules", "update", "updateProjectGitHubRuleCommand"]
  ])(
    "routes %s scope intent and rejects invalid values",
    async (group, action, arg, dependency) => {
      const command = vi.fn().mockResolvedValue({ exitCode: 0, output: "updated" });
      const argv = [
        group,
        action,
        arg,
        ...(group === "github" ? ["rule"] : []),
        "--project-id",
        "project",
        "--project-scope"
      ];
      expect((await runCli([...argv, "current_project"], { [dependency]: command })).exitCode).toBe(
        0
      );
      expect(command).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: "project", projectScope: "current_project" })
      );
      expect((await runCli([...argv, "all_accounts"], { [dependency]: command })).exitCode).toBe(4);
      expect(command).toHaveBeenCalledTimes(1);
    }
  );
});
