import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MCP_TOOL_NAMES } from "../../apps/mcp/src/tool-catalog.ts";
import { TIER_CAPABILITIES } from "../../packages/shared-types/src/index.ts";
import { buildMachineReadableArtifacts } from "../../scripts/public-site-artifacts.ts";

const siteRoot = join(process.cwd(), "site");
const docsRoot = join(siteRoot, "content", "docs");

function readDoc(relativePath: string): string {
  return readFileSync(join(docsRoot, relativePath), "utf8");
}

describe("public site AnalyticsBundle documentation", () => {
  it("ships every AnalyticsBundle page required by the documentation contract", () => {
    const requiredPages = [
      "analytics/index.mdx",
      "analytics/privacy.mdx",
      "analytics/self-hosting.mdx",
      "cli/analytics.mdx",
      "api/analytics.mdx"
    ];

    for (const page of requiredPages) {
      expect(existsSync(join(docsRoot, page))).toBe(true);
      expect(readDoc(page)).toMatch(/^---\n(?:.|\n)*?title:/);
      expect(readDoc(page)).toMatch(/description:/);
    }
  });

  it("documents the aggregate-first product model and direct-versus-generated evidence", () => {
    const concept = readDoc("analytics/index.mdx");

    expect(concept).toMatch(/does not create one\s+AnalyticsBundle per visit/);
    expect(concept).toContain("aggregate rollups");
    expect(concept).toContain("saved funnel");
    expect(concept).toContain("incident impact");
    expect(concept).toContain("API, CLI, MCP, and web");
    expect(concept).toContain("workspace Analytics view");
    expect(concept).toContain("project Analytics tab");
  });

  it("documents privacy, retention, identity, and debug-capture isolation", () => {
    const privacy = readDoc("analytics/privacy.mdx");

    expect(privacy).toContain("strict");
    expect(privacy).toContain("standard");
    expect(privacy).toContain("custom");
    expect(privacy).toContain("raw_retention_days");
    expect(privacy).toContain("sample_retention_days");
    expect(privacy).toContain("aggregate_retention_months");
    expect(privacy).toContain("form values");
    expect(privacy).toContain("raw click text");
    expect(privacy).toContain("Debug capture remains independent");
    expect(privacy).toContain("<col style={{ width: '8rem' }} />");
  });

  it("documents self-host migration order without treating bootstrap as an upgrade path", () => {
    const selfHosting = readDoc("analytics/self-hosting.mdx");
    const generalSelfHosting = readDoc("self-hosting.mdx");

    expect(selfHosting).toContain("db-migrate");
    expect(selfHosting).toContain("before API and Worker");
    expect(selfHosting).toContain("db-bootstrap");
    expect(selfHosting).toContain("empty databases only");
    expect(selfHosting).toContain("ANALYTICS_HASH_SECRET");
    expect(selfHosting).toContain("keep it stable");
    expect(selfHosting).toContain("ANALYTICS_OPPORTUNITY_EVALUATION_INTERVAL_MS");
    expect(selfHosting).toContain("Redis-backed queues");
    expect(selfHosting).not.toContain("BullMQ");
    expect(generalSelfHosting).toContain("db-migrate");
    expect(generalSelfHosting).not.toContain("API service runs database migrations on startup");
  });

  it("documents the shipped CLI and API analytics surfaces", () => {
    const cli = readDoc("cli/analytics.mdx");
    const api = readDoc("api/analytics.mdx");

    for (const command of [
      "analytics summary",
      "analytics journey-samples list",
      "analytics opportunities",
      "analytics bundle create",
      "analytics saved-funnels create",
      "analytics settings set"
    ]) {
      expect(cli).toContain(command);
    }

    for (const route of [
      "/v1/projects/{id}/analytics-settings",
      "/v1/projects/{id}/analytics/saved-funnels",
      "/v1/analytics/summary",
      "/v1/analytics/routes",
      "/v1/analytics/devices",
      "/v1/analytics/referrers",
      "/v1/analytics/actions",
      "/v1/analytics/funnels",
      "/v1/analytics/journey-patterns",
      "/v1/analytics/journey-samples",
      "/v1/analytics/incidents/{id}/impact",
      "/v1/analytics/opportunities",
      "/v1/analytics/bundles"
    ]) {
      expect(api).toContain(route);
    }
    expect(api).toContain("Member Token");
    expect(api).toMatch(/Project\s+tokens cannot read/);
  });

  it("documents browser capture and every agent-facing analytics tool family", () => {
    const browser = readDoc("sdks/browser.mdx");
    const mcpTools = readDoc("mcp/tools.mdx");

    for (const value of [
      "analytics.enabled",
      "analytics.setConsent",
      "analytics.track",
      "analytics.funnel",
      "analytics.convert",
      "analytics.marker"
    ]) {
      expect(browser).toContain(value);
    }
    expect(browser).toContain("Direct browser mode");
    expect(browser).toContain("Relay mode");

    for (const tool of [
      "get_usage_summary",
      "get_route_metrics",
      "get_device_breakdown",
      "get_referrer_metrics",
      "get_action_metrics",
      "list_funnel_metrics",
      "get_funnel_analysis",
      "get_journey_patterns",
      "list_analytics_journey_samples",
      "get_analytics_journey_sample",
      "get_incident_impact",
      "list_analytics_opportunities",
      "get_analytics_opportunity",
      "list_analytics_bundles",
      "generate_analytics_bundle",
      "get_analytics_bundle",
      "get_analytics_settings",
      "update_analytics_settings",
      "list_saved_analytics_funnels",
      "create_saved_analytics_funnel",
      "update_saved_analytics_funnel",
      "archive_saved_analytics_funnel"
    ]) {
      expect(mcpTools).toContain(tool);
    }
  });

  it("publishes a privacy-safe analytics setup workflow on the homepage and quickstart", () => {
    const homepage = readFileSync(join(siteRoot, "app", "(site)", "page.tsx"), "utf8");
    const prompts = readFileSync(join(siteRoot, "src", "lib", "agent-assist-prompts.ts"), "utf8");
    const optionalWorkflows = readFileSync(
      join(siteRoot, "src", "components", "optional-agent-improvements.tsx"),
      "utf8"
    );
    const quickstart = readDoc("quickstart.mdx");

    expect(homepage).toContain("Understand product usage");
    expect(homepage).toContain("promptId: 'product-analytics-workflow'");
    expect(prompts).toContain("'product-analytics-workflow'");
    expect(prompts).toContain("https://debugbundle.com/docs/analytics");
    expect(prompts).toContain("analytics.setConsent");
    expect(prompts).toContain("analytics.track");
    expect(prompts).toContain("analytics.funnel");
    expect(prompts).toContain("analytics.convert");
    expect(prompts).toContain("preserve the existing direct or relay transport");
    expect(prompts).toContain("Debug capture must keep working independently");
    expect(optionalWorkflows).toContain("Optional Agent-Assisted Workflows");
    expect(optionalWorkflows).toContain("agentAssistPromptIds.map");
    expect(quickstart).toContain("<OptionalAgentImprovements />");
  });

  it("publishes tier totals and extra-capacity increments for analytics", () => {
    const pricingPage = readFileSync(
      join(siteRoot, "app", "(site)", "pricing", "page.tsx"),
      "utf8"
    );
    const pricingDoc = readDoc("pricing.mdx");
    const formatCount = (value: number): string => new Intl.NumberFormat("en-US").format(value);
    const free = TIER_CAPABILITIES.free;
    const solo = TIER_CAPABILITIES.solo;
    const team = TIER_CAPABILITIES.team;

    for (const value of [
      `${formatCount(free.monthly_analytics_events)} analytics events /month`,
      `${formatCount(free.monthly_analytics_sessions)} analytics sessions /month`,
      `${formatCount(free.monthly_analytics_journey_samples)} retained journey samples /month`,
      `${formatCount(free.monthly_analytics_bundle_generations)} generated analytics bundles /month`,
      `${formatCount(free.max_analytics_saved_funnels)} saved funnel`,
      `${formatCount(free.max_analytics_custom_dimensions)} custom dimension`,
      `${formatCount(solo.monthly_analytics_events * solo.included_capacity_units)} analytics events /month`,
      `${formatCount(solo.monthly_analytics_sessions * solo.included_capacity_units)} analytics sessions /month`,
      `${formatCount(solo.monthly_analytics_journey_samples * solo.included_capacity_units)} retained journey samples`,
      `${formatCount(solo.monthly_analytics_bundle_generations * solo.included_capacity_units)} generated analytics bundles /month`,
      `${formatCount(solo.max_analytics_saved_funnels)} saved funnels`,
      `${formatCount(solo.max_analytics_custom_dimensions)} custom dimensions`,
      `${formatCount(team.monthly_analytics_events * team.included_capacity_units)} analytics events /month`,
      `${formatCount(team.monthly_analytics_sessions * team.included_capacity_units)} analytics sessions /month`,
      `${formatCount(team.monthly_analytics_journey_samples * team.included_capacity_units)} retained journey samples`,
      `${formatCount(team.monthly_analytics_bundle_generations * team.included_capacity_units)} generated analytics bundles /month`,
      `${formatCount(team.max_analytics_saved_funnels)} saved funnels`,
      `${formatCount(team.max_analytics_custom_dimensions)} custom dimensions`,
      `+${formatCount(solo.monthly_analytics_events)} analytics events /month`,
      `+${formatCount(solo.monthly_analytics_sessions)} analytics sessions /month`,
      `+${formatCount(solo.monthly_analytics_journey_samples)} retained journey samples`,
      `+${formatCount(solo.monthly_analytics_bundle_generations)} generated analytics bundles /month`,
      `+${formatCount(team.monthly_analytics_events)} analytics events /month`,
      `+${formatCount(team.monthly_analytics_sessions)} analytics sessions /month`,
      `+${formatCount(team.monthly_analytics_journey_samples)} retained journey samples`,
      `+${formatCount(team.monthly_analytics_bundle_generations)} generated analytics bundles /month`
    ]) {
      expect(pricingPage).toContain(value);
    }

    expect(pricingPage).toContain("Saved funnels and custom dimensions remain fixed by tier");
    expect(pricingDoc).toContain("Analytics events / month");
    expect(pricingDoc).toContain("Generated analytics bundles / month");
    expect(pricingDoc).toContain("| **Product analytics** | Preview | Included | Included |");
    expect(pricingDoc).toContain("do not increase saved funnels or custom-dimension slots");
  });

  it("registers AnalyticsBundle pages in content navigation and agent discovery", () => {
    const contentSource = readFileSync(join(siteRoot, "src", "content-source.ts"), "utf8");
    const artifactSource = readFileSync(
      join(process.cwd(), "scripts", "public-site-artifacts.ts"),
      "utf8"
    );

    expect(contentSource).toContain("'./analytics/meta.json'");
    expect(contentSource).toContain("'./analytics/index.mdx'");
    expect(contentSource).toContain("'./cli/analytics.mdx'");
    expect(contentSource).toContain("'./api/analytics.mdx'");
    expect(contentSource).toContain("'[ChartNoAxesCombined][Overview](/docs/analytics)'");
    expect(contentSource).toContain(
      "'[ShieldCheck][Privacy & Retention](/docs/analytics/privacy)'"
    );
    expect(contentSource).toContain("'[ServerCog][Self-Hosting](/docs/analytics/self-hosting)'");
    expect(contentSource).not.toMatch(/'---AnalyticsBundle---',\s*'analytics',/);
    expect(artifactSource).toContain("'/docs/analytics/'");
    expect(artifactSource).toContain("'/docs/analytics/privacy/'");
    expect(artifactSource).toContain("'/docs/cli/analytics/'");
    expect(artifactSource).toContain("'/docs/api/analytics/'");
  });

  it("publishes capability-first positioning and AnalyticsBundle links in the generated agent discovery artifact", async () => {
    const artifacts = await buildMachineReadableArtifacts();
    const llms = artifacts.find((artifact) => artifact.routePath === "/llms.txt");

    expect(llms?.content).toContain(
      "runtime error reporting, crash reporting, incident response, endpoint health checks, and product analytics"
    );
    expect(llms?.content).toContain(
      "- [AnalyticsBundle](https://debugbundle.com/docs/analytics/)"
    );
    expect(llms?.content).toContain(
      "- [AnalyticsBundle privacy](https://debugbundle.com/docs/analytics/privacy/)"
    );
    expect(llms?.content).toContain(
      "- [Self-hosted AnalyticsBundle](https://debugbundle.com/docs/analytics/self-hosting/)"
    );
    expect(llms?.content).toContain(
      "- [AnalyticsBundle CLI](https://debugbundle.com/docs/cli/analytics/)"
    );
    expect(llms?.content).toContain(
      "- [AnalyticsBundle API](https://debugbundle.com/docs/api/analytics/)"
    );
  });

  it("documents agent-native analytics workflows across MCP and generated skill guidance", () => {
    const mcpOverview = readDoc("mcp/index.mdx");
    const mcpWorkflows = readDoc("mcp/workflows.mdx");
    const agentWorkflows = readDoc("agent-workflows.mdx");
    const skillFile = readDoc("agent-workflows/skill-file.mdx");

    expect(mcpOverview).toContain(`${MCP_TOOL_NAMES.length} tools`);
    expect(mcpOverview).toContain("Product analytics");
    expect(mcpWorkflows).toContain("Product Analytics Review");
    expect(mcpWorkflows).toContain("get_usage_summary");
    expect(mcpWorkflows).toContain("get_funnel_analysis");
    expect(mcpWorkflows).toContain("generate_analytics_bundle");
    expect(mcpWorkflows).toContain("not one bundle per visit");
    expect(agentWorkflows).toContain("Product Analytics Review");
    expect(agentWorkflows).toContain("direct aggregate reads first");
    expect(skillFile).toContain("Product Analytics");
    expect(skillFile).toContain("debugbundle analytics summary");
    expect(skillFile).toContain("get_usage_summary");
  });
});
