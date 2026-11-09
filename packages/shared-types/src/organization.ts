import { z } from "zod";
import { OrganizationRoleSchema } from "./access-control.js";

const projectIds = z
  .array(z.uuid())
  .max(100)
  .refine((ids) => new Set(ids).size === ids.length, "duplicate_projects");
export const OrganizationInviteBodySchema = z
  .object({
    email: z.email().max(320),
    role: z.enum(["admin", "member"]).default("member"),
    project_access: z.enum(["selected", "all"]).default("selected"),
    default_project_role: z.enum(["member", "viewer"]).default("member"),
    project_ids: projectIds.default([])
  })
  .strict()
  .refine(
    (value) =>
      value.project_ids.length === 0 ||
      (value.role === "member" && value.project_access === "selected"),
    "selected_project_ids_require_selected_member_access"
  );
export const OrganizationMemberUpdateSchema = z
  .object({
    role: z.enum(["admin", "member"]).optional(),
    project_access: z.enum(["selected", "all"]).optional(),
    default_project_role: z.enum(["member", "viewer"]).optional(),
    suspended: z.boolean().optional()
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "empty_update");
export const OrganizationSummarySchema = z
  .object({
    organization_id: z.uuid(),
    name: z.string(),
    plan: z.enum(["free", "solo", "team", "business"]),
    role: OrganizationRoleSchema
  })
  .strict();
export type OrganizationInviteBody = z.infer<typeof OrganizationInviteBodySchema>;
export type OrganizationMemberUpdate = z.infer<typeof OrganizationMemberUpdateSchema>;
export type OrganizationSummary = z.infer<typeof OrganizationSummarySchema>;

export const OrganizationPersonSchema = z
  .object({
    user_id: z.uuid(),
    email: z.email(),
    role: OrganizationRoleSchema.nullable(),
    project_access: z.enum(["selected", "all"]),
    default_project_role: z.enum(["member", "viewer"]),
    suspended_at: z.string().nullable(),
    grants_paused_at: z.string().nullable(),
    direct_project_count: z.number().int().nonnegative()
  })
  .strict();
export const OrganizationInviteSchema = z
  .object({
    invite_id: z.uuid(),
    organization_id: z.uuid(),
    email: z.email(),
    role: z.enum(["admin", "member"]),
    project_access: z.enum(["selected", "all"]),
    default_project_role: z.enum(["member", "viewer"]),
    project_ids: projectIds,
    expires_at: z.string(),
    created_at: z.string()
  })
  .strict();
export type OrganizationPerson = z.infer<typeof OrganizationPersonSchema>;
export type OrganizationInvite = z.infer<typeof OrganizationInviteSchema>;
