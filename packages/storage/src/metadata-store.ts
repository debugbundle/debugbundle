import type { Queryable, PostgresMetadataStore } from "./types.js";
import type { PostgresMetadataStoreOptions } from "./metadata-shared.js";
import { createMetadataAccess } from "./metadata-access.js";
import { createMetadataInvitations } from "./metadata-invitations.js";
import { createMetadataMembership } from "./metadata-membership.js";
import { createMetadataProjectList } from "./metadata-project-list.js";
import { createMetadataUserProjects } from "./metadata-user-projects.js";
import { createMetadataOrganizationProjects } from "./metadata-organization-projects.js";
import { createMetadataTokens } from "./metadata-tokens.js";
import { createMetadataAlerts } from "./metadata-alerts.js";
import { createMetadataProbes } from "./metadata-probes.js";
import { createMetadataIncidentRead } from "./metadata-incident-read.js";
import { createMetadataIncidentLifecycle } from "./metadata-incident-lifecycle.js";
import { createMetadataBundles } from "./metadata-bundles.js";
import { createMetadataWeeklyReports } from "./metadata-weekly-reports.js";
import { createMetadataGrouping } from "./metadata-grouping.js";

export function createPostgresMetadataStore(
  db: Queryable,
  options: PostgresMetadataStoreOptions = {}
): PostgresMetadataStore {
  return {
    ...createMetadataAccess(db),
    ...createMetadataInvitations(db),
    ...createMetadataMembership(db),
    ...createMetadataProjectList(db),
    ...createMetadataUserProjects(db, options),
    ...createMetadataOrganizationProjects(db, options),
    ...createMetadataTokens(db),
    ...createMetadataAlerts(db),
    ...createMetadataProbes(db, options),
    ...createMetadataIncidentRead(db),
    ...createMetadataIncidentLifecycle(db),
    ...createMetadataBundles(db),
    ...createMetadataWeeklyReports(db),
    ...createMetadataGrouping(db)
  };
}
