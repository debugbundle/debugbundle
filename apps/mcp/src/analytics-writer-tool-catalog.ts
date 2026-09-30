import { z } from "zod";
import {
  AnalyticsWriterListInputSchema,
  AnalyticsWriterPreviewInputSchema,
  AnalyticsWriterApplyInputSchema
} from "../../cli/src/analytics-writer-api.js";

const auth = { bearerToken: z.string().min(1).max(4096) };
export const ANALYTICS_WRITER_MCP_TOOL_CATALOG = [
  {
    name: "analytics_writers_list",
    group: "analytics_writers",
    description:
      "List active analytics writer credential metadata and collection revision for a project with current owner/admin access. Never returns a credential secret or hash.",
    inputSchema: AnalyticsWriterListInputSchema.extend(auth)
  },
  {
    name: "analytics_writer_preview",
    group: "analytics_writers",
    description:
      "Preview creation or revocation of a project analytics writer without issuing a secret or writing state. Returns reviewed content, capacity, revision and a content-bound preview hash.",
    inputSchema: AnalyticsWriterPreviewInputSchema.extend(auth)
  },
  {
    name: "analytics_writer_apply",
    group: "analytics_writers",
    description:
      "Apply a reviewed analytics writer create or revoke using the matching preview hash, expected collection revision and idempotency key. A newly issued write-only credential is returned once to the authorized caller; replay cannot recover it. Keep the returned secret private.",
    inputSchema: AnalyticsWriterApplyInputSchema.extend(auth)
  }
] as const;
export const ANALYTICS_WRITER_MCP_TOOL_NAMES = ANALYTICS_WRITER_MCP_TOOL_CATALOG.map(
  (tool) => tool.name
);
