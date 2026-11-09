import { z } from "zod";

export const OrganizationRoleSchema = z.enum(["owner", "admin", "member"]);
export const ProjectRoleSchema = z.enum(["owner", "admin", "member", "viewer"]);
export const ProjectMemberRoleSchema = z.enum(["admin", "member", "viewer"]);
export type OrganizationRole = z.infer<typeof OrganizationRoleSchema>;
export type ProjectRole = z.infer<typeof ProjectRoleSchema>;
export type ProjectMemberRole = z.infer<typeof ProjectMemberRoleSchema>;

export const MemberTokenPermissionSchema = z.enum([
  "project:read",
  "project:write",
  "project:admin",
  "organization:admin"
]);
export type MemberTokenPermission = z.infer<typeof MemberTokenPermissionSchema>;
const permissions = z
  .array(MemberTokenPermissionSchema)
  .min(1)
  .max(4)
  .refine((items) => new Set(items).size === items.length, "duplicate_permissions");
const projectIds = z
  .array(z.uuid())
  .min(1)
  .max(100)
  .refine((items) => new Set(items).size === items.length, "duplicate_projects");

/** Public declaration; accepted origins are supplied by the server, never a client. */
export const MemberTokenScopeDeclarationSchema = z
  .discriminatedUnion("mode", [
    z.object({ mode: z.literal("projects"), project_ids: projectIds, permissions }).strict(),
    z.object({ mode: z.literal("organization"), organization_id: z.uuid(), permissions }).strict()
  ])
  .refine(
    (scope) => scope.mode !== "projects" || !scope.permissions.includes("organization:admin"),
    "organization_permission_requires_organization_scope"
  );
export type MemberTokenScopeDeclaration = z.infer<typeof MemberTokenScopeDeclarationSchema>;

export const MemberTokenPolicySchema = z
  .discriminatedUnion("mode", [
    z
      .object({
        version: z.literal(1),
        mode: z.literal("projects"),
        permissions,
        projects: z
          .array(
            z
              .object({
                project_id: z.uuid(),
                origin_project_ids: z.array(z.uuid()).min(1).max(1000)
              })
              .strict()
          )
          .min(1)
          .max(100)
      })
      .strict(),
    z
      .object({
        version: z.literal(1),
        mode: z.literal("organization"),
        permissions,
        organization_id: z.uuid()
      })
      .strict()
  ])
  .superRefine((policy, context) => {
    if (policy.mode !== "projects") return;
    if (policy.permissions.includes("organization:admin"))
      context.addIssue({
        code: "custom",
        message: "organization_permission_requires_organization_scope"
      });
    if (
      new Set(policy.projects.map((project) => project.project_id)).size !== policy.projects.length
    )
      context.addIssue({ code: "custom", message: "duplicate_projects" });
    if (new Set(policy.projects.flatMap((project) => project.origin_project_ids)).size > 1000)
      context.addIssue({ code: "custom", message: "project_scope_limit_exceeded" });
  });
export type MemberTokenPolicy = z.infer<typeof MemberTokenPolicySchema>;
