import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const skillRoot = join(repoRoot, "apps/mcp/openai/debugbundle/skills/debugbundle");

describe("OpenAI plugin skill parity", () => {
  it("names every frozen v1 tool and no legacy credential or mutation surface", () => {
    const contract = JSON.parse(
      readFileSync(join(repoRoot, "tests/fixtures/openai-plugin-v1/tool-contracts.json"), "utf8")
    ) as { tools: Array<{ name: string }> };
    const skillText = [
      readFileSync(join(skillRoot, "SKILL.md"), "utf8"),
      readFileSync(join(skillRoot, "references/tools.md"), "utf8"),
      readFileSync(join(skillRoot, "references/privacy-and-safety.md"), "utf8")
    ].join("\n");

    expect(contract.tools).toHaveLength(23);
    for (const tool of contract.tools) {
      expect(skillText).toContain(`\`${tool.name}\``);
    }
    for (const forbidden of [
      "DEBUGBUNDLE_MEMBER_TOKEN",
      "bearerToken",
      "@debugbundle/mcp",
      "activate_probe",
      "get_analytics_journey_sample",
      "generate_analytics_bundle",
      "update_analytics_settings",
      "create_saved_funnel",
      "resolve_incident"
    ]) {
      expect(skillText).not.toContain(forbidden);
    }
  });

  it("preserves portable routing, prompt-injection, read-only, and privacy boundaries", () => {
    const skillText = readFileSync(join(skillRoot, "SKILL.md"), "utf8").toLowerCase();
    const safetyText = readFileSync(
      join(skillRoot, "references/privacy-and-safety.md"),
      "utf8"
    ).toLowerCase();

    expect(skillText).toContain("production runtime");
    expect(skillText).toContain("deterministic local source");
    expect(skillText).toContain("generic infrastructure");
    expect(skillText).toContain("version 1 is read-only");
    expect(skillText).toContain("untrusted data");
    expect(skillText).toContain("never returns raw logs");
    expect(safetyText).toContain("never regenerates or queues");
    expect(safetyText).toContain("userinfo, query strings, and fragments are removed");
  });
});
