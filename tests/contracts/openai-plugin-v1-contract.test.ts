import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { MCP_TOOL_CATALOG } from "../../apps/mcp/src/tool-catalog.js";

const ROOT = path.resolve(import.meta.dirname, "../..");
const FIXTURE_ROOT = path.join(ROOT, "tests/fixtures/openai-plugin-v1");

const EXPECTED_TOOL_NAMES = [
  "list_projects",
  "list_services",
  "list_incidents",
  "get_incident",
  "get_incident_context",
  "get_bundle",
  "get_reproduction",
  "list_improvements",
  "get_improvement",
  "get_improvement_bundle",
  "get_usage_summary",
  "get_route_metrics",
  "get_journey_patterns",
  "get_device_breakdown",
  "get_referrer_metrics",
  "get_action_metrics",
  "list_funnel_metrics",
  "get_funnel_analysis",
  "get_incident_impact",
  "list_health_checks",
  "get_health_check",
  "list_health_check_results",
  "list_health_check_daily_rollups"
] as const;

type JsonSchema = {
  $ref?: string;
  type?: string | string[];
  additionalProperties?: boolean;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  anyOf?: JsonSchema[];
};

type SchemaDocument = {
  $defs: Record<string, JsonSchema>;
};

type ToolContract = {
  name: (typeof EXPECTED_TOOL_NAMES)[number];
  title: string;
  description: string;
  securitySchemes: Array<{ type: string; scopes: string[] }>;
  annotations: {
    readOnlyHint: boolean;
    openWorldHint: boolean;
    destructiveHint: boolean;
  };
  input_schema_ref: string;
  output_schema_ref: string;
};

type ToolContractDocument = {
  contract_version: string;
  product_shape: string;
  custom_ui: boolean;
  resource: string;
  endpoint: string;
  issuer: string;
  scopes: string[];
  annotations: ToolContract["annotations"];
  exclusions: string[];
  tools: ToolContract[];
};

type ImplementationGaps = {
  evidence_state: string;
  openai_catalog: string;
  dedicated_hosted_readers: string;
  oauth_oidc_runtime: string;
  streamable_http_transport: string;
  plugin_package: string;
  hosted_infrastructure: string;
  consent_ui: string;
  developer_mode_connection: string;
  production_validation: string;
  health_results_pagination: string;
  improvement_empty_result: string;
  negative_mutation_boundary: string;
  secret_exfiltration_boundary: string;
  individual_analytics_boundary: string;
  portal_submission: string;
  publication: string;
  directory_discovery: string;
};

type ReviewerFixture = {
  analytics: {
    route: string;
    next_route: string;
    funnel_key: string;
    affected_subject_hashes: string[];
  };
};

const EXPECTED_TOOL_SCOPES: Record<(typeof EXPECTED_TOOL_NAMES)[number], string[]> = {
  list_projects: ["debugbundle:projects:read"],
  list_services: ["debugbundle:projects:read"],
  list_incidents: ["debugbundle:incidents:read"],
  get_incident: ["debugbundle:incidents:read"],
  get_incident_context: ["debugbundle:incidents:read", "debugbundle:artifacts:read"],
  get_bundle: ["debugbundle:artifacts:read"],
  get_reproduction: ["debugbundle:artifacts:read"],
  list_improvements: ["debugbundle:improvements:read"],
  get_improvement: ["debugbundle:improvements:read"],
  get_improvement_bundle: ["debugbundle:improvements:read"],
  get_usage_summary: ["debugbundle:analytics:read"],
  get_route_metrics: ["debugbundle:analytics:read"],
  get_journey_patterns: ["debugbundle:analytics:read"],
  get_device_breakdown: ["debugbundle:analytics:read"],
  get_referrer_metrics: ["debugbundle:analytics:read"],
  get_action_metrics: ["debugbundle:analytics:read"],
  list_funnel_metrics: ["debugbundle:analytics:read"],
  get_funnel_analysis: ["debugbundle:analytics:read"],
  get_incident_impact: ["debugbundle:analytics:read", "debugbundle:incidents:read"],
  list_health_checks: ["debugbundle:health:read"],
  get_health_check: ["debugbundle:health:read"],
  list_health_check_results: ["debugbundle:health:read"],
  list_health_check_daily_rollups: ["debugbundle:health:read"]
};

