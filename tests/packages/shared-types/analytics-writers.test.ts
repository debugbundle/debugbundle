import { expect, it } from "vitest";
import {
  AnalyticsWriterChangeSchema,
  AnalyticsWriterPreviewSchema,
  AnalyticsWriterRecordSchema,
  AnalyticsWriterApplyResultSchema,
  AnalyticsWriterListSchema
} from "../../../packages/shared-types/src/index.js";

const id = "11111111-1111-4111-8111-111111111111";
const create = {
  action: "create",
  mutation: {
    kind: "server",
    display_name: "Billing outbox",
    expires_in_days: 90,
    expected_revision: 0,
    idempotency_key: id
  }
};
const record = {
  id,
  project_id: id,
  kind: "server",
  display_name: "Billing outbox",
  created_at: "2026-09-28T12:00:00.000Z",
  expires_at: "2026-12-27T12:00:00.000Z",
  revoked_at: null
};

it("requires revision-aware closed writer creation and revocation changes", () => {
  expect(AnalyticsWriterChangeSchema.parse(create)).toEqual(create);
  const revoke = {
    action: "revoke",
    mutation: { writer_id: id, expected_revision: 1, idempotency_key: id }
  };
  expect(AnalyticsWriterChangeSchema.parse(revoke)).toEqual(revoke);
  for (const value of [
    { ...create, mutation: { ...create.mutation, kind: "admin" } },
    { ...revoke, mutation: { ...revoke.mutation, expected_revision: 0 } },
    { ...create, mutation: { ...create.mutation, expires_in_days: 366 } },
    { ...create, secret: "forbidden" }
  ])
    expect(AnalyticsWriterChangeSchema.safeParse(value).success).toBe(false);
});

it("previews the reviewed role, label, lifetime and active capacity without a secret", () => {
  const preview = {
    project_id: id,
    preview_hash: "a".repeat(64),
    action: "create",
    expected_revision: 0,
    resulting_revision: 1,
    writer_id: null,
    kind: "server",
    display_name: "Billing outbox",
    expires_in_days: 90,
    active_writers: 0,
    remaining_active_capacity: 9,
    already_applied: false
  };
  expect(AnalyticsWriterPreviewSchema.parse(preview)).toEqual(preview);
  for (const bad of [
    { ...preview, plaintext: "must-not-exist" },
    { ...preview, kind: "admin" },
    { ...preview, remaining_active_capacity: -1 },
    { ...preview, action: "revoke" }
  ])
    expect(AnalyticsWriterPreviewSchema.safeParse(bad).success).toBe(false);
});

it("never returns a recoverable credential on idempotency replay or revocation", () => {
  const issued = {
    disposition: "issued",
    revision: 1,
    replayed: false,
    writer: record,
    plaintext: `dbundle_anl_${"a".repeat(43)}`
  };
  expect(AnalyticsWriterApplyResultSchema.parse(issued)).toEqual(issued);
  const replay = { disposition: "secret_unavailable", revision: 1, replayed: true, writer: record };
  expect(AnalyticsWriterApplyResultSchema.parse(replay)).toEqual(replay);
  expect(
    AnalyticsWriterApplyResultSchema.safeParse({ ...replay, plaintext: issued.plaintext }).success
  ).toBe(false);
  expect(
    AnalyticsWriterApplyResultSchema.safeParse({
      ...issued,
      plaintext: `dbundle_anr_${"a".repeat(43)}`
    }).success
  ).toBe(false);
  const revoked = {
    disposition: "revoked",
    revision: 2,
    replayed: false,
    writer: { ...record, revoked_at: "2026-09-29T12:00:00.000Z" }
  };
  expect(AnalyticsWriterApplyResultSchema.parse(revoked)).toEqual(revoked);
  expect(AnalyticsWriterApplyResultSchema.safeParse({ ...revoked, writer: record }).success).toBe(
    false
  );
});

it("bounds active listings and excludes token hashes or secret material from metadata", () => {
  expect(AnalyticsWriterRecordSchema.parse(record)).toEqual(record);
  expect(
    AnalyticsWriterRecordSchema.safeParse({ ...record, token_hash: "a".repeat(64) }).success
  ).toBe(false);
  expect(
    AnalyticsWriterRecordSchema.safeParse({ ...record, expires_at: record.created_at }).success
  ).toBe(false);
  expect(
    AnalyticsWriterListSchema.parse({ project_id: id, revision: 0, writers: [] }).writers
  ).toEqual([]);
  expect(
    AnalyticsWriterListSchema.parse({ project_id: id, revision: 1, writers: [record] }).writers
  ).toEqual([record]);
  for (const writers of [
    [record, record],
    [{ ...record, project_id: "22222222-2222-4222-8222-222222222222" }],
    [{ ...record, revoked_at: "2026-09-29T12:00:00.000Z" }]
  ]) {
    expect(
      AnalyticsWriterListSchema.safeParse({ project_id: id, revision: 1, writers }).success
    ).toBe(false);
  }
  expect(
    AnalyticsWriterListSchema.safeParse({
      project_id: id,
      revision: 1,
      writers: Array.from({ length: 11 }, () => record)
    }).success
  ).toBe(false);
});
