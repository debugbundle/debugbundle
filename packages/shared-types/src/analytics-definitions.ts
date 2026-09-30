import { z } from "zod";
import {
  SemanticAnalyticsKeySchema as Key,
  SemanticAnalyticsValueSchema as Value,
  SemanticAnalyticsRevisionSchema as Revision,
  SemanticAnalyticsPropertyKeySchema as PropertyKey,
  SemanticAnalyticsProducerSchema as Producer,
  SemanticAnalyticsPurposeSchema as Purpose,
  SemanticAnalyticsKindSchema as Kind,
  SemanticAnalyticsUnitSchema as Unit
} from "./analytics-semantic-primitives.js";

const unique = <T>(values: T[]): boolean => new Set(values).size === values.length;
const Description = z.string().min(1).max(500);
const DisplayName = z.string().min(1).max(120);
const Version = z
  .string()
  .max(64)
  .regex(/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/);

export const AnalyticsScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("project"), project_id: z.string().uuid() }).strict(),
  z.object({ kind: z.literal("space"), space_id: z.string().uuid() }).strict()
]);
export type AnalyticsScope = z.infer<typeof AnalyticsScopeSchema>;
export const AnalyticsSubjectSchema = z.enum(["session", "anonymous", "user", "account"]);

const PropertyDefinition = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("enum"),
      values: z.array(Value).min(1).max(32).refine(unique),
      required: z.boolean()
    })
    .strict(),
  z.object({ type: z.literal("boolean"), required: z.boolean() }).strict()
]);

/** A declared revision is metadata, not evidence that any producer has emitted it. */
export const AnalyticsCatalogEntrySchema = z
  .object({
    name: Key,
    revision: Revision,
    description: Description,
    producers: z.array(Producer).min(1).max(3).refine(unique),
    purpose: Purpose,
    success_boundary: z.enum(["observed", "committed"]),
    properties: z
      .record(PropertyKey, PropertyDefinition)
      .refine((value) => Object.keys(value).length <= 20),
    measurements: z
      .record(PropertyKey, z.object({ unit: Unit, required: z.boolean() }).strict())
      .refine((value) => Object.keys(value).length <= 8),
    expected_producers: z
      .array(
        z
          .object({
            sdk_name: z
              .string()
              .min(1)
              .max(120)
              .regex(/^[A-Za-z@][A-Za-z0-9@/_.:-]*$/),
            minimum_version: Version
          })
          .strict()
      )
      .max(16)
      .refine((values) => unique(values.map((value) => value.sdk_name)))
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.purpose === "business_measurement" &&
      (value.producers.length !== 1 ||
        value.producers[0] !== "server" ||
        value.success_boundary !== "committed")
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Business facts require a committed server producer."
      });
  });
export type AnalyticsCatalogEntry = z.infer<typeof AnalyticsCatalogEntrySchema>;

const Scalar = z.union([Value, z.boolean(), z.null()]);
const scalarValues = z.array(Scalar).min(1).max(32).refine(unique);
const Clause = z.discriminatedUnion("field", [
  z
    .object({
      field: z.literal("event_name"),
      operator: z.literal("in"),
      values: z.array(Key).min(1).max(32).refine(unique)
    })
    .strict(),
  z
    .object({
      field: z.literal("event_kind"),
      operator: z.literal("in"),
      values: z.array(Kind).min(1).max(7).refine(unique)
    })
    .strict(),
  z
    .object({
      field: z.literal("property"),
      key: PropertyKey,
      operator: z.literal("in"),
      values: scalarValues
    })
    .strict(),
  z
    .object({
      field: z.literal("producer"),
      operator: z.literal("in"),
      values: z.array(Producer).min(1).max(3).refine(unique)
    })
    .strict()
]);
export type AnalyticsPredicate =
  | z.infer<typeof Clause>
  | { all: AnalyticsPredicate[] }
  | { any: AnalyticsPredicate[] };

// Construct finite schemas, so attacker-controlled depth never drives recursive validation.
function group(child: z.ZodType<AnalyticsPredicate>): z.ZodType<AnalyticsPredicate> {
  return z.union([
    Clause,
    z.object({ all: z.array(child).min(1).max(16) }).strict(),
    z.object({ any: z.array(child).min(1).max(16) }).strict()
  ]);
}
export const AnalyticsPredicateSchema = group(group(group(Clause))).superRefine((value, ctx) => {
  const pending = [value];
  let clauses = 0;
  while (pending.length > 0) {
    const node = pending.pop()!;
    if ("all" in node) pending.push(...node.all);
    else if ("any" in node) pending.push(...node.any);
    else clauses++;
    if (clauses > 16) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At most sixteen predicate clauses are supported."
      });
      return;
    }
  }
});

const Timezone = z
  .string()
  .min(1)
  .max(80)
  .refine(
    (value) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: value });
        return !/^[+-]/.test(value);
      } catch {
        return false;
      }
    },
    { message: "A supported IANA calendar timezone is required." }
  );
