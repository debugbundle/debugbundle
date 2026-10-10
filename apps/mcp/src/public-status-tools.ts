import { z } from "zod";
import {
  PublicStatusSettingsSchema,
  PublicStatusOptionsQueryObjectSchema
} from "../../../packages/shared-types/src/public-status.js";
import {
  PublicStatusApiError,
  type PublicStatusApi
} from "../../cli/src/public-status-commands.js";
const scope = z.object({ bearerToken: z.string().min(1), projectId: z.string().uuid() }).strict();
export const PUBLIC_STATUS_MCP_TOOL_NAMES = [
  "get_public_status_page",
  "save_public_status_page",
  "list_public_status_page_options",
  "preview_public_status_page"
] as const;
export const PUBLIC_STATUS_MCP_TOOL_CATALOG = [
  {
    name: PUBLIC_STATUS_MCP_TOOL_NAMES[0],
    group: "public_status",
    description:
      "Read a project's public status settings and share URL. Owners receive configuration; collaborators receive only the published link and title.",
    inputSchema: scope
  },
  {
    name: PUBLIC_STATUS_MCP_TOOL_NAMES[1],
    group: "public_status",
    description:
      "Save or publish/unpublish a public status page. Owner only. Explicit selections expose names and 30-day availability for chosen checks; other projects must share the same owner and account. Anchor project must be first. New checks remain private.",
    inputSchema: scope.extend({ settings: PublicStatusSettingsSchema })
  },
  {
    name: PUBLIC_STATUS_MCP_TOOL_NAMES[2],
    group: "public_status",
    description:
      "List a bounded page of same-owner/account projects and checks eligible for status publication. Owner only; continue with next_cursor.",
    inputSchema: scope.extend(PublicStatusOptionsQueryObjectSchema.shape)
  },
  {
    name: PUBLIC_STATUS_MCP_TOOL_NAMES[3],
    group: "public_status",
    description:
      "Preview the saved public projection, including unpublished settings. Owner only. Reads existing availability; never executes checks or exposes diagnostic details.",
    inputSchema: scope
  }
] as const;
export type PublicStatusMcpTools = Record<
  (typeof PUBLIC_STATUS_MCP_TOOL_NAMES)[number],
  (input: Record<string, unknown>) => Promise<unknown>
>;
export function createPublicStatusMcpTools(api: PublicStatusApi): PublicStatusMcpTools {
  async function call(fn: () => Promise<unknown>): Promise<unknown> {
    try {
      return await fn();
    } catch (error) {
      throw new Error(
        `mcp_tool_error:${error instanceof PublicStatusApiError ? error.message : error instanceof z.ZodError ? "invalid_status_input" : "unknown_error"}`
      );
    }
  }
  return {
    get_public_status_page: (input: Record<string, unknown>) =>
      call(() => api.get(scope.parse(input))),
    save_public_status_page: (input: Record<string, unknown>) =>
      call(() => api.save(PUBLIC_STATUS_MCP_TOOL_CATALOG[1].inputSchema.parse(input))),
    list_public_status_page_options: (input: Record<string, unknown>) =>
      call(() => {
        const parsed = PUBLIC_STATUS_MCP_TOOL_CATALOG[2].inputSchema.parse(input);
        return api.options(parsed);
      }),
    preview_public_status_page: (input: Record<string, unknown>) =>
      call(() => api.preview(scope.parse(input)))
  };
}
