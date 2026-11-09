import {
  ReportAllowanceResponseSchema,
  type ReportAllowance
} from "../../smart-reports/src/report-allowance.js";
import type { z } from "zod";
import {
  CreateReportRequestSchema,
  DeleteReportDefinitionSchema,
  ReportDefinitionDeletedSchema,
  ReportDefinitionListSchema,
  ReportDefinitionResponseSchema
} from "../../smart-reports/src/report-api-contract.js";
import {
  CreateReportDefinitionSchema,
  ReplaceReportDefinitionSchema,
  type ReportDefinitionRecord
} from "../../smart-reports/src/report-definition.js";

export { ReportApiError, type ReportHttpClient, type ReportScope } from "./http.js";
export { createReportRunApi, type ReportRunApi, type ReportRunIdentity } from "./run-api.js";
export {
  createReportPdfApi,
  reportPdfDownloadPath,
  type ReportPdfApi,
  type ReportPdfIdentity,
  type ReportBinaryHttpClient
} from "./pdf-api.js";
export { createReportBinaryTransport } from "./binary-transport.js";
export { createReportDeliveryApi, type ReportDeliveryApi } from "./delivery-api.js";
import {
  createReportRequest,
  reportPayload as body,
  reportResourceId as id,
  type ReportHttpClient,
  type ReportScope
} from "./http.js";
export type ReportIdentity = ReportScope & { definitionId: string };
export interface ReportApi {
  list(input: ReportScope): Promise<ReportDefinitionRecord[]>;
  get(input: ReportIdentity): Promise<ReportDefinitionRecord>;
  allowance(input: ReportIdentity): Promise<ReportAllowance>;
  create(
    input: ReportScope & {
      requestId: string;
      definition: z.input<typeof CreateReportDefinitionSchema>;
    }
  ): Promise<ReportDefinitionRecord>;
  replace(
    input: ReportIdentity & { definition: z.input<typeof ReplaceReportDefinitionSchema> }
  ): Promise<ReportDefinitionRecord>;
  remove(
    input: ReportIdentity & { expectedVersion: number; expectedOrganizationId?: string }
  ): Promise<void>;
}
function base(input: ReportScope): string {
  return `/v1/organizations/${id(input.organizationId)}/report-definitions`;
}
export function createReportApi(client: ReportHttpClient): ReportApi {
  const request = createReportRequest(client);
  return {
    async list(input) {
      return (await request(input, "GET", base(input), ReportDefinitionListSchema)).definitions;
    },
    async allowance(input) {
      return (
        await request(
          input,
          "GET",
          `${base(input)}/${id(input.definitionId)}/allowance`,
          ReportAllowanceResponseSchema
        )
      ).allowance;
    },
    async get(input) {
      return (
        await request(
          input,
          "GET",
          `${base(input)}/${id(input.definitionId)}`,
          ReportDefinitionResponseSchema
        )
      ).definition;
    },
    async create(input) {
      const payload = body(CreateReportRequestSchema, {
        request_id: input.requestId,
        definition: input.definition
      });
      return (await request(input, "POST", base(input), ReportDefinitionResponseSchema, payload))
        .definition;
    },
    async replace(input) {
      const payload = body(ReplaceReportDefinitionSchema, input.definition);
      return (
        await request(
          input,
          "PATCH",
          `${base(input)}/${id(input.definitionId)}`,
          ReportDefinitionResponseSchema,
          payload
        )
      ).definition;
    },
    async remove(input) {
      const payload = body(DeleteReportDefinitionSchema, {
        expected_version: input.expectedVersion,
        ...(input.expectedOrganizationId === undefined
          ? {}
          : { expected_organization_id: input.expectedOrganizationId })
      });
      await request(
        input,
        "DELETE",
        `${base(input)}/${id(input.definitionId)}`,
        ReportDefinitionDeletedSchema,
        payload
      );
    }
  };
}
