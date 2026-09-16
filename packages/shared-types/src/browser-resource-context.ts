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
  routes: BrowserResourceRoutesSchema
});