const SOURCE_OF_TRUTH_MARKERS: Record<string, string[]> = {
  "spec/requirements.md": ["FR-MCP-04", "FR-MCP-11", "NFR-MCP-01", "NFR-MCP-04"],
  "spec/acceptance.md": ["AC-MCP-03", "AC-MCP-13"],
  "spec/auth-architecture.md": [
    "RFC 9207",
    "https://chatgpt.com/oauth/client.json",
    "private_key_jwt"
  ],
  "spec/hosted-remote-mcp-connector.md": [
    "https://mcp.debugbundle.com",
    "Exactly twenty-three tools"
  ],
  "contracts/public-interfaces.md": ["Official OpenAI Plugin V1 Interface", "get_incident_context"],
  "contracts/data-schemas.md": ["oauth_authorization_grants", "oauth_refresh_tokens"],
  "contracts/openai-plugin-v1-data-map.md": ["Field-Level Data Map", "raw `url`"],
  "rules/security-hardening.md": ["SEC-28", "SEC-35"],
  "rules/domain-invariants.md": ["INV-24", "INV-27"],
  "rules/release-governance.md": ["OpenAI Plugin Release Discipline", "Cancel Review"],
  "spec/openai-plugin-oauth-decision.md": ["oidc-provider", "~9.11.2"],
  "spec/openai-plugin-threat-model.md": ["Threat Model Foundation", "DB reserve ≥6"],
  "SYSTEM_OVERVIEW.md": ["official OpenAI Plugin", "runtime, forward migration, projection"],
  "ARCHITECTURE_MAP.md": ["Official OpenAI MCP Flow", "never imports `apps/mcp` into `apps/api`"]
};

async function readJson<T>(fileName: string): Promise<T> {
  return JSON.parse(await readFile(path.join(FIXTURE_ROOT, fileName), "utf8")) as T;
}

function schemaNameFromRef(schemaRef: string): string {
  const match = /^schemas\.json#\/\$defs\/([A-Za-z0-9]+)$/.exec(schemaRef);
  if (match?.[1] === undefined) {
    throw new Error(`invalid_openai_schema_ref:${schemaRef}`);
  }
  return match[1];
}

function collectOutputPropertyNames(
  schema: JsonSchema,
  schemas: SchemaDocument,
  propertyNames: Set<string>,
  visitedDefinitions: Set<string>
): void {
  if (schema.$ref !== undefined) {
    const match = /^#\/\$defs\/([A-Za-z0-9]+)$/.exec(schema.$ref);
    if (match?.[1] === undefined) {
      throw new Error(`invalid_local_schema_ref:${schema.$ref}`);
    }

    const definitionName = match[1];
    if (visitedDefinitions.has(definitionName)) {
      return;
    }
    visitedDefinitions.add(definitionName);
    const definition = schemas.$defs[definitionName];
    if (definition === undefined) {
      throw new Error(`missing_schema_definition:${definitionName}`);
    }
    collectOutputPropertyNames(definition, schemas, propertyNames, visitedDefinitions);
  }

  for (const [propertyName, propertySchema] of Object.entries(schema.properties ?? {})) {
    propertyNames.add(propertyName);
    collectOutputPropertyNames(propertySchema, schemas, propertyNames, visitedDefinitions);
  }

  if (schema.items !== undefined) {
    collectOutputPropertyNames(schema.items, schemas, propertyNames, visitedDefinitions);
  }

  for (const option of schema.anyOf ?? []) {
    collectOutputPropertyNames(option, schemas, propertyNames, visitedDefinitions);
  }
}

async function listTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listTypeScriptFiles(absolutePath)));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(absolutePath);
    }
  }

  return files;
}

