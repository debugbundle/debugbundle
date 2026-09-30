import type {
  AnalyticsSpaceChange,
  AnalyticsSpaceRecord,
  AnalyticsSpacePreview
} from "../../packages/shared-types/src/index.js";
export const SPACE_ID = "11111111-1111-4111-8111-111111111111";
export const SPACE_ORGANIZATION = "33333333-3333-4333-8333-333333333333";
export const SPACE_CHANGE: AnalyticsSpaceChange = {
  action: "save",
  mutation: {
    organization_id: SPACE_ORGANIZATION,
    display_name: "Product",
    mode: "portfolio",
    expected_revision: 0,
    idempotency_key: SPACE_ID,
    project_ids: [SPACE_ID]
  }
};
export const SPACE_RECORD: AnalyticsSpaceRecord = {
  id: SPACE_ID,
  organization_id: SPACE_ORGANIZATION,
  display_name: "Product",
  mode: "portfolio",
  revision: 1,
  project_ids: [SPACE_ID],
  created_at: "2026-09-28T00:00:00.000Z",
  archived: false
};
export const SPACE_PREVIEW: AnalyticsSpacePreview = {
  action: "save",
  space_id: null,
  preview_hash: "a".repeat(64),
  expected_revision: 0,
  resulting_revision: 1,
  added_project_ids: [SPACE_ID],
  removed_project_ids: [],
  mode_changed: false,
  display_name: "Product",
  mode: "portfolio",
  already_applied: false
};
