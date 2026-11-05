import { z } from "zod";

export const ALERT_SCOPE_SERVICE_LIMIT = 100;

const ScopeServiceSchema = z
  .object({
    service_definition_id: z.string().guid(),
    name: z.string().min(1)
  })
  .strict();

/** Read-only interpretation of the accepted origin set, independently of the
 * selected service filter. Absence/null is unavailable, never global coverage. */
export const AlertScopeSchema = z
  .object({
    origin_project_ids: z.array(z.string().guid()).min(1).max(1000),
    covers_current_project: z.boolean(),
    services: z.array(ScopeServiceSchema).max(ALERT_SCOPE_SERVICE_LIMIT),
    service_count: z.number().int().min(0),
    service_filter: ScopeServiceSchema.extend({
      service_id: z.string().guid(),
      environment: z.string().min(1)
    }).nullable()
  })
  .strict()
  .refine((scope) => scope.service_count >= scope.services.length, {
    message: "scope_service_count_invalid"
  });

export type AlertScope = z.infer<typeof AlertScopeSchema>;
