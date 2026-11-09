import {
  ReportEmailDeliveriesSchema,
  type ReportEmailDelivery
} from "../../smart-reports/src/report-email.js";
import {
  createReportRequest,
  reportResourceId,
  type ReportHttpClient,
  type ReportScope
} from "./http.js";
export interface ReportDeliveryApi {
  list(input: ReportScope & { runId: string }): Promise<ReportEmailDelivery[]>;
}
export function createReportDeliveryApi(client: ReportHttpClient): ReportDeliveryApi {
  const request = createReportRequest(client);
  return {
    async list(input) {
      return (
        await request(
          input,
          "GET",
          `/v1/organizations/${reportResourceId(input.organizationId)}/reports/${reportResourceId(input.runId)}/deliveries`,
          ReportEmailDeliveriesSchema
        )
      ).deliveries;
    }
  };
}
