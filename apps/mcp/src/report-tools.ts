import { z } from "zod";
import { ReportApiError, type ReportApi } from "../../../packages/report-client/src/index.js";
import {
  CreateReportDefinitionSchema,
  ReplaceReportDefinitionSchema
} from "../../../packages/smart-reports/src/report-definition.js";
const scope = z.object({ bearerToken: z.string().min(1), organizationId: z.uuid() }).strict();
const identity = scope.extend({ definitionId: z.uuid() });
const create = scope.extend({ requestId: z.uuid(), definition: CreateReportDefinitionSchema });
const replace = identity.extend({ definition: ReplaceReportDefinitionSchema });
const remove = identity.extend({ expectedVersion: z.number().int().positive() });
export const REPORT_MCP_TOOL_NAMES = [
  "list_report_definitions",
  "get_report_definition",
  "create_report_definition",
  "update_report_definition",
  "delete_report_definition",
  "get_report_allowance"
] as const;
export const REPORT_MCP_TOOL_CATALOG = [
  {
    name: REPORT_MCP_TOOL_NAMES[5],
    inputSchema: identity,
    description:
      "Read the shared monthly report pool, used/remaining generations and upcoming configured schedule demand through a currently readable whole-scope definition. Annual billing keeps monthly allowances. Forecast discloses partial schedule visibility. This does not reserve quota, change schedules or call AI.",
    read: true
  },
  {
    name: REPORT_MCP_TOOL_NAMES[0],
    inputSchema: scope,
    description:
      "List report definitions readable across every saved project/origin. Retained paused definitions remain visible after downgrade.",
    read: true
  },
  {
    name: REPORT_MCP_TOOL_NAMES[1],
    inputSchema: identity,
    description:
      "Read a saved report definition, its version, explicit scope and pause/review state. Requires current access to the entire scope.",
    read: true
  },
  {
    name: REPORT_MCP_TOOL_NAMES[2],
    inputSchema: create,
    description:
      "Save a report definition with explicit projects and evidence consent. Before enabling, obtain explicit chat confirmation of workspace, selected projects, cadence/time, evidence mode, verified email recipients and recurring allowance/provider use. Solo includes monthly factual reports; Team weekly/monthly factual reports; Business daily/weekly/monthly Smart Reports with AI analysis and safe factual fallback. Only AI definitions may send redacted evidence to a configured model. Reuse the request UUID after a lost acknowledgement and read the saved definition back. Capacity does not multiply plan limits.",
    read: false
  },
  {
    name: REPORT_MCP_TOOL_NAMES[3],
    inputSchema: replace,
    description:
      "Replace a report definition using expected_version and current administration of all selected projects. Confirm the proposed scope, cadence, evidence consent and AI/email changes in chat before saving, then read the saved definition back. Changes affect future unclaimed work and may alter scheduled AI/email delivery. Unchanged selections keep frozen origins; only the current Owner may explicitly clear a plan-loss review pause.",
    read: false
  },
  {
    name: REPORT_MCP_TOOL_NAMES[4],
    inputSchema: remove,
    description:
      "Delete a report definition and its retained report history with current whole-scope administration and expected saved version. Stops scheduled work and queued delivery. Disable the definition to retain its history. Existing weekly digests remain unchanged.",
    read: false
  }
].map(({ read, ...entry }) => ({
  ...entry,
  group: "reports" as const,
  annotations: {
    readOnlyHint: read,
    destructiveHint: entry.name === "delete_report_definition",
    idempotentHint:
      read ||
      entry.name === "create_report_definition" ||
      entry.name === "delete_report_definition",
    openWorldHint:
      entry.name === "create_report_definition" || entry.name === "update_report_definition"
  }
}));
function forward<S extends z.ZodType>(schema: S, run: (input: z.output<S>) => Promise<unknown>) {
  return async (input: Record<string, unknown>): Promise<unknown> => {
    try {
      return await run(schema.parse(input));
    } catch (error) {
      throw new Error(
        `mcp_tool_error:${error instanceof ReportApiError ? error.code : "invalid_report_input"}`
      );
    }
  };
}
export function createReportMcpTools(
  api: ReportApi
): Record<
  (typeof REPORT_MCP_TOOL_NAMES)[number],
  (input: Record<string, unknown>) => Promise<unknown>
> {
  return {
    list_report_definitions: forward(scope, async (input) => ({
      definitions: await api.list(input)
    })),
    get_report_allowance: forward(identity, async (input) => ({
      allowance: await api.allowance(input)
    })),
    get_report_definition: forward(identity, async (input) => ({
      definition: await api.get(input)
    })),
    create_report_definition: forward(create, async (input) => ({
      definition: await api.create(input)
    })),
    update_report_definition: forward(replace, async (input) => ({
      definition: await api.replace(input)
    })),
    delete_report_definition: forward(remove, async (input) => {
      await api.remove(input);
      return { deleted: true };
    })
  };
}
