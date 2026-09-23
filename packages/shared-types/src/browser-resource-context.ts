import { z } from "zod";
import { BrowserResourceRoutesSchema } from "./browser-resource-routes.js";

export const BrowserResourceContextSchema = z.object({
  version: z.literal(1),
  host: z.string().max(255).nullable(),
  path: z.string().max(1024),
  type: z.string().nullable(),
  first_party: z.boolean().nullable(),
  role: z.enum([
    "analytics",
    "advertising",
    "tag_manager",
    "authentication",
    "application_asset",
    "unknown"
  ]),
  provider: z.string().nullable(),
  title: z.string(),
  optional_candidate: z.boolean(),
  diagnosis: z.string(),
  routes: BrowserResourceRoutesSchema,
  interruption: z
    .object({
      visibility_state: z.enum(["hidden", "prerender", "unloaded"]),
      ready_state: z.enum(["loading", "interactive"]),
      target_tag_name: z.literal("link"),
      rel: z.enum(["preload", "modulepreload", "prefetch"])
    })
    .optional(),
  recovery_failures: z
    .array(
      z.object({
        source: z.enum(["request_event", "frontend_breadcrumb"]),
        method: z.string().min(1).max(32),
        path: z.string().min(1).max(1024),
        status_code: z.number().int().min(400).max(599),
        occurred_at: z.string().datetime(),
        delay_ms: z.number().int().nonnegative().max(30_000)
      })
    )
    .max(10)
    .optional()
});
