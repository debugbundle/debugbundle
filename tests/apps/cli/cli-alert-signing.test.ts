import { describe, expect, it, vi } from "vitest";

import { runCli } from "../../../apps/cli/src/main.js";

describe("CLI alert webhook signing", () => {
  it("routes an explicit signing-secret rotation to alert management", async () => {
    const updateAlertCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "rotated" });
    const result = await runCli([
      "alert", "update", "al_123", "--project-id", "proj_123",
      "--channel", "webhook", "--rotate-signing-secret", "true"
    ], { updateAlertCommand });

    expect(result.exitCode).toBe(0);
    expect(updateAlertCommand).toHaveBeenCalledWith({
      alertId: "al_123", projectId: "proj_123", channel: "webhook",
      rotateSigningSecret: true
    });
  });
});