const DefinitionBase = {
  key: Key,
  revision: Revision,
  display_name: DisplayName,
  scope: AnalyticsScopeSchema,
  subject: AnalyticsSubjectSchema,
  timezone: Timezone
};
const Breakdown = z
  .union([
    z.object({ field: z.literal("property"), key: PropertyKey }).strict(),
    z
      .object({
        field: z.enum([
          "device_type",
          "auth_state",
          "referrer_domain",
          "utm_source",
          "utm_medium",
          "utm_campaign"
        ])
      })
      .strict()
  ])
  .nullable();
function checkSubject(
  value: { scope: AnalyticsScope; subject: string },
  ctx: z.RefinementCtx
): void {
  if (value.scope.kind === "space" && value.subject === "session")
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["subject"],
      message: "Space journeys require linked subjects; sessions remain project-scoped."
    });
}
export const AnalyticsGoalDefinitionSchema = z
  .object({
    ...DefinitionBase,
    kind: z.literal("goal"),
    predicate: AnalyticsPredicateSchema,
    denominator: AnalyticsPredicateSchema.nullable(),
    breakdown: Breakdown
  })
  .strict()
  .superRefine(checkSubject);
export const AnalyticsOrderedFunnelDefinitionSchema = z
  .object({
    ...DefinitionBase,
    kind: z.literal("ordered_funnel"),
    conversion_window_seconds: z
      .number()
      .int()
      .min(1)
      .max(30 * 86400),
    breakdown: Breakdown,
    steps: z
      .array(z.object({ key: Key, predicate: AnalyticsPredicateSchema }).strict())
      .min(2)
      .max(10)
      .refine((values) => unique(values.map((value) => value.key)))
  })
  .strict()
  .superRefine(checkSubject);
export type AnalyticsOrderedFunnelDefinition = z.infer<
  typeof AnalyticsOrderedFunnelDefinitionSchema
>;
export const AnalyticsRetentionDefinitionSchema = z
  .object({
    ...DefinitionBase,
    kind: z.literal("retention"),
    entry: AnalyticsPredicateSchema,
    return: AnalyticsPredicateSchema,
    mode: z.enum(["exact_period", "on_or_after"]),
    period: z.enum(["day", "week", "month"]),
    offsets: z
      .array(z.number().int().min(1).max(90))
      .min(1)
      .max(31)
      .refine((values) => values.every((value, index) => index === 0 || value > values[index - 1]!))
  })
  .strict()
  .superRefine((value, ctx) => {
    checkSubject(value, ctx);
    // Full calendar months can each take 31 days; effective tier retention may be lower.
    const cap = value.period === "day" ? 90 : value.period === "week" ? 12 : 2;
    if (value.offsets.some((offset) => offset > cap))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["offsets"],
        message: "Retention exceeds the detailed analysis horizon."
      });
  });
export type AnalyticsRetentionDefinition = z.infer<typeof AnalyticsRetentionDefinitionSchema>;
export const AnalyticsReportDefinitionSchema = z.union([
  AnalyticsGoalDefinitionSchema,
  AnalyticsOrderedFunnelDefinitionSchema,
  AnalyticsRetentionDefinitionSchema
]);

export const AnalyticsMeasurementPlanSchema = z
  .object({
    scope: AnalyticsScopeSchema,
    expected_revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    idempotency_key: z.string().uuid(),
    enforcement: z.literal("strict"),
    business_measurement_enabled: z.boolean().optional(),
    catalog: z
      .array(AnalyticsCatalogEntrySchema)
      .max(100)
      .refine((values) => unique(values.map((value) => value.name))),
    reports: z
      .array(AnalyticsReportDefinitionSchema)
      .max(100)
      .refine((values) => unique(values.map((value) => value.key)))
  })
  .strict()
  .superRefine((value, ctx) => {
    const identity = (scope: AnalyticsScope): string =>
      scope.kind === "project" ? `project:${scope.project_id}` : `space:${scope.space_id}`;
    if (value.reports.some((report) => identity(report.scope) !== identity(value.scope)))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reports"],
        message: "Every report must belong to the plan scope."
      });
    if (value.scope.kind === "space" && value.business_measurement_enabled === true)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["business_measurement_enabled"],
        message: "Only a project plan can grant business measurement."
      });
  });
export type AnalyticsMeasurementPlan = z.infer<typeof AnalyticsMeasurementPlanSchema>;

/** Authorization must verify actual organization ownership and every project, not these IDs. */
export const AnalyticsSpaceMutationSchema = z
  .object({
    organization_id: z
      .string()
      .uuid()
      .transform((value) => value.toLowerCase()),
    display_name: DisplayName,
    expected_revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    idempotency_key: z
      .string()
      .uuid()
      .transform((value) => value.toLowerCase()),
    project_ids: z
      .array(
        z
          .string()
          .uuid()
          .transform((value) => value.toLowerCase())
      )
      .min(1)
      .max(20)
      .refine(unique),
    mode: z.enum(["portfolio", "connected"])
  })
  .strict();
export type AnalyticsSpaceMutation = z.infer<typeof AnalyticsSpaceMutationSchema>;
