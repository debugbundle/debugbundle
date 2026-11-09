import { z } from "zod";
import { ReportApiError, type ReportRunApi } from "../../../packages/report-client/src/index.js";
import { ReportRunCommandSchema } from "../../../packages/smart-reports/src/report-run.js";
import { renderReportHtml } from "../../../packages/smart-reports/src/report-html.js";
import { ReportRunCursorSchema } from "../../../packages/smart-reports/src/report-run-api-contract.js";
const scope = z.object({ bearerToken: z.string().min(1), organizationId: z.uuid() }).strict();
const identity = scope.extend({ runId: z.uuid() });
const listing = scope.extend({
  limit: z.number().int().min(1).max(100).optional(),
  cursor: ReportRunCursorSchema.optional()
});
const generation = scope.extend({ command: ReportRunCommandSchema });
const mutation = identity.extend({ expectedOrganizationId: z.uuid().optional() });
export const REPORT_RUN_MCP_TOOL_NAMES = [
  "list_reports",
  "get_report",
  "generate_report",
  "cancel_report",
  "delete_report",
  "get_report_content",
  "get_report_html"
] as const;
export const REPORT_RUN_MCP_TOOL_CATALOG = [
  {
    name: REPORT_RUN_MCP_TOOL_NAMES[0],
    inputSchema: listing,
    description:
      "List retained Smart Report runs under current access to every frozen origin. Follow next_cursor even when an authorised page is empty.",
    read: true
  },
  {
    name: REPORT_RUN_MCP_TOOL_NAMES[1],
    inputSchema: identity,
    description:
      "Read a Smart Report's status, period, scope and expiry. This returns metadata, never private model requests or provider receipts.",
    read: true
  },
  {
    name: REPORT_RUN_MCP_TOOL_NAMES[2],
    inputSchema: generation,
    description:
      "Queue a Business Smart Report for an explicit completed UTC period and expected definition version. Reuse the stable request UUID and identical command after a lost acknowledgement. Regeneration consumes another shared monthly generation. May send bounded redacted evidence to the configured provider; email is false unless explicitly requested. Cannot choose models, budgets or authority.",
    read: false
  },
  {
    name: REPORT_RUN_MCP_TOOL_NAMES[3],
    inputSchema: mutation,
    description:
      "Cancel queued or processing report work under current administration of every origin. Already paid or uncertain provider costs remain accounted for; cancellation does not recall delivered email.",
    read: false
  },
  {
    name: REPORT_RUN_MCP_TOOL_NAMES[4],
    inputSchema: mutation,
    description:
      "Delete a report and its private generated content under current whole-scope administration. Stops queued work and delivery; minimal financial receipts may remain. Does not recall delivered email.",
    read: false
  },
  {
    name: REPORT_RUN_MCP_TOOL_NAMES[5],
    inputSchema: identity,
    description:
      "Read the immutable canonical Smart Report facts, qualitative narrative and current retained-source availability. Requires current read access to every frozen origin, including after downgrade. Does not call AI or consume another generation.",
    read: true
  },
  {
    name: REPORT_RUN_MCP_TOOL_NAMES[6],
    inputSchema: identity,
    description:
      "Read the same private report as static escaped HTML, suitable for saving locally. No scripts, remote assets, public sharing URLs or new generation. Current whole-scope access and expiry still apply.",
    read: true
  }
].map(({ read, ...entry }) => ({
  ...entry,
  group: "reports" as const,
  annotations: {
    readOnlyHint: read,
    destructiveHint: entry.name === "delete_report",
    idempotentHint: true,
    openWorldHint: entry.name === "generate_report"
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
export function createReportRunMcpTools(
  api: ReportRunApi,
  options: { source_base_url?: string } = {}
): Record<
  (typeof REPORT_RUN_MCP_TOOL_NAMES)[number],
  (input: Record<string, unknown>) => Promise<unknown>
> {
  return {
    get_report_content: forward(identity, (input) => api.content(input)),
    get_report_html: forward(identity, async (input) => {
      const view = await api.content(input);
      return {
        html: renderReportHtml(view.document, {
          ...options,
          available_source_refs: view.available_source_refs
        })
      };
    }),
    list_reports: forward(listing, (input) =>
      api.list({
        bearerToken: input.bearerToken,
        organizationId: input.organizationId,
        ...(input.limit === undefined ? {} : { limit: input.limit }),
        ...(input.cursor === undefined ? {} : { cursor: input.cursor })
      })
    ),
    get_report: forward(identity, async (input) => ({ run: await api.get(input) })),
    generate_report: forward(generation, async (input) => ({ run: await api.generate(input) })),
    cancel_report: forward(mutation, async (input) => ({
      run: await api.cancel({
        bearerToken: input.bearerToken,
        organizationId: input.organizationId,
        runId: input.runId,
        ...(input.expectedOrganizationId === undefined
          ? {}
          : { expectedOrganizationId: input.expectedOrganizationId })
      })
    })),
    delete_report: forward(mutation, async (input) => {
      await api.remove({
        bearerToken: input.bearerToken,
        organizationId: input.organizationId,
        runId: input.runId,
        ...(input.expectedOrganizationId === undefined
          ? {}
          : { expectedOrganizationId: input.expectedOrganizationId })
      });
      return { deleted: true };
    })
  };
}
