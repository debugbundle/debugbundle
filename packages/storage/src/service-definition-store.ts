import {
  isSafeServiceMetadata,
  safeServiceDefinition
} from "./project-service-metadata-privacy.js";
import { randomUUID } from "node:crypto";
import {
  ServiceDefinitionCreateSchema,
  ServiceDefinitionUpdateSchema,
  type ServiceDefinition,
  type ServiceDefinitionCreate,
  type ServiceDefinitionUpdate,
  type ServiceDefinitionPage
} from "../../shared-types/src/project-services.js";
import { createMetadataAccess } from "./metadata-access.js";
import { runInTransaction } from "./transaction.js";
import type { Queryable } from "./types.js";

type Scope = { project_id: string; user_id: string };
type Identity = Scope & { service_definition_id: string };
export class ServiceDefinitionError extends Error {
  constructor(
    readonly code: string,
    readonly canonical_project_id: string | null = null
  ) {
    super(code);
  }
}
export interface ServiceDefinitionStore {
  list(
    input: Scope & { limit: number; cursor?: string | undefined }
  ): Promise<ServiceDefinitionPage>;
  get(input: Identity): Promise<ServiceDefinition>;
  create(input: Scope & ServiceDefinitionCreate): Promise<ServiceDefinition>;
  update(input: Identity & ServiceDefinitionUpdate): Promise<ServiceDefinition>;
}

async function authorize(db: Queryable, scope: Scope, write = false): Promise<void> {
  let access = await createMetadataAccess(db).resolveProjectAccessForUser!(scope);
  if (!access) throw new ServiceDefinitionError("project_not_found");
  if (write && access.canonical_project_id)
    throw new ServiceDefinitionError("project_consolidated", access.canonical_project_id);
  if (access.shared_access_suspended) throw new ServiceDefinitionError("shared_access_suspended");
  if (write && access.effective_role === "member") throw new ServiceDefinitionError("forbidden");
  if (write) {
    await db.query("SELECT debugbundle_assert_canonical_project_write($1::uuid)", [
      scope.project_id
    ]);
    access = await createMetadataAccess(db).resolveProjectAccessForUser!(scope);
    if (!access) throw new ServiceDefinitionError("project_not_found");
    if (access.shared_access_suspended) throw new ServiceDefinitionError("shared_access_suspended");
    if (access.effective_role === "member") throw new ServiceDefinitionError("forbidden");
  }
}

const projection = `SELECT d.id AS service_definition_id,d.project_id,d.origin_project_id,
 COALESCE((SELECT a.name FROM service_project_aliases a WHERE a.project_id=$1 AND a.service_definition_id=d.id AND a.is_current),d.name) AS name,
 d.input_name,d.description,d.repository_url,d.repository_root,
 CASE WHEN COALESCE(d.repository_url,CASE WHEN r.id IS NULL THEN NULL
   ELSE 'https://github.com/' || r.repo_owner || '/' || r.repo_name END) IS NULL THEN NULL
 ELSE jsonb_build_object('url',COALESCE(d.repository_url,'https://github.com/' || r.repo_owner || '/' || r.repo_name),
   'root',d.repository_root,'source',CASE WHEN d.repository_url IS NOT NULL OR d.repository_root IS NOT NULL OR d.repository_default_project_id<>d.project_id THEN 'service' ELSE 'project' END) END AS repository,
 ARRAY(SELECT DISTINCT s.environment FROM services s WHERE s.service_definition_id=d.id ORDER BY s.environment) AS environments,
 d.created_at::text,d.updated_at::text
 FROM service_definitions d LEFT JOIN project_github_repos r ON r.project_id=d.repository_default_project_id`;

async function read(db: Queryable, input: Identity): Promise<ServiceDefinition> {
  const result = await db.query<ServiceDefinition & Record<string, unknown>>(
    `${projection} WHERE d.origin_project_id=ANY(debugbundle_project_origins($1)) AND d.id=$2`,
    [input.project_id, input.service_definition_id]
  );
  const record = result.rows[0];
  if (!record) throw new ServiceDefinitionError("service_definition_not_found");
  return record;
}

