import { z } from "zod";

export const PublicStatusIdSchema = z.string().regex(/^[a-f0-9]{24}$/);
const selection = z
  .object({ project_id: z.string().uuid(), check_ids: z.array(z.string().uuid()).max(50) })
  .strict();
export const PublicStatusSettingsSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    enabled: z.boolean(),
    projects: z.array(selection).min(1).max(50)
  })
  .strict()
  .superRefine((value, context) => {
    if (
      new Set(value.projects.map((p) => p.project_id)).size !== value.projects.length ||
      new Set(value.projects.flatMap((p) => p.check_ids)).size !==
        value.projects.reduce((n, p) => n + p.check_ids.length, 0) ||
      value.projects.reduce((count, p) => count + p.check_ids.length, 0) > 500
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choose distinct projects and checks within the publication limits."
      });
    }
  });
const state = z.enum(["unknown", "operational", "degraded", "down", "paused"]);
const percentage = z.number().min(0).max(100).nullable();
const verifiedAt = z.string().datetime({ offset: true }).nullable();
export const PublicStatusDaySchema = z
  .object({
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    state,
    impact: z.enum(["none", "minor", "elevated", "outage"]),
    total_checks: z.number().int().nonnegative(),
    successful_checks: z.number().int().nonnegative(),
    failed_checks: z.number().int().nonnegative(),
    degraded_checks: z.number().int().nonnegative(),
    downtime_seconds: z.number().nonnegative()
  })
  .strict();
const checkView = z
  .object({
    key: z.string().max(40),
    name: z.string().max(120),
    current_state: state,
    uptime_percentage: percentage,
    last_verified_at: verifiedAt,
    days: z.array(PublicStatusDaySchema).length(30)
  })
  .strict();
export const PublicStatusProjectSchema = checkView
  .extend({ checks: z.array(checkView).max(50) })
  .strict();
export const PublicStatusPageSchema = z
  .object({ title: z.string().max(120), projects: z.array(PublicStatusProjectSchema).max(50) })
  .strict();
export const PublicStatusManagementSchema = z
  .object({
    settings: PublicStatusSettingsSchema,
    public_id: PublicStatusIdSchema.nullable(),
    public_url: z.string().url().nullable(),
    access_mode: z.enum(["manage", "preview"])
  })
  .strict();
export const PublicStatusOptionsQueryObjectSchema = z
  .object({
    cursor: z.string().uuid().optional(),
    check_project_id: z.string().uuid().optional(),
    check_cursor: z.string().uuid().optional()
  })
  .strict();
export const PublicStatusOptionsQuerySchema = PublicStatusOptionsQueryObjectSchema.refine(
  (v) => !v.check_cursor || !!v.check_project_id,
  "A check cursor requires a project."
).refine((v) => !v.cursor || !v.check_project_id, "Project and check pagination are separate.");
export type PublicStatusOptionsQuery = z.infer<typeof PublicStatusOptionsQuerySchema>;
export const PublicStatusOptionsSchema = z
  .object({
    projects: z
      .array(
        z
          .object({
            project_id: z.string().uuid(),
            name: z.string(),
            checks: z
              .array(z.object({ check_id: z.string().uuid(), name: z.string() }).strict())
              .max(50),
            next_check_cursor: z.string().uuid().nullable()
          })
          .strict()
      )
      .max(50),
    next_cursor: z.string().uuid().nullable()
  })
  .strict();
export type PublicStatusSettings = z.infer<typeof PublicStatusSettingsSchema>;
export type PublicStatusPage = z.infer<typeof PublicStatusPageSchema>;
export type PublicStatusProject = z.infer<typeof PublicStatusProjectSchema>;
export type PublicStatusManagement = z.infer<typeof PublicStatusManagementSchema>;
export type PublicStatusOptions = z.infer<typeof PublicStatusOptionsSchema>;

export function parsePublicStatusBaseUrl(value: string): URL {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/[a-zA-Z0-9_/-]*$/.test(url.pathname)
  )
    throw new Error("public_status_base_url_invalid");
  return url;
}
