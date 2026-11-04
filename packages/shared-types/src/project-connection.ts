import { z } from "zod";

export const ConnectionConfigSchema = z
  .object({
    mode: z.enum(["local-only", "connected"]),
    cloud_project_id: z.string().nullable(),
    cloud_base_url: z.string().nullable(),
    environments: z
      .object({
        local: z.object({ delivery: z.enum(["local-only", "cloud-enabled"]) }).strict(),
        development: z.object({ delivery: z.enum(["local-only", "cloud-enabled"]) }).strict(),
        staging: z.object({ delivery: z.enum(["local-only", "cloud-enabled"]) }).strict(),
        production: z.object({ delivery: z.enum(["local-only", "cloud-enabled"]) }).strict()
      })
      .strict()
  })
  .strict();
