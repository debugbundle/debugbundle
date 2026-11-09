import { expect, it } from "vitest";
import frozen from "../../fixtures/openai-plugin-v1/tool-contracts.json" with { type: "json" };
import reports from "../../../packages/mcp-core/src/contracts/report-schemas.json" with { type: "json" };
import {
  OPENAI_TOOL_CATALOG,
  OPENAI_TOOL_NAMES,
  getOpenAiToolSchemas,
  projectOpenAiToolOutput
} from "../../../packages/mcp-core/src/index.js";
import { projectOpenAiReportDocument } from "../../../packages/mcp-core/src/openai-report-contract.js";
import {
  reportDocumentFixture,
  maximumReportDocumentFixture
} from "../../helpers/report-document.js";

it("adds exactly two consented report reads while preserving every original tool declaration", () => {
  expect(OPENAI_TOOL_NAMES).toEqual([
    ...frozen.tools.map((tool) => tool.name),
    "list_reports",
    "get_report_content"
  ]);
  expect(
    OPENAI_TOOL_CATALOG.filter((tool) => frozen.tools.some((old) => old.name === tool.name))
  ).toEqual(frozen.tools);
  for (const name of ["list_reports", "get_report_content"]) {
    expect(OPENAI_TOOL_CATALOG.find((tool) => tool.name === name)).toMatchObject({
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      securitySchemes: [{ type: "oauth2", scopes: ["debugbundle:reports:read"] }]
    });
    const schema = getOpenAiToolSchemas(name);
    expect(schema.inputSchema).toMatchObject({ type: "object", additionalProperties: false });
    expect(JSON.stringify(schema)).not.toContain("schemas.json#");
  }
  expect(getOpenAiToolSchemas("list_reports")).toEqual({
    inputSchema: reports.$defs.listReportsInput,
    outputSchema: reports.$defs.listReportsOutput
  });
  expect(getOpenAiToolSchemas("get_report_content")).toEqual({
    inputSchema: reports.$defs.getReportContentInput,
    outputSchema: reports.$defs.getReportContentOutput
  });
});
it("returns full canonical facts without internal hashes, source identities or storage links and withholds unsafe/oversized content", () => {
  const document = reportDocumentFixture();
  const value = { report: projectOpenAiReportDocument(document) };
  const projected = projectOpenAiToolOutput("get_report_content", value);
  expect(projected).toEqual(value);
  expect(JSON.stringify(projected)).not.toContain("request_sha256");
  expect(projected).not.toHaveProperty("report.sources");
  const unsafe = structuredClone(value);
  unsafe.report.name = "dbundle_org_transfer_" + "x".repeat(40);
  expect(() => projectOpenAiToolOutput("get_report_content", unsafe)).toThrow("redaction_failed");
  const large = maximumReportDocumentFixture();
  for (const metric of large.report.facts.metrics)
    metric.notes = Array.from({ length: 4 }, () => "界".repeat(300));
  expect(() =>
    projectOpenAiToolOutput("get_report_content", { report: projectOpenAiReportDocument(large) })
  ).toThrow("output_too_large");
});
