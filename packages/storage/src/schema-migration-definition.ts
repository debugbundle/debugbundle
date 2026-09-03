import { createHash } from "node:crypto";

export interface StorageSchemaMigration {
  id: string;
  description: string;
  statements: readonly string[];
  checksum: string;
}

export function defineStorageSchemaMigration(input: {
  id: string;
  description: string;
  statements: readonly string[];
}): StorageSchemaMigration {
  return {
    ...input,
    checksum: createHash("sha256").update(JSON.stringify(input)).digest("hex")
  };
}
