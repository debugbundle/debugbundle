import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const skillPath = join(repoRoot, "apps", "mcp", "clawhub", "debugbundle", "SKILL.md");
const skillLicensePath = join(repoRoot, "apps", "mcp", "clawhub", "debugbundle", "LICENSE");

describe("mcp ClawHub skill", () => {
  it("ships a portable DebugBundle skill for ClawHub publication", () => {
    expect(existsSync(skillPath)).toBe(true);
    expect(existsSync(skillLicensePath)).toBe(true);

    const skill = readFileSync(skillPath, "utf8");
    const license = readFileSync(skillLicensePath, "utf8");

    expect(skill).toContain("name: debugbundle");
    expect(skill).toContain("description: Use DebugBundle MCP and CLI workflows");
    expect(skill).toContain("metadata:");
    expect(skill).toContain("openclaw:");
    expect(skill).toContain("DEBUGBUNDLE_MEMBER_TOKEN");
    expect(skill).toContain("DEBUGBUNDLE_API_URL");
    expect(skill).toContain("package: \"@debugbundle/mcp\"");
    expect(skill).toContain("\"args\": [\"@debugbundle/mcp\"]");
    expect(skill).toContain("should not replace a repository's generated `.agents/skills/debugbundle/SKILL.md`");
    expect(skill).toContain("Hosted Health Checks");
    expect(skill).toContain("test_health_check");
    expect(skill).toContain("Operations Surfaces");
    expect(skill).toContain("GitHub dispatch");
    expect(skill).toContain("improvement-settings tools");
    expect(skill).toContain("billing, capture-policy, capture-rule");
    expect(skill).toContain("evaluate capture-rule suggestions or path-scoped capture policy");
    expect(skill).toContain("Product Analytics");
    expect(skill).toContain("get_usage_summary");
    expect(skill).toContain("get_funnel_analysis");
    expect(skill).toContain("generate_analytics_bundle");
    expect(skill).toContain("does not create one analytics bundle per visit");
    expect(skill).toContain("update_analytics_settings");
    expect(skill).toContain("Do not use project tokens for retrieval or management operations");
    expect(license).toContain("MIT No Attribution");
  });
});
