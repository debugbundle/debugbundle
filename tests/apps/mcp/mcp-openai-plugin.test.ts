import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const pluginRoot = join(repoRoot, "apps/mcp/openai/debugbundle");

describe("OpenAI plugin package", () => {
  it("passes the repository validator with the captured Developer Mode connection", () => {
    const output = execFileSync(
      process.execPath,
      ["scripts/validate-openai-plugin.mjs", "--json"],
      { cwd: repoRoot, encoding: "utf8" }
    );
    const result = JSON.parse(output) as {
      ok: boolean;
      evidenceState: string;
      connectionId: string;
      version: string;
      manualGates: string[];
      failures: string[];
    };

    expect(result).toEqual({
      ok: true,
      evidenceState: "local_connection_ready",
      connectionId: "plugin_asdk_app_6a99ba6c1e7881919091a592738692c6",
      version: "1.0.0",
      manualGates: [],
      failures: []
    });
  });

  it("contains production metadata, four exact prompts, and the verified source icon", () => {
    const manifest = JSON.parse(
      readFileSync(join(pluginRoot, ".codex-plugin/plugin.json"), "utf8")
    ) as {
      name: string;
      version: string;
      apps?: string;
      mcpServers?: string;
      interface: {
        category: string;
        capabilities: string[];
        defaultPrompt: string[];
        composerIcon: string;
      };
    };

    expect(manifest.name).toBe("debugbundle");
    expect(manifest.version).toBe("1.0.0");
    expect(manifest.interface.category).toBe("Developer Tools");
    expect(manifest.interface.capabilities).toEqual(["Read"]);
    expect(manifest.interface.defaultPrompt).toEqual([
      "Investigate my latest production incident.",
      "Explain this incident from its bundle and reproduction.",
      "Summarize product usage and checkout funnel performance for the last 7 days.",
      "Why is this endpoint health check failing?"
    ]);
    expect(manifest.interface.defaultPrompt.every((prompt) => prompt.length <= 128)).toBe(true);
    expect(manifest.interface.composerIcon).toBe("./assets/icon-512.png");
    expect(readFileSync(join(pluginRoot, "assets/icon-512.png"))).toEqual(
      readFileSync(join(repoRoot, "site/public/icon-512.png"))
    );
    expect(manifest.apps).toBe("./.app.json");
    expect(manifest.mcpServers).toBeUndefined();
    expect(existsSync(join(pluginRoot, ".app.json"))).toBe(true);
    expect(JSON.parse(readFileSync(join(pluginRoot, ".app.json"), "utf8"))).toEqual({
      apps: {
        debugbundle: {
          id: "plugin_asdk_app_6a99ba6c1e7881919091a592738692c6"
        }
      }
    });
    expect(existsSync(join(pluginRoot, ".mcp.json"))).toBe(false);
  });

  it("retains ten positive and seven negative reproducible review cases", () => {
    const corpus = JSON.parse(
      readFileSync(join(repoRoot, "apps/mcp/openai/submission/test-cases.json"), "utf8")
    ) as {
      cases: Array<{
        id: string;
        kind: "positive" | "negative";
        expected_sequence: string[];
        expected_arguments: unknown[];
        forbidden_tools: string[];
        forbidden_fields: string[];
        answer_properties: string[];
      }>;
    };

    expect(corpus.cases.filter((entry) => entry.kind === "positive")).toHaveLength(10);
    expect(corpus.cases.filter((entry) => entry.kind === "negative")).toHaveLength(7);
    expect(new Set(corpus.cases.map((entry) => entry.id)).size).toBe(17);
    for (const entry of corpus.cases) {
      expect(entry.expected_arguments).toHaveLength(entry.expected_sequence.length);
      expect(entry.forbidden_tools.length).toBeGreaterThan(0);
      expect(entry.forbidden_fields.length).toBeGreaterThan(0);
      expect(entry.answer_properties.length).toBeGreaterThan(0);
    }
    expect(corpus.cases.map((entry) => entry.id)).toEqual(
      expect.arrayContaining([
        "negative-local-source-typo",
        "negative-mutation-request",
        "negative-cross-tenant-lookup",
        "negative-secret-exfiltration",
        "negative-prompt-injection",
        "negative-individual-analytics-journey",
        "negative-generic-infrastructure-metrics"
      ])
    );
  });
});
