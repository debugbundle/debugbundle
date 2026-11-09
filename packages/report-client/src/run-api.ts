import type { z } from "zod";
import {
  ReportContentViewSchema,
  type ReportContentView
} from "../../smart-reports/src/report-content.js";
import {
  ReportRunCommandSchema,
  type ReportRunRecord
} from "../../smart-reports/src/report-run.js";
import {
  ReportRunResponseSchema,
  ReportRunListQuerySchema,
  ReportRunListResponseSchema,
  ReportRunMutationSchema,
  ReportRunDeletedSchema
} from "../../smart-reports/src/report-run-api-contract.js";
import {
  createReportRequest,
  reportPayload,
  reportResourceId,
  type ReportHttpClient,
  type ReportScope
} from "./http.js";
export type ReportRunIdentity = ReportScope & { runId: string };
export interface ReportRunApi {
  list(
    input: ReportScope & { limit?: number; cursor?: string }
  ): Promise<z.infer<typeof ReportRunListResponseSchema>>;
  get(input: ReportRunIdentity): Promise<ReportRunRecord>;
  content(input: ReportRunIdentity): Promise<ReportContentView>;
  generate(
    input: ReportScope & { command: z.input<typeof ReportRunCommandSchema> }
  ): Promise<ReportRunRecord>;
  cancel(input: ReportRunIdentity & { expectedOrganizationId?: string }): Promise<ReportRunRecord>;
  remove(input: ReportRunIdentity & { expectedOrganizationId?: string }): Promise<void>;
}
const base = (input: ReportScope): string =>
  `/v1/organizations/${reportResourceId(input.organizationId)}/reports`;
export function createReportRunApi(client: ReportHttpClient): ReportRunApi {
  const request = createReportRequest(client);
  return {
    async list(input) {
      const query = reportPayload(ReportRunListQuerySchema, {
        ...(input.limit === undefined ? {} : { limit: input.limit }),
        ...(input.cursor === undefined ? {} : { cursor: input.cursor })
      });
      const params = new URLSearchParams({ limit: String(query.limit) });
      if (query.cursor !== undefined) params.set("cursor", query.cursor);
      return request(
        input,
        "GET",
        `${base(input)}?${params.toString()}`,
        ReportRunListResponseSchema
      );
    },
    async get(input) {
      return (
        await request(
          input,
          "GET",
          `${base(input)}/${reportResourceId(input.runId)}`,
          ReportRunResponseSchema
        )
      ).run;
    },
    async generate(input) {
      return (
        await request(
          input,
          "POST",
          base(input),
          ReportRunResponseSchema,
          reportPayload(ReportRunCommandSchema, input.command)
        )
      ).run;
    },
    async content(input) {
      return request(
        input,
        "GET",
        `${base(input)}/${reportResourceId(input.runId)}/document`,
        ReportContentViewSchema
      );
    },
    async cancel(input) {
      return (
        await request(
          input,
          "POST",
          `${base(input)}/${reportResourceId(input.runId)}/cancel`,
          ReportRunResponseSchema,
          reportPayload(
            ReportRunMutationSchema,
            input.expectedOrganizationId === undefined
              ? {}
              : { expected_organization_id: input.expectedOrganizationId }
          )
        )
      ).run;
    },
    async remove(input) {
      await request(
        input,
        "DELETE",
        `${base(input)}/${reportResourceId(input.runId)}`,
        ReportRunDeletedSchema,
        reportPayload(
          ReportRunMutationSchema,
          input.expectedOrganizationId === undefined
            ? {}
            : { expected_organization_id: input.expectedOrganizationId }
        )
      );
    }
  };
}
