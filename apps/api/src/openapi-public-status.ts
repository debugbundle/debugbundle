import { z } from "zod";
import {
  PublicStatusIdSchema,
  PublicStatusManagementSchema,
  PublicStatusOptionsQuerySchema,
  PublicStatusOptionsSchema,
  PublicStatusPageSchema,
  PublicStatusSettingsSchema
} from "../../../packages/shared-types/src/public-status.js";
import { anyMemberAuth, component, type OperationSpec } from "./openapi-model.js";
import { apiError } from "./openapi-components.js";
const noStore = {
  "Cache-Control": {
    description: "Publication changes are checked on every read.",
    schema: z.literal("no-store")
  }
};
const errors = {
  "400": { description: "Invalid input or publication selection.", schema: apiError },
  "401": { description: "Authentication required.", schema: apiError },
  "403": {
    description: "Owner authorization or valid session CSRF token required.",
    schema: apiError
  },
  "404": { description: "Status page or project unavailable.", schema: apiError },
  "429": { description: "Rate limited; retry after the indicated seconds.", schema: apiError },
  "500": { description: "Status settings unavailable.", schema: apiError }
};
export function publicStatusOperations(): OperationSpec[] {
  return [
    {
      method: "get",
      path: "/v1/public/status/{publicId}",
      operationId: "getPublicStatusPage",
      summary: "Read a published, minimized status page without credentials",
      tags: ["Public status"],
      params: z.object({ publicId: PublicStatusIdSchema }).strict(),
      security: [],
      responses: {
        "200": {
          description: "Title, names and selected availability aggregates only.",
          headers: noStore,
          schema: component("PublicStatusPage", PublicStatusPageSchema)
        },
        "404": errors["404"],
        "429": errors["429"],
        "503": { description: "Status data unavailable.", schema: apiError }
      }
    },
    ...(["get", "save", "options", "preview"] as const).map(
      (action): OperationSpec => ({
        method: action === "save" ? "put" : "get",
        path: `/v1/projects/{id}/status-page${action === "options" || action === "preview" ? `/${action}` : ""}`,
        operationId: `${action}ProjectStatusPage`,
        summary:
          action === "get"
            ? "Read settings for owners or the published link for collaborators"
            : `${action} project public status page (owner only)`,
        tags: ["Public status"],
        params: z.object({ id: z.string().uuid() }).strict(),
        security: anyMemberAuth,
        ...(action === "save"
          ? { requestBody: component("PublicStatusSettings", PublicStatusSettingsSchema) }
          : {}),
        ...(action === "options" ? { query: PublicStatusOptionsQuerySchema } : {}),
        responses: {
          ...errors,
          "200": {
            description:
              "Read-only availability preview, bounded options, or saved publication settings.",
            headers: noStore,
            schema:
              action === "preview"
                ? component("PublicStatusPage", PublicStatusPageSchema)
                : action === "options"
                  ? component("PublicStatusOptions", PublicStatusOptionsSchema)
                  : component("PublicStatusManagement", PublicStatusManagementSchema)
          }
        }
      })
    )
  ];
}
