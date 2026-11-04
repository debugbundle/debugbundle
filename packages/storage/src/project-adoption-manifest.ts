import type { ProjectAdoptionManifest } from "../../shared-types/src/project-consolidation.js";
import { createServiceDefinitionStore } from "./service-definition-store.js";
import { isSafeProjectMetadataText } from "./project-service-metadata-privacy.js";
import type { Queryable } from "./types.js";

/** Snapshot metadata only. Credentials, source files and runtime writes never enter this receipt. */
export async function buildProjectAdoptionManifest(
  db: Queryable,
  userId: string,
  projectId: string,
  origins: string[]
): Promise<ProjectAdoptionManifest> {
  const store = createServiceDefinitionStore(db);
  const services: ProjectAdoptionManifest["services"] = [];
  let cursor: string | undefined;
  do {
    const page = await store.list({
      project_id: projectId,
      user_id: userId,
      limit: 200,
      ...(cursor === undefined ? {} : { cursor })
    });
    if (services.length + page.services.length > 1000)
      throw new Error("service_inventory_limit_exceeded");
    for (const service of page.services)
      services.push({
        ...service,
        retained_input_names: [],
        manual_review_required: (service.redacted_fields?.length ?? 0) > 0
      });
    cursor = page.next_cursor ?? undefined;
  } while (cursor !== undefined);
  const aliases = await db.query<{ service_definition_id: string; input_name: string }>(
    'SELECT service_definition_id,input_name FROM service_input_aliases WHERE origin_project_id=ANY($1::uuid[]) ORDER BY service_definition_id,input_name COLLATE "C"',
    [origins]
  );
  const byId = new Map(services.map((service) => [service.service_definition_id, service]));
  for (const alias of aliases.rows) {
    const service = byId.get(alias.service_definition_id);
    if (!service) throw new Error("service_inventory_incomplete");
    if (isSafeProjectMetadataText(alias.input_name))
      service.retained_input_names.push(alias.input_name);
    else service.manual_review_required = true;
  }
  return {
    version: 1,
    canonical_project_id: projectId,
    origin_project_ids: origins,
    credential_strategy: "retain_existing_tokens_and_input_names",
    services,
    remaining_gates: ["authorised_repository_adoption", "deployed_runtime_verification"]
  };
}