async function checkName(
  db: Queryable,
  projectId: string,
  name: string,
  exceptId: string | null,
  originId: string = projectId
): Promise<void> {
  const result = await db.query<{ id: string }>(
    `SELECT id FROM service_definitions WHERE project_id=$1 AND ($3::uuid IS NULL OR id<>$3)
      AND (name=$2 OR id IN (SELECT service_definition_id FROM service_input_aliases
        WHERE origin_project_id=$4 AND input_name=$2) OR id IN (
          SELECT service_definition_id FROM service_project_aliases WHERE project_id=$1 AND name=$2))`,
    [projectId, name, exceptId, originId]
  );
  if (result.rows.length) throw new ServiceDefinitionError("service_name_conflict");
}

export function createServiceDefinitionStore(db: Queryable): ServiceDefinitionStore {
  return {
    async list(input) {
      if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 200)
        throw new ServiceDefinitionError("invalid_query");
      await authorize(db, input);
      const result = await db.query<ServiceDefinition & Record<string, unknown>>(
        `${projection} WHERE d.origin_project_id=ANY(debugbundle_project_origins($1)) AND ($2::uuid IS NULL OR d.id>$2) ORDER BY d.id LIMIT $3`,
        [input.project_id, input.cursor ?? null, input.limit + 1]
      );
      const services = result.rows.slice(0, input.limit).map(safeServiceDefinition);
      return {
        services,
        next_cursor:
          result.rows.length > input.limit ? services.at(-1)!.service_definition_id : null
      };
    },
    async get(input) {
      await authorize(db, input);
      return safeServiceDefinition(await read(db, input));
    },
    async create(input) {
      const parsed = ServiceDefinitionCreateSchema.safeParse({
        name: input.name,
        ...(input.description === undefined ? {} : { description: input.description }),
        ...(input.repository_url === undefined ? {} : { repository_url: input.repository_url }),
        ...(input.repository_root === undefined ? {} : { repository_root: input.repository_root })
      });
      if (!parsed.success) throw new ServiceDefinitionError("invalid_service_definition");
      if (!isSafeServiceMetadata(parsed.data))
        throw new ServiceDefinitionError("unsafe_service_metadata");
      return runInTransaction(db, async (tx) => {
        await authorize(tx, input, true);
        await checkName(tx, input.project_id, parsed.data.name, null);
        const id = randomUUID();
        await tx.query(
          `INSERT INTO service_definitions(id,project_id,origin_project_id,repository_default_project_id,name,input_name,description,repository_url,repository_root)
          VALUES($1,$2,$2,$2,$3,$3,$4,$5,$6)`,
          [
            id,
            input.project_id,
            parsed.data.name,
            parsed.data.description ?? null,
            parsed.data.repository_url ?? null,
            parsed.data.repository_root ?? null
          ]
        );
        return safeServiceDefinition(await read(tx, { ...input, service_definition_id: id }));
      });
    },
    async update(input) {
      const { project_id, user_id, service_definition_id, ...data } = input;
      const parsed = ServiceDefinitionUpdateSchema.safeParse(data);
      if (!parsed.success) throw new ServiceDefinitionError("invalid_service_definition");
      if (!isSafeServiceMetadata(parsed.data))
        throw new ServiceDefinitionError("unsafe_service_metadata");
      return runInTransaction(db, async (tx) => {
        await authorize(tx, { project_id, user_id }, true);
        const current = await read(tx, input);
        if (parsed.data.name !== undefined)
          await checkName(
            tx,
            project_id,
            parsed.data.name,
            service_definition_id,
            current.origin_project_id
          );
        await tx.query(
          `UPDATE service_definitions SET name=$3,description=$4,repository_url=$5,repository_root=$6,
          repository_default_project_id=CASE WHEN $7::boolean THEN $1 ELSE repository_default_project_id END,updated_at=now()
          WHERE project_id=$1 AND id=$2`,
          [
            project_id,
            service_definition_id,
            parsed.data.name ?? current.name,
            parsed.data.description === undefined ? current.description : parsed.data.description,
            parsed.data.repository_url === undefined
              ? current.repository_url
              : parsed.data.repository_url,
            parsed.data.repository_root === undefined
              ? current.repository_root
              : parsed.data.repository_root,
            parsed.data.repository_url === null
          ]
        );
        return safeServiceDefinition(await read(tx, input));
      });
    }
  };
}
