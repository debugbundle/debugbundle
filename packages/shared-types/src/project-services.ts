import { z } from "zod";

export const ServiceDefinitionNameSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[^\u0000-\u001f\u007f]+$/)
  .refine((value) => value.length === value.trim().length && value.trim().length > 0);
export const RepositoryUrlSchema = z
  .string()
  .max(2000)
  .refine((value) => value === value.trim() && !/[\u0000-\u0020\u007f]/.test(value))
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash
      );
    } catch {
      return false;
    }
  });
export const RepositoryRootSchema = z
  .string()
  .min(1)
  .max(1000)
  .refine(
    (value) =>
      !/[\\\u0000-\u001f\u007f]/.test(value) &&
      !value.startsWith("/") &&
      value.split("/").every((part) => part.length > 0 && part !== "." && part !== "..")
  );

const metadata = {
  name: ServiceDefinitionNameSchema,
  description: z.string().max(2000).nullable().optional(),
  repository_url: RepositoryUrlSchema.nullable().optional(),
  repository_root: RepositoryRootSchema.nullable().optional()
};
export const ServiceDefinitionCreateSchema = z.object(metadata).strict();
export const ServiceDefinitionUpdateSchema = z
  .object(metadata)
  .partial()
  .strict()
  .refine((input) => Object.keys(input).length > 0);
export const ServiceDefinitionSchema = z.object({
  service_definition_id: z.string().guid(),
  project_id: z.string().guid(),
  origin_project_id: z.string().guid(),
  name: z.string(),
  input_name: z.string(),
  redacted_fields: z
    .array(
      z.enum([
        "name",
        "input_name",
        "description",
        "repository_url",
        "repository_root",
        "repository",
        "environments"
      ])
    )
    .max(7)
    .optional(),
  description: z.string().nullable(),
  repository_url: z.string().nullable(),
  repository_root: z.string().nullable(),
  repository: z
    .object({
      url: z.string(),
      root: z.string().nullable(),
      source: z.enum(["project", "service"])
    })
    .nullable(),
  environments: z.array(z.string()),
  created_at: z.string(),
  updated_at: z.string()
});
export const ServiceDefinitionPageSchema = z.object({
  services: z.array(ServiceDefinitionSchema),
  next_cursor: z.string().guid().nullable()
});
export type ServiceDefinition = z.infer<typeof ServiceDefinitionSchema>;
export type ServiceDefinitionCreate = z.infer<typeof ServiceDefinitionCreateSchema>;
export type ServiceDefinitionUpdate = z.infer<typeof ServiceDefinitionUpdateSchema>;
export type ServiceDefinitionPage = z.infer<typeof ServiceDefinitionPageSchema>;
