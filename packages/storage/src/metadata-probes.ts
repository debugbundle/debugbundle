import { createMetadataProbeReads } from "./metadata-probe-read.js";
import { createMetadataProbeWrites } from "./metadata-probe-write.js";
import type { ProbeManagementStore, Queryable } from "./types.js";
import type { PostgresMetadataStoreOptions } from "./metadata-shared.js";

/** Stable public facade; SDK projection and fenced management have distinct scopes. */
export function createMetadataProbes(
  db: Queryable,
  options: PostgresMetadataStoreOptions = {}
): ProbeManagementStore {
  return { ...createMetadataProbeReads(db), ...createMetadataProbeWrites(db, options) };
}
