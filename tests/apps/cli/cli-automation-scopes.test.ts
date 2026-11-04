import { describe, expect, it, vi } from "vitest";
import { runCli } from "../../../apps/cli/src/main.js";

describe("explicit automation scope options", () => {
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
