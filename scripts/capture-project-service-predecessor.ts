import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { StorageSchemaMigration } from "../packages/storage/src/schema-migration-definition.js";

const source = process.argv[2];
const revision = process.argv[3];
if (
  !source?.startsWith(".tmp/project-service-predecessor.") ||
  !/^[a-f0-9]{40}$/.test(revision ?? "")
) {
  throw new Error("invalid_predecessor_source");
}
const bootstrap = (await import(
  pathToFileURL(resolve(source, "packages/storage/src/storage-bootstrap-all-statements.ts")).href
)) as {
  STORAGE_BOOTSTRAP_STATEMENTS: readonly string[];
};
const migrations = (await import(
  pathToFileURL(resolve(source, "packages/storage/src/schema-migrations.ts")).href
)) as {
  STORAGE_SCHEMA_MIGRATIONS: readonly StorageSchemaMigration[];
};
await writeFile(
  "tests/fixtures/project-service-predecessor.json",
  JSON.stringify(
    {
      source_revision: revision,
      bootstrap: bootstrap.STORAGE_BOOTSTRAP_STATEMENTS,
      migrations: migrations.STORAGE_SCHEMA_MIGRATIONS.map(({ id, description, checksum }) => ({
        id,
        description,
        checksum
      }))
    },
    null,
    2
  ) + "\n"
);
