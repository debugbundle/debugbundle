import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  OPENAI_SCHEMA_CONTRACT,
  OPENAI_TOOL_CATALOG,
  parseOpenAiToolInput
} from "../../../packages/mcp-core/src/index.js";

const contractsPath = new URL(
  "../../fixtures/openai-plugin-v1/tool-contracts.json",
  import.meta.url
);
const schemasPath = new URL("../../fixtures/openai-plugin-v1/schemas.json", import.meta.url);

describe("OpenAI MCP tool catalog", () => {
  it("preserves frozen contracts with only the optional bounded evidence summary", async () => {
    const [contracts, schemas, evidenceSchema] = await Promise.all([
      readFile(contractsPath, "utf8").then((value) => JSON.parse(value) as { tools: unknown[] }),
      readFile(schemasPath, "utf8").then((value) => JSON.parse(value) as unknown),
      readFile(
        new URL("../../fixtures/openai-plugin-v1/evidence-summary-schema.json", import.meta.url),
        "utf8"
      ).then((value) => JSON.parse(value) as unknown)
    ]);

    expect(OPENAI_TOOL_CATALOG.slice(0, 23)).toEqual(contracts.tools);
    expect(OPENAI_TOOL_CATALOG.slice(23).map((tool) => tool.name)).toEqual([
      "list_reports",
      "get_report_content"
    ]);
    const current = structuredClone(OPENAI_SCHEMA_CONTRACT) as {
      $defs: Record<string, { properties?: Record<string, unknown>; required?: string[] }>;
    };
    // FR-EVID-08 adds output-only, optional summaries. Retain the historical
    // fixture so inputs, authority and all existing output fields stay frozen.
    expect(current.$defs["evidenceSummary"]).toEqual(evidenceSchema);
    delete current.$defs["evidenceSummary"];
    for (const name of ["bundleArtifact", "getIncidentContextOutput"]) {
      const definition = current.$defs[name]!;
      expect(definition.properties!["evidence_summary"]).toEqual({
        $ref: "#/$defs/evidenceSummary"
      });
      expect(definition.required).not.toContain("evidence_summary");
      delete definition.properties!["evidence_summary"];
    }
    expect(current).toEqual(schemas);
  });

  it("accepts only strict hosted inputs and preserves required project scope", () => {
    expect(parseOpenAiToolInput("list_incidents", { projectId: "proj_1", limit: 25 })).toEqual({
      projectId: "proj_1",
      limit: 25
    });
    expect(() =>
      parseOpenAiToolInput("list_incidents", {
        projectId: "proj_1",
        bearerToken: "legacy-token"
      })
    ).toThrow("openai_mcp_invalid_input:list_incidents");
    expect(() => parseOpenAiToolInput("list_incidents", { limit: 25 })).toThrow(
      "openai_mcp_invalid_input:list_incidents"
    );
    expect(() =>
      parseOpenAiToolInput("get_logs", { projectId: "proj_1", incidentId: "inc_1" })
    ).toThrow("openai_mcp_unknown_tool:get_logs");
  });

  it("accepts schema-valid inputs regardless of JSON object property order", () => {
    const input = {
      projectId: "project_1",
      checkId: "check_1",
      lookbackHours: 24,
      limit: 2,
      cursor: "eyJvZmZzZXQiOjJ9"
    };

    expect(parseOpenAiToolInput("list_health_check_results", input)).toEqual(input);
  });

  it("keeps every tool read-only, closed-world, and non-destructive", () => {
    for (const tool of OPENAI_TOOL_CATALOG) {
      expect(tool.annotations).toEqual({
        readOnlyHint: true,
        openWorldHint: false,
        destructiveHint: false
      });
      expect(tool.securitySchemes).toHaveLength(1);
      const prefix = ["list_reports", "get_report_content"].includes(tool.name)
        ? "report-schemas.json#/$defs/"
        : "schemas.json#/$defs/";
      expect(tool.input_schema_ref.startsWith(prefix)).toBe(true);
      expect(tool.output_schema_ref.startsWith(prefix)).toBe(true);
    }
  });
});
