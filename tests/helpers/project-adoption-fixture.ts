import { mkdtemp, mkdir, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { ProjectMergeOperation } from "../../packages/shared-types/src/project-consolidation.js";
export async function createProjectAdoptionFixture() {
  const root = await mkdtemp(join(tmpdir(), "debugbundle-adoption-"));
  const source = randomUUID(),
    target = randomUUID(),
    definition = randomUUID(),
    operationId = randomUUID(),
    now = new Date().toISOString();
  const service = {
    service_definition_id: definition,
    project_id: target,
    origin_project_id: source,
    name: "Site",
    input_name: "web",
    description: null,
    repository_url: "https://github.com/fixture/site",
    repository_root: null,
    repository: { url: "https://github.com/fixture/site", root: null, source: "service" as const },
    environments: ["production"],
    created_at: now,
    updated_at: now,
    retained_input_names: ["web"],
    manual_review_required: false
  };
  const operation: ProjectMergeOperation = {
    operation_id: operationId,
    canonical_project_id: target,
    state: "completed",
    request: {
      target_project_id: target,
      source_project_ids: [source],
      service_mappings: [
        { source_project_id: source, service_definition_id: definition, name: "Site" }
      ]
    },
    plan_digest: "a".repeat(64),
    receipt: {
      canonical_project_id: target,
      origin_ids: [target, source].sort(),
      legacy_project_ids: [source],
      service_mappings: [
        { source_project_id: source, service_definition_id: definition, name: "Site" }
      ],
      adoption_manifest: {
        version: 1,
        canonical_project_id: target,
        origin_project_ids: [target, source].sort(),
        credential_strategy: "retain_existing_tokens_and_input_names",
        services: [service],
        remaining_gates: ["authorised_repository_adoption", "deployed_runtime_verification"]
      }
    },
    error_code: null,
    committed_at: now,
    verified_at: now,
    created_at: now,
    updated_at: now,
    local_adoption: "pending",
    deployed_runtime: "pending"
  };
  await mkdir(join(root, ".debugbundle/local"), { recursive: true });
  const connection = {
    mode: "connected",
    cloud_project_id: source,
    cloud_base_url: "https://api.example.test",
    environments: Object.fromEntries(
      ["local", "development", "staging", "production"].map((key) => [
        key,
        { delivery: "local-only" }
      ])
    )
  };
  const profile = {
    profile_version: "v1",
    project: {
      name: "Website",
      repo_url: "https://github.com/fixture/site",
      primary_languages: [],
      package_managers: [],
      deployment_targets: []
    },
    services: [
      {
        name: "web",
        kind: "frontend",
        runtime: "browser",
        framework: "react",
        paths: ["src"],
        owns_routes: [],
        depends_on: [],
        custom: { keep: "custom value" }
      }
    ],
    infrastructure: { databases: [], queues: [], object_storage: [], external_services: [] },
    critical_paths: [],
    repo: { root_paths: ["src"], generated_paths: [], do_not_edit_paths: [] },
    developer_workflows: { install: "", build: "", test: "", lint: "" },
    debugbundle: {
      profile_owner: "owner",
      last_reviewed_at: now,
      validation_status: "agent-validated",
      skill_path: ".agents/skills/debugbundle/SKILL.md",
      notes: "Owner notes"
    },
    custom_secret: "dbundle_proj_synthetic_never_print"
  };
  const connectionPath = join(root, ".debugbundle/local/connection.json"),
    profilePath = join(root, ".debugbundle/profile.json");
  await writeFile(connectionPath, JSON.stringify(connection, null, 2) + "\n");
  await writeFile(profilePath, JSON.stringify(profile, null, 2) + "\n");
  await chmod(profilePath, 0o640);
  await writeFile(join(root, ".debugbundle/local/state.json"), "retained-local-state");
  return { root, source, target, definition, operation, profile, profilePath, connectionPath };
}