describe("OpenAI plugin v1 contract", () => {
  it("freezes the exact twenty-three-tool catalog and per-tool policies", async () => {
    const contract = await readJson<ToolContractDocument>("tool-contracts.json");
    const schemas = await readJson<SchemaDocument>("schemas.json");

    expect(contract.contract_version).toBe("1.0.0");
    expect(contract.product_shape).toBe("skill_plus_remote_mcp");
    expect(contract.custom_ui).toBe(false);
    expect(contract.resource).toBe("https://mcp.debugbundle.com");
    expect(contract.endpoint).toBe("https://mcp.debugbundle.com/mcp");
    expect(contract.issuer).toBe("https://api.debugbundle.com");
    expect(contract.tools.map((tool) => tool.name)).toEqual(EXPECTED_TOOL_NAMES);
    expect(new Set(contract.tools.map((tool) => tool.name)).size).toBe(23);

    for (const tool of contract.tools) {
      expect(tool.title.length).toBeGreaterThan(0);
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.securitySchemes).toHaveLength(1);
      expect(tool.securitySchemes[0]?.type).toBe("oauth2");
      expect(tool.securitySchemes[0]?.scopes).toEqual(EXPECTED_TOOL_SCOPES[tool.name]);
      expect(tool.annotations).toEqual({
        readOnlyHint: true,
        openWorldHint: false,
        destructiveHint: false
      });

      const inputSchema = schemas.$defs[schemaNameFromRef(tool.input_schema_ref)];
      const outputSchema = schemas.$defs[schemaNameFromRef(tool.output_schema_ref)];
      expect(inputSchema).toBeDefined();
      expect(outputSchema).toBeDefined();
      expect(inputSchema).toMatchObject({ type: "object", additionalProperties: false });
      expect(outputSchema).toMatchObject({ type: "object", additionalProperties: false });
      expect(inputSchema?.properties).not.toHaveProperty("bearerToken");
      expect(inputSchema?.properties).not.toHaveProperty("source");
    }

    expect(
      contract.tools.find((tool) => tool.name === "get_incident_context")?.securitySchemes
    ).toEqual([
      {
        type: "oauth2",
        scopes: ["debugbundle:incidents:read", "debugbundle:artifacts:read"]
      }
    ]);
    expect(
      contract.tools.find((tool) => tool.name === "get_incident_impact")?.securitySchemes
    ).toEqual([
      {
        type: "oauth2",
        scopes: ["debugbundle:analytics:read", "debugbundle:incidents:read"]
      }
    ]);
    expect(contract.exclusions).toContain("raw_logs");
    expect(contract.exclusions).toContain("individual_analytics_journey_samples");
    expect(contract.exclusions).toContain("analytics_custom_dimensions");
    expect(contract.exclusions).toContain("analytics_opportunities_and_bundles");
    expect(contract.exclusions).toContain("mutations");
    expect(contract.exclusions).toContain("custom_mcp_ui");
  });

  it("maps every structured output field to the frozen privacy allowlist", async () => {
    const contract = await readJson<ToolContractDocument>("tool-contracts.json");
    const schemas = await readJson<SchemaDocument>("schemas.json");
    const dataMap = await readFile(
      path.join(ROOT, "contracts/openai-plugin-v1-data-map.md"),
      "utf8"
    );
    const outputPropertyNames = new Set<string>();

    for (const tool of contract.tools) {
      const outputSchemaName = schemaNameFromRef(tool.output_schema_ref);
      const outputSchema = schemas.$defs[outputSchemaName];
      if (outputSchema === undefined) {
        throw new Error(`missing_output_schema:${outputSchemaName}`);
      }
      collectOutputPropertyNames(
        outputSchema,
        schemas,
        outputPropertyNames,
        new Set([outputSchemaName])
      );
      expect(dataMap).toContain(`\`${tool.name}\``);
    }

    for (const propertyName of outputPropertyNames) {
      expect(dataMap, `missing data-map entry for output field: ${propertyName}`).toMatch(
        new RegExp("`[^`]*\\b" + propertyName + "\\b[^`]*`")
      );
    }

    expect(dataMap.replace(/\s+/g, " ")).toContain(
      "Source | User goal | Output | Transformation and maximum | Category | Adjacent omission rationale"
    );
    expect(dataMap).toContain("Stored raw URL is forbidden");
    expect(dataMap).toContain("general API/stdio `IncidentContextRecord` currently includes them");
  });

  it("keeps deterministic reviewer analytics aggregate-only", async () => {
    const reviewer = await readJson<ReviewerFixture>("reviewer-tenant.json");
    const seedSource = await readFile(
      path.join(ROOT, "scripts/seed-openai-reviewer-fixtures.ts"),
      "utf8"
    );

    expect(reviewer.analytics).toMatchObject({
      route: "/checkout",
      next_route: "/confirmation",
      funnel_key: "checkout_completion"
    });
    expect(reviewer.analytics.affected_subject_hashes).toHaveLength(2);
    for (const table of [
      "analytics_session_rollups",
      "analytics_route_rollups",
      "analytics_transition_rollups",
      "analytics_action_rollups",
      "analytics_funnel_definitions",
      "analytics_funnel_rollups",
      "analytics_incident_session_links",
      "analytics_rollup_uniques"
    ]) {
      expect(seedSource).toContain(`INSERT INTO ${table}`);
    }
    expect(seedSource).not.toContain("INSERT INTO analytics_events");
    expect(seedSource).not.toContain("INSERT INTO analytics_journey_samples");
    expect(seedSource).not.toContain("INSERT INTO analytics_bundle_generations");
  });

  it("promotes the frozen contract into every required source-of-truth document", async () => {
    for (const [relativePath, markers] of Object.entries(SOURCE_OF_TRUTH_MARKERS)) {
      const source = await readFile(path.join(ROOT, relativePath), "utf8");
      for (const marker of markers) {
        expect(source, `${relativePath} must contain ${marker}`).toContain(marker);
      }
    }
  });

  it("does not let the API application import the MCP application", async () => {
    const apiFiles = await listTypeScriptFiles(path.join(ROOT, "apps/api/src"));
    const forbiddenImports: string[] = [];
    const importPattern = /(?:from\s+|import\s*\(|require\s*\()\s*["']([^"']+)["']/g;

    for (const filePath of apiFiles) {
      const source = await readFile(filePath, "utf8");
      for (const match of source.matchAll(importPattern)) {
        const specifier = match[1] ?? "";
        if (
          specifier.includes("apps/mcp") ||
          specifier.includes("@debugbundle/mcp") ||
          /(^|\/)\.\.\/mcp(\/|$)/.test(specifier)
        ) {
          forbiddenImports.push(`${path.relative(ROOT, filePath)}:${specifier}`);
        }
      }
    }

    expect(forbiddenImports).toEqual([]);
  });

  it("separates the implemented local candidate from manual and production evidence gaps", async () => {
    const gaps = await readJson<ImplementationGaps>("implementation-gaps.json");
    const legacyNames = MCP_TOOL_CATALOG.map((tool) => tool.name);

    expect(legacyNames).not.toEqual(EXPECTED_TOOL_NAMES);
    expect(legacyNames.length).toBeGreaterThan(EXPECTED_TOOL_NAMES.length);
    expect(EXPECTED_TOOL_NAMES.every((name) => legacyNames.includes(name))).toBe(true);
    expect(gaps).toMatchObject({
      evidence_state:
        "developer_mode_partial_corpus_health_pagination_improvement_empty_and_three_negative_boundaries_verified",
      openai_catalog: "implemented_and_contract_tested",
      dedicated_hosted_readers: "implemented_and_unit_tested",
      oauth_oidc_runtime: "deployed_enabled_metadata_verified",
      streamable_http_transport: "deployed_enabled_discovery_probe_verified",
      plugin_package: "candidate_deployed_digest_frozen_app_json_and_codex_install_verified",
      hosted_infrastructure: "production_migrated_managed_caddy_dns_tls_active",
      consent_ui: "owner_visual_approved_deployed_accessibility_pending",
      developer_mode_connection: "owner_registered_reconnected_and_app_json_captured",
      production_validation:
        "active_run_33868241338_partial_corpus_health_pagination_improvement_empty_and_three_negative_boundaries_verified",
      health_results_pagination: "live_two_page_continuation_verified",
      improvement_empty_result: "live_project_scoped_empty_result_verified",
      negative_mutation_boundary: "live_no_call_read_only_refusal_verified",
      secret_exfiltration_boundary: "live_no_call_safe_projection_refusal_verified",
      individual_analytics_boundary: "live_no_call_aggregate_only_refusal_verified",
      portal_submission: "not_submitted",
      publication: "not_published",
      directory_discovery: "not_verified",
      next_gate: "inspector_remaining_corpus_reviewer_accessibility_and_capacity_validation"
    });
  });
});
