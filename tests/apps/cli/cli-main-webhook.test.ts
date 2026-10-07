import { describe, expect, it, vi } from "vitest";
import { runCli } from "../../../apps/cli/src/main.js";

describe("cli webhook filter routing", () => {
  it.each([
    {},
    { service: [], environment: ["production"], verification: false },
    { severity_min: "critical", bundle_type: ["failure"] }
  ])("passes explicit replacement filters, including empty objects: %j", async (filters) => {
    const updateWebhookCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "updated" });
    const result = await runCli(
      [
        "webhook",
        "update",
        "wh_123",
        "--project-id",
        "proj_123",
        "--filters-json",
        JSON.stringify(filters),
        "--json"
      ],
      { updateWebhookCommand }
    );
    expect(result.exitCode).toBe(0);
    expect(updateWebhookCommand).toHaveBeenCalledWith({
      webhookId: "wh_123",
      projectId: "proj_123",
      filters,
      json: true
    });
  });

  it("preserves existing omission behavior and false-valued filter flags", async () => {
    const updateWebhookCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "updated" });
    await runCli(
      ["webhook", "update", "wh_123", "--project-id", "proj_123", "--is-enabled", "false"],
      { updateWebhookCommand }
    );
    expect(updateWebhookCommand).toHaveBeenLastCalledWith({
      webhookId: "wh_123",
      projectId: "proj_123",
      isEnabled: false
    });
    await runCli(
      ["webhook", "update", "wh_123", "--project-id", "proj_123", "--verification", "false"],
      { updateWebhookCommand }
    );
    expect(updateWebhookCommand).toHaveBeenLastCalledWith({
      webhookId: "wh_123",
      projectId: "proj_123",
      filters: { verification: false }
    });
  });

  it.each([
    "null",
    "[]",
    "42",
    '"text"',
    '{"unknown":true}',
    '{"severity_min":"invalid"}',
    "not-json"
  ])("rejects invalid filter JSON without calling the update command: %s", async (json) => {
    const updateWebhookCommand = vi.fn();
    const result = await runCli(
      ["webhook", "update", "wh_123", "--project-id", "proj_123", "--filters-json", json],
      { updateWebhookCommand }
    );
    expect(result.exitCode).toBe(4);
    expect(result.output).toContain("Invalid value for --filters-json.");
    expect(updateWebhookCommand).not.toHaveBeenCalled();
  });

  it.each([
    ["--environment", "production"],
    ["--service", "api"],
    ["--severity-min", "high"],
    ["--bundle-type", "failure"],
    ["--verification", "false"]
  ])("rejects ambiguous mixing of JSON and individual filters: %s", async (...filterOption) => {
    const updateWebhookCommand = vi.fn();
    const result = await runCli(
      [
        "webhook",
        "update",
        "wh_123",
        "--project-id",
        "proj_123",
        "--filters-json",
        "{}",
        ...filterOption
      ],
      { updateWebhookCommand }
    );
    expect(result.exitCode).toBe(4);
    expect(result.output).toContain(
      "--filters-json cannot be combined with individual filter options."
    );
    expect(updateWebhookCommand).not.toHaveBeenCalled();
  });
});
