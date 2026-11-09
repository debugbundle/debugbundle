import { writeFile } from "node:fs/promises";
import { getOpenAiToolSchemas } from "../packages/mcp-core/src/openai-contract.js";
const list = getOpenAiToolSchemas("list_reports"),
  content = getOpenAiToolSchemas("get_report_content");
await writeFile(
  new URL("../packages/mcp-core/src/contracts/report-schemas.json", import.meta.url),
  JSON.stringify(
    {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $defs: {
        listReportsInput: list.inputSchema,
        listReportsOutput: list.outputSchema,
        getReportContentInput: content.inputSchema,
        getReportContentOutput: content.outputSchema
      }
    },
    null,
    2
  ) + "\n"
);
