import { describe, expect, it, vi } from "vitest";

import { runCli } from "../../../apps/cli/src/main.js";

const STEPS = JSON.stringify([
  { step_key: "landing", display_name: "Landing" },
  { step_key: "complete", display_name: "Complete" }
]);

describe("CLI saved analytics funnel routing", () => {
  it("routes list, create, update, and archive inputs", async () => {
    const listAnalyticsSavedFunnelsCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, output: "list" });
    const createAnalyticsSavedFunnelCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, output: "create" });
    const updateAnalyticsSavedFunnelCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, output: "update" });
    const archiveAnalyticsSavedFunnelCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, output: "archive" });

    await runCli(["analytics", "saved-funnels", "list", "--project", "project-1", "--json"], {
      listAnalyticsSavedFunnelsCommand
    });
    await runCli(
      [
        "analytics",
        "saved-funnels",
        "create",
        "--project",
        "project-1",
        "--key",
        "signup",
        "--name",
        "Signup",
        "--steps-json",
        STEPS
      ],
      { createAnalyticsSavedFunnelCommand }
    );
    await runCli(
      [
        "analytics",
        "saved-funnels",
        "update",
        "signup",
        "--project",
        "project-1",
        "--name",
        "Onboarding",
        "--steps-json",
        STEPS
      ],
      { updateAnalyticsSavedFunnelCommand }
    );
    await runCli(["analytics", "saved-funnels", "archive", "signup", "--project", "project-1"], {
      archiveAnalyticsSavedFunnelCommand
    });

    expect(listAnalyticsSavedFunnelsCommand).toHaveBeenCalledWith({
      projectId: "project-1",
      json: true
    });
    expect(createAnalyticsSavedFunnelCommand).toHaveBeenCalledWith({
      projectId: "project-1",
      definition: { funnel_key: "signup", display_name: "Signup", steps: JSON.parse(STEPS) }
    });
    expect(updateAnalyticsSavedFunnelCommand).toHaveBeenCalledWith({
      projectId: "project-1",
      funnelKey: "signup",
      update: { display_name: "Onboarding", steps: JSON.parse(STEPS) }
    });
    expect(archiveAnalyticsSavedFunnelCommand).toHaveBeenCalledWith({
      projectId: "project-1",
      funnelKey: "signup"
    });
  });

  it("rejects malformed definitions, empty updates, and unknown options", async () => {
    const malformed = await runCli([
      "analytics",
      "saved-funnels",
      "create",
      "--project",
      "project-1",
      "--key",
      "signup",
      "--name",
      "Signup",
      "--steps-json",
      "[]"
    ]);
    const emptyUpdate = await runCli([
      "analytics",
      "saved-funnels",
      "update",
      "signup",
      "--project",
      "project-1"
    ]);
    const unknown = await runCli([
      "analytics",
      "saved-funnels",
      "list",
      "--project",
      "project-1",
      "--unknown",
      "value"
    ]);

    expect(malformed).toMatchObject({
      exitCode: 4,
      output: expect.stringContaining("Invalid saved funnel definition")
    });
    expect(emptyUpdate).toMatchObject({
      exitCode: 4,
      output: expect.stringContaining("Invalid saved funnel update")
    });
    expect(unknown).toMatchObject({
      exitCode: 4,
      output: expect.stringContaining("Unknown option --unknown")
    });
  });
});
