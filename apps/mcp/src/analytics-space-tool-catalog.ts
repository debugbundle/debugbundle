import { z } from "zod";
import {
  AnalyticsSpaceListInputSchema,
  AnalyticsSpaceGetInputSchema,
  AnalyticsSpacePreviewInputSchema,
  AnalyticsSpaceApplyInputSchema
} from "../../cli/src/analytics-space-api.js";
const auth = { bearerToken: z.string().min(1).max(4096) };
export const ANALYTICS_SPACE_MCP_TOOL_CATALOG = [
  {
    name: "analytics_spaces_list",
    group: "analytics_spaces",
    description:
      "List analytics spaces in an organization for which the caller currently has access to every source project. Returns bounded metadata only.",
    inputSchema: AnalyticsSpaceListInputSchema.extend(auth)
  },
  {
    name: "analytics_space_get",
    group: "analytics_spaces",
    description:
      "Read current analytics space metadata under complete source authorization. An inaccessible or archived space is unavailable.",
    inputSchema: AnalyticsSpaceGetInputSchema.extend(auth)
  },
  {
    name: "analytics_space_preview",
    group: "analytics_spaces",
    description:
      "Preview a complete analytics space save or archive without writing. Returns the protected content hash and membership effects; use null spaceId to preview creation. Preview does not grant authority to apply.",
    inputSchema: AnalyticsSpacePreviewInputSchema.extend(auth)
  },
  {
    name: "analytics_space_apply",
    group: "analytics_spaces",
    description:
      "Apply an explicitly approved analytics space save or archive with the matching previewHash, expected revision and idempotency key. Changes space membership; archiving invalidates its snapshots and releases its projects without deleting project data. Rechecks all source permissions.",
    inputSchema: AnalyticsSpaceApplyInputSchema.extend(auth)
  }
] as const;
export const ANALYTICS_SPACE_MCP_TOOL_NAMES = ANALYTICS_SPACE_MCP_TOOL_CATALOG.map(
  (tool) => tool.name
);
