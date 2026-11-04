import { z } from "zod";

const ServiceSchema = z.object({
  name: z.string(),
  kind: z.enum(["frontend", "backend", "worker"]),
  runtime: z.string(),
  framework: z.string(),
  paths: z.array(z.string()),
  owns_routes: z.array(z.string()),
  depends_on: z.array(z.string())
});

export const ProfileSchema = z.object({
  profile_version: z.literal("v1"),
  project: z.object({
    name: z.string(),
    repo_url: z.string(),
    primary_languages: z.array(z.string()),
    package_managers: z.array(z.string()),
    deployment_targets: z.array(z.string())
  }),
  services: z.array(ServiceSchema),
  infrastructure: z.object({
    databases: z.array(z.string()),
    queues: z.array(z.string()),
    object_storage: z.array(z.string()),
    external_services: z.array(z.string())
  }),
  critical_paths: z.array(
    z.object({
      name: z.string(),
      owner_service: z.string(),
      notes: z.string()
    })
  ),
  repo: z.object({
    root_paths: z.array(z.string()),
    generated_paths: z.array(z.string()),
    do_not_edit_paths: z.array(z.string())
  }),
  developer_workflows: z.object({
    install: z.string(),
    build: z.string(),
    test: z.string(),
    lint: z.string()
  }),
  debugbundle: z.object({
    profile_owner: z.string(),
    last_reviewed_at: z.string().datetime({ offset: true }),
    validation_status: z.enum(["static-analysis-only", "agent-validated"]),
    skill_path: z.string(),
    notes: z.string()
  })
});
