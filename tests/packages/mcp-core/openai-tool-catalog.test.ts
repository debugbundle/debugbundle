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
  it("matches the exact frozen catalog and JSON schemas", async () => {
    const [contracts, schemas] = await Promise.all([
      readFile(contractsPath, "utf8").then((value) => JSON.parse(value) as { tools: unknown[] }),
      readFile(schemasPath, "utf8").then((value) => JSON.parse(value) as unknown)
    ]);

    expect(OPENAI_TOOL_CATALOG).toEqual(contracts.tools);
    expect(OPENAI_SCHEMA_CONTRACT).toEqual(schemas);
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
      expect(tool.input_schema_ref).toMatch(/^schemas\.json#\/\$defs\//);
      expect(tool.output_schema_ref).toMatch(/^schemas\.json#\/\$defs\//);
    }
  });
});
