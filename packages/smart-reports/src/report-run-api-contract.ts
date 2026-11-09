import { z } from "zod";
import { ReportRunRecordSchema } from "./report-run.js";
export const ReportRunCursorValueSchema = z
  .object({ at: z.string().datetime(), id: z.uuid() })
  .strict();
export const ReportRunCursorSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,256}$/)
  .refine(
    (value) => {
      try {
        return ReportRunCursorValueSchema.safeParse(
          JSON.parse(atob(value.replaceAll("-", "+").replaceAll("_", "/")))
        ).success;
      } catch {
        return false;
      }
    },
    { message: "invalid_report_cursor" }
  );
export const ReportRunListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: ReportRunCursorSchema.optional()
  })
  .strict();
export const ReportRunResponseSchema = z.object({ run: ReportRunRecordSchema }).strict();
export const ReportRunListResponseSchema = z
  .object({
    runs: z.array(ReportRunRecordSchema).max(100),
    next_cursor: ReportRunCursorSchema.nullable()
  })
  .strict();
export const ReportRunMutationSchema = z
  .object({ expected_organization_id: z.uuid().optional() })
  .strict()
  .default({});
export const ReportRunDeletedSchema = z.object({ deleted: z.literal(true) }).strict();
