import { z } from "zod";
import { CreateReportDefinitionSchema, ReportDefinitionRecordSchema } from "./report-definition.js";

export const CreateReportRequestSchema = z
  .object({ request_id: z.uuid(), definition: CreateReportDefinitionSchema })
  .strict();
export const DeleteReportDefinitionSchema = z
  .object({
    expected_version: z.number().int().positive(),
    expected_organization_id: z.uuid().optional()
  })
  .strict();
export const ReportDefinitionResponseSchema = z
  .object({ definition: ReportDefinitionRecordSchema })
  .strict();
export const ReportDefinitionListSchema = z
  .object({ definitions: z.array(ReportDefinitionRecordSchema).max(100) })
  .strict();
export const ReportDefinitionDeletedSchema = z.object({ deleted: z.literal(true) }).strict();
