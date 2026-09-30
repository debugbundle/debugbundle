import { expect, it } from "vitest";
import {
  AnalyticsSpaceApplySchema,
  AnalyticsSpaceChangeSchema,
  AnalyticsSpacePreviewSchema,
  AnalyticsSpaceRecordSchema
} from "../../../packages/shared-types/src/index.js";

const id = "11111111-1111-4111-8111-111111111111";
const save = {
  action: "save",
  mutation: {
    organization_id: id,
    display_name: "Product",
    expected_revision: 0,
    idempotency_key: id,
    project_ids: [id],
    mode: "portfolio"
  }
};
it("requires exact reviewed content for space application and closed archive requests", () => {
  expect(AnalyticsSpaceChangeSchema.parse(save)).toEqual(save);
  const archive = {
    action: "archive",
    mutation: { organization_id: id, expected_revision: 1, idempotency_key: id }
  };
  expect(AnalyticsSpaceChangeSchema.parse(archive)).toEqual(archive);
  expect(
    AnalyticsSpaceChangeSchema.safeParse({
      ...archive,
      mutation: { ...archive.mutation, project_ids: [id] }
    }).success
  ).toBe(false);
  expect(AnalyticsSpaceApplySchema.safeParse({ change: save }).success).toBe(false);
  expect(
    AnalyticsSpaceApplySchema.parse({ change: save, preview_hash: "a".repeat(64) }).change
  ).toEqual(save);
  expect(AnalyticsSpaceApplySchema.safeParse({ change: save, preview_hash: "bad" }).success).toBe(
    false
  );
});
it("keeps active space membership nonempty and previews bounded with no source payloads", () => {
  const record = {
    id,
    organization_id: id,
    display_name: "Product",
    mode: "portfolio",
    revision: 1,
    project_ids: [id],
    created_at: "2026-09-28T00:00:00.000Z",
    archived: false
  };
  expect(AnalyticsSpaceRecordSchema.parse(record)).toEqual(record);
  expect(AnalyticsSpaceRecordSchema.safeParse({ ...record, project_ids: [] }).success).toBe(false);
  expect(
    AnalyticsSpaceRecordSchema.safeParse({ ...record, project_ids: [], archived: true }).success
  ).toBe(true);
  const preview = {
    preview_hash: "a".repeat(64),
    action: "save",
    space_id: null,
    expected_revision: 0,
    resulting_revision: 1,
    added_project_ids: [id],
    removed_project_ids: [],
    mode_changed: false,
    display_name: "Product",
    mode: "portfolio",
    already_applied: false
  };
  expect(AnalyticsSpacePreviewSchema.parse(preview)).toEqual(preview);
  expect(AnalyticsSpacePreviewSchema.safeParse({ ...preview, events: [] }).success).toBe(false);
  expect(
    AnalyticsSpacePreviewSchema.safeParse({ ...preview, added_project_ids: Array(21).fill(id) })
      .success
  ).toBe(false);
});
it("normalizes UUID spellings before membership uniqueness and idempotency hashing", () => {
  const lower = "abcdefab-abcd-4abc-8abc-abcdefabcdef";
  const upper = lower.toUpperCase();
  const request = {
    ...save,
    mutation: {
      ...save.mutation,
      organization_id: upper,
      idempotency_key: upper,
      project_ids: [upper]
    }
  };
  const parsed = AnalyticsSpaceChangeSchema.parse(request);
  expect(parsed.mutation.organization_id).toBe(lower);
  expect(parsed.mutation.idempotency_key).toBe(lower);
  if (parsed.action !== "save") throw new Error("fixture invalid");
  expect(parsed.mutation.project_ids).toEqual([lower]);
  expect(
    AnalyticsSpaceChangeSchema.safeParse({
      ...request,
      mutation: { ...request.mutation, project_ids: [lower, upper] }
    }).success
  ).toBe(false);
});
