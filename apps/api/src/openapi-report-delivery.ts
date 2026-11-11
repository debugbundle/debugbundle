import { z } from "zod";
import { ReportEmailDeliveriesSchema } from "../../../packages/smart-reports/src/report-email.js";
import { apiError } from "./openapi-components.js";
import { anyMemberAuth, component, type OperationSpec } from "./openapi-model.js";
export function reportDeliveryOperations(): OperationSpec[] {
  return [
    {
      method: "get",
      path: "/v1/organizations/{organizationId}/reports/{runId}/deliveries",
      operationId: "listReportDeliveries",
      summary: "Read safe per-recipient report email states without sending or retrying",
      tags: ["Smart Reports"],
      security: anyMemberAuth,
      params: z.object({ organizationId: z.uuid(), runId: z.uuid() }).strict(),
      responses: {
        "200": {
          description:
            "Private/no-store, at most ten saved recipient states. Accepted is provider acceptance, not inbox delivery. Uncertain sends are held and never automatically repeated. No provider receipt, attempt identity, body or email address is returned.",
          schema: component("ReportEmailDeliveries", ReportEmailDeliveriesSchema)
        },
        "400": { description: "Invalid identity.", schema: apiError },
        "401": { description: "Browser session or access token required.", schema: apiError },
        "403": {
          description: "Current whole-scope reader or credential access denied.",
          schema: apiError
        },
        "404": {
          description: "Report expired, deleted, unavailable or privacy-invalidated.",
          schema: apiError
        },
        "429": { description: "Read request limit exceeded.", schema: apiError },
        "500": { description: "Delivery metadata operation failed safely.", schema: apiError }
      }
    }
  ];
}
