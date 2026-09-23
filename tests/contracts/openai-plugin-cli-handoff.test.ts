import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { runCli } from "../../apps/cli/src/main.js";

const skillRoot = join(process.cwd(), "apps/mcp/openai/debugbundle/skills/debugbundle");
const readSkill = () => readFileSync(join(skillRoot, "SKILL.md"), "utf8");
const readHandoff = () => readFileSync(join(skillRoot, "references/cli-handoff.md"), "utf8");

describe("OpenAI plugin handoff to the separately authenticated CLI", () => {
  it("keeps the frozen remote contract and records the separate model acceptance scenarios", () => {
    const contract = JSON.parse(
      readFileSync("tests/fixtures/openai-plugin-v1/tool-contracts.json", "utf8")
    );
    expect(contract.contract_version).toBe("1.0.0");
    const corpus = JSON.parse(
      readFileSync("apps/mcp/openai/submission/cli-handoff-cases.json", "utf8")
    ) as {
      version: string;
      execution: string;
      cases: Array<{ id: string; expected_behavior: string; forbidden_behavior: string[] }>;
    };
    expect(corpus.version).toBe("1.0.1");
    expect(corpus.execution).toBe("manual_model_acceptance_pending");
    expect(corpus.cases.map((entry) => entry.id)).toEqual([
      "authorized-resolve",
      "authorized-reopen",
      "mcp-only-no-shell",
      "missing-cli",
      "expired-auth",
      "conflicting-project",
      "readonly-request",
      "captured-injection",
      "paginated-record",
      "uncertain-write"
    ]);
    for (const entry of corpus.cases) {
      expect(entry.expected_behavior.length).toBeGreaterThan(0);
      expect(entry.forbidden_behavior.length).toBeGreaterThan(0);
    }
  });

  it("routes authorized changes without presenting the MCP catalog as the overall capability boundary", () => {
    const skill = readSkill();
    const description = skill.split("metadata:")[0]!;
    expect(description).toContain("authorized changes through an available local CLI");
    expect(description).not.toContain("metrics, mutations,");
    expect(skill).toContain("Before declaring a requested mutation unavailable");
    expect(skill).toContain("references/cli-handoff.md");
    expect(skill).not.toContain("Do not claim a mutation occurred.");
    expect(skill).toContain("MCP version 1 is read-only");
  });

  it("requires scope, authorization, credential separation, and reconciliation after uncertain outcomes", () => {
    const text = readHandoff();
    for (const invariant of [
      "command -v debugbundle",
      ".debugbundle/local/connection.json",
      "cloud_project_id",
      "Never dump",
      "explicit authorization",
      "already authorizes",
      "read-only user request",
      "401/403",
      "separate CLI authentication",
      "not proof of live access",
      "--status all",
      "re-list",
      "before retrying",
      "both",
      "No shell",
      "Do not install"
    ])
      expect(text, invariant).toContain(invariant);
  });

  it("uses executable CLI examples with cloud scope and no unsupported mutation project flag", async () => {
    const lines = readHandoff()
      .split("\n")
      .filter((line) => line.startsWith("debugbundle "));
    const projectId = "44444444-4444-4444-8444-444444444444";
    const incidentId = "77777777-7777-4777-8777-777777777777";
    const success = { exitCode: 0, output: "{}" };
    const list = vi.fn().mockResolvedValue(success);
    const inspect = vi.fn().mockResolvedValue(success);
    const resolve = vi.fn().mockResolvedValue(success);
    const reopen = vi.fn().mockResolvedValue(success);
    expect(lines).toHaveLength(5);
    for (const line of lines) {
      const args = line
        .replaceAll("<project-id>", projectId)
        .replaceAll("<incident-id>", incidentId)
        .split(/\s+/u)
        .slice(1);
      expect(
        await runCli(args, {
          listIncidentsCommand: list,
          getIncidentCommand: inspect,
          resolveIncidentCommand: resolve,
          reopenIncidentCommand: reopen
        }),
        line
      ).toEqual(success);
    }
    expect(list).toHaveBeenCalledTimes(2);
    expect(list).toHaveBeenNthCalledWith(1, {
      source: "cloud",
      projectId,
      status: "all",
      limit: 25,
      json: true
    });
    expect(list).toHaveBeenNthCalledWith(2, {
      source: "cloud",
      projectId,
      status: "all",
      limit: 25,
      json: true
    });
    expect(inspect).toHaveBeenCalledWith({ source: "cloud", incidentId, json: true });
    expect(resolve).toHaveBeenCalledWith({
      source: "cloud",
      incidentIds: [incidentId],
      json: true
    });
    expect(reopen).toHaveBeenCalledWith({ source: "cloud", incidentIds: [incidentId], json: true });
  });
});
