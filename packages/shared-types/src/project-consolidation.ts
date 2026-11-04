import { z } from "zod";
import { compareCanonicalText } from "./canonical-text-order.js";
import { ServiceDefinitionNameSchema, ServiceDefinitionSchema } from "./project-services.js";
const projectIdentity = z
  .string()
  .guid()
  .transform((value) => value.toLowerCase());

export const ProjectServiceMappingSchema = z
  .object({
    source_project_id: projectIdentity,
    service_definition_id: projectIdentity,
    name: ServiceDefinitionNameSchema
  })
  .strict();
export const ProjectMergeRequestSchema = z
  .object({
    target_project_id: projectIdentity,
    source_project_ids: z.array(projectIdentity).min(1).max(15),
    service_mappings: z.array(ProjectServiceMappingSchema).max(1000)
  })
  .strict()
  .refine((value) => {
    const sources = new Set(value.source_project_ids);
    return (
      sources.size === value.source_project_ids.length && !sources.has(value.target_project_id)
    );
  })
  .transform((value) => ({
    ...value,
    source_project_ids: [...value.source_project_ids].sort(),
    service_mappings: [...value.service_mappings].sort(
      (a, b) =>
        compareCanonicalText(a.source_project_id, b.source_project_id) ||
        compareCanonicalText(a.service_definition_id, b.service_definition_id) ||
        compareCanonicalText(a.name, b.name)
    )
  }));
export const ProjectMergeStateSchema = z.enum([
  "queued",
  "checking",
  "applying",
  "verifying",
  "completed",
  "cancelled",
  "failed_before_commit",
  "verification_failed_after_commit"
]);
export const ProjectMergeApplySchema = z
  .object({
    request: ProjectMergeRequestSchema,
    plan_digest: z.string().regex(/^[a-f0-9]{64}$/),
    idempotency_key: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9_-]+$/)
  })
  .strict();
export type ProjectMergeRequest = z.infer<typeof ProjectMergeRequestSchema>;
export type ProjectServiceMapping = z.infer<typeof ProjectServiceMappingSchema>;
export type ProjectMergeState = z.infer<typeof ProjectMergeStateSchema>;
export type ProjectMergeApply = z.infer<typeof ProjectMergeApplySchema>;

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const resourceLimit = z
  .object({
    resource: z.string(),
    count: z.number().int().nonnegative(),
    limit: z.number().int().nonnegative()
  })
  .strict();
export const ProjectMergePlanSchema = z
  .object({
    target_project_id: projectIdentity,
    source_project_ids: z.array(projectIdentity),
    service_mappings: z.array(ProjectServiceMappingSchema),
    plan_version: z.literal(1),
    runtime_contract: z.string(),
    plan_digest: digest,
    ready: z.boolean(),
    origin_ids: z.array(projectIdentity),
    observed_rows: z.number().int().nonnegative(),
    blockers: z.array(
      z
        .object({
          code: z.string(),
          project_id: projectIdentity.nullable(),
          resource: z.string().nullable()
        })
        .strict()
    ),
    suggested_service_mappings: z.array(ProjectServiceMappingSchema),
    resource_limits: z.array(resourceLimit)
  })
  .strict();
export const ProjectAdoptionManifestSchema = z
  .object({
    version: z.literal(1),
    canonical_project_id: projectIdentity,
    origin_project_ids: z.array(projectIdentity),
    credential_strategy: z.literal("retain_existing_tokens_and_input_names"),
    services: z.array(
      ServiceDefinitionSchema.extend({
        retained_input_names: z.array(z.string()),
        manual_review_required: z.boolean()
      })
    ),
    remaining_gates: z.tuple([
      z.literal("authorised_repository_adoption"),
      z.literal("deployed_runtime_verification")
    ])
  })
  .strict();
export type ProjectAdoptionManifest = z.infer<typeof ProjectAdoptionManifestSchema>;
export const ProjectMergeReceiptSchema = z
  .object({
    canonical_project_id: projectIdentity,
    origin_ids: z.array(projectIdentity),
    legacy_project_ids: z.array(projectIdentity),
    service_mappings: z.array(ProjectServiceMappingSchema),
    adoption_manifest: ProjectAdoptionManifestSchema.optional()
  })
  .strict();
export const ProjectMergeOperationSchema = z
  .object({
    operation_id: projectIdentity,
    canonical_project_id: projectIdentity,
    state: ProjectMergeStateSchema,
    request: ProjectMergeRequestSchema,
    plan_digest: digest,
    receipt: ProjectMergeReceiptSchema.nullable(),
    error_code: z.string().nullable(),
    committed_at: z.string().datetime().nullable(),
    verified_at: z.string().datetime().nullable(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    local_adoption: z.literal("pending"),
    deployed_runtime: z.literal("pending")
  })
  .strict();
export const ProjectMergeVerificationSchema = z
  .object({
    operation_id: projectIdentity,
    canonical_project_id: projectIdentity,
    verified: z.boolean(),
    failures: z.array(z.string())
  })
  .strict();
export const ProjectMergeSelectorSchema = z.union([
  z.object({ operation_id: projectIdentity }).strict(),
  z.object({ idempotency_key: ProjectMergeApplySchema.shape.idempotency_key }).strict()
]);
export type ProjectMergePlan = z.infer<typeof ProjectMergePlanSchema>;
export type ProjectMergeReceipt = z.infer<typeof ProjectMergeReceiptSchema>;
export type ProjectMergeOperation = z.infer<typeof ProjectMergeOperationSchema>;
export type ProjectMergeVerification = z.infer<typeof ProjectMergeVerificationSchema>;
