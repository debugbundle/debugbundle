import { z } from "zod";
import { AnalyticsCustomDimensionKeySchema } from "./analytics.js";

export const SemanticAnalyticsKeySchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z][A-Za-z0-9_.:-]*$/);
export const SemanticAnalyticsValueSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/);
export const SemanticAnalyticsRevisionSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
export const SemanticAnalyticsPropertyKeySchema = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_.-]*$/)
  .pipe(AnalyticsCustomDimensionKeySchema)
  .refine((value) => !["constructor", "prototype", "__proto__"].includes(value), {
    message: "Reserved analytics property key."
  });
export const SemanticAnalyticsProducerSchema = z.enum(["browser", "server", "mobile"]);
export const SemanticAnalyticsPurposeSchema = z.enum(["product_analytics", "business_measurement"]);
export const SemanticAnalyticsKindSchema = z.enum([
  "semantic",
  "page_view",
  "route_change",
  "screen_view",
  "session_start",
  "session_summary",
  "journey_marker"
]);
export const SemanticAnalyticsUnitSchema = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[A-Za-z][A-Za-z0-9_.:-]*$/);
