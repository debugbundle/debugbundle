import type {
  AnalyticsWriterChange,
  AnalyticsWriterRecord,
  AnalyticsWriterPreview
} from "../../packages/shared-types/src/index.js";

export const WRITER_PROJECT = "11111111-1111-4111-8111-111111111111";
export const WRITER_ID = "44444444-4444-4444-8444-444444444444";
export const WRITER_SECRET = `dbundle_anl_${"A".repeat(43)}`;
export const WRITER_CHANGE: AnalyticsWriterChange = {
  action: "create",
  mutation: {
    kind: "server",
    display_name: "Billing worker",
    expires_in_days: 30,
    expected_revision: 0,
    idempotency_key: "55555555-5555-4555-8555-555555555555"
  }
};
export const WRITER_RECORD: AnalyticsWriterRecord = {
  id: WRITER_ID,
  project_id: WRITER_PROJECT,
  kind: "server",
  display_name: "Billing worker",
  created_at: "2026-09-28T00:00:00.000Z",
  expires_at: "2026-10-28T00:00:00.000Z",
  revoked_at: null
};
export const WRITER_PREVIEW: AnalyticsWriterPreview = {
  project_id: WRITER_PROJECT,
  preview_hash: "a".repeat(64),
  action: "create",
  expected_revision: 0,
  resulting_revision: 1,
  writer_id: null,
  kind: "server",
  display_name: "Billing worker",
  expires_in_days: 30,
  active_writers: 0,
  remaining_active_capacity: 9,
  already_applied: false
};
