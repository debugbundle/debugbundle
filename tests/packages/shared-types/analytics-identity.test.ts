import { expect, it } from "vitest";
import {
  AnalyticsIdentityContextSchema,
  AnalyticsIdentityContextCreateSchema,
  AnalyticsIdentityAssociationSchema,
  AnalyticsIdentityRevokeSchema,
  AnalyticsIdentityRevocationSchema,
  AnalyticsRelayIdentityContextReferenceSchema,
  AnalyticsHandoffCreateSchema,
  AnalyticsHandoffExchangeSchema,
  AnalyticsHandoffReceiptSchema,
  AnalyticsSpaceIdentityNamespaceChangeSchema,
  AnalyticsSpaceIdentityNamespacePreviewSchema,
  AnalyticsSpaceIdentityNamespaceRecordSchema
} from "../../../packages/shared-types/src/index.js";
const source = "11111111-1111-4111-8111-111111111111";
const destination = "22222222-2222-4222-8222-222222222222";
const space = "33333333-3333-4333-8333-333333333333";
const hash = `sha256:${"a".repeat(64)}`;
const context = {
  protocol: "2026-09-analytics-identity-01",
  context_id: source,
  project_id: source,
  scope: { kind: "space", space_id: space },
  scope_revision: 1,
  namespace_revision: 2,
  producer_epoch: destination,
  anonymous_id_hash: hash,
  user_id_hash: hash,
  account_id_hash: null,
  privacy_mode: "custom",
  consent_granted: true,
  issued_at: "2026-09-28T12:00:00.000Z",
  expires_at: "2026-09-28T12:05:00.000Z"
};
const association = {
  context_id: source,
  producer_epoch: destination,
  binding_hash: hash,
  namespace_revision: 2,
  anonymous_id_hash: hash,
  user_id_hash: hash,
  account_id_hash: null,
  consent_granted: true,
  idempotency_key: space
};
const create = {
  context_id: source,
  producer_epoch: destination,
  binding_hash: hash,
  destination_project_id: destination,
  destination_origin: "https://app.example.test",
  destination_path: "/onboarding",
  idempotency_key: space
};
it("keeps connected-space namespace management closed and key-free", () => {
  const change = {
    action: "configure",
    expected_revision: 0,
    idempotency_key: source,
    key_fingerprint: hash
  };
  expect(AnalyticsSpaceIdentityNamespaceChangeSchema.parse(change)).toEqual(change);
  expect(
    AnalyticsSpaceIdentityNamespaceChangeSchema.safeParse({ ...change, key: "secret" }).success
  ).toBe(false);
  expect(
    AnalyticsSpaceIdentityNamespaceChangeSchema.safeParse({ ...change, key_fingerprint: "raw" })
      .success
  ).toBe(false);
  const record = {
    space_id: space,
    namespace_revision: 1,
    source_project_ids: [source, destination],
    key_fingerprint: hash,
    activated_at: "2026-09-28T12:00:00.000Z",
    revoked_at: null
  };
  expect(AnalyticsSpaceIdentityNamespaceRecordSchema.parse(record)).toEqual(record);
  expect(
    AnalyticsSpaceIdentityNamespaceRecordSchema.safeParse({
      ...record,
      source_project_ids: [source, source]
    }).success
  ).toBe(false);
  const preview = {
    space_id: space,
    space_revision: 1,
    source_project_ids: [source, destination],
    action: "configure",
    expected_revision: 0,
    resulting_revision: 1,
    current_key_fingerprint: null,
    proposed_key_fingerprint: hash,
    contexts_fenced: false,
    preview_hash: "a".repeat(64)
  };
  expect(AnalyticsSpaceIdentityNamespacePreviewSchema.parse(preview)).toEqual(preview);
  expect(
    AnalyticsSpaceIdentityNamespacePreviewSchema.safeParse({
      ...preview,
      source_project_ids: [destination, destination]
    }).success
  ).toBe(false);
});
it("closes client identity context fields and enforces consent, privacy, namespace and lifetime", () => {
  expect(AnalyticsIdentityContextSchema.parse(context)).toEqual(context);
  for (const changes of [
    { privacy_mode: "strict" },
    { privacy_mode: "standard" },
    { consent_granted: false },
    { namespace_revision: 0 },
    { expires_at: "2026-09-28T12:05:00.001Z" },
    { expires_at: context.issued_at },
    { scope: { kind: "project", project_id: destination } },
    { anonymous_id_hash: null, user_id_hash: null, account_id_hash: null },
    { raw_user_id: "user-123" }
  ])
    expect(AnalyticsIdentityContextSchema.safeParse({ ...context, ...changes }).success).toBe(
      false
    );
  expect(
    AnalyticsIdentityContextSchema.safeParse({
      ...context,
      privacy_mode: "standard",
      user_id_hash: null
    }).success
  ).toBe(true);
});
it("requires a server-verified anonymous-to-known association, never raw IDs or known-to-known merges", () => {
  const createContext = {
    producer_epoch: destination,
    binding_hash: hash,
    namespace_revision: 2,
    anonymous_id_hash: hash,
    consent_granted: true,
    idempotency_key: space
  };
  expect(AnalyticsIdentityContextCreateSchema.parse(createContext)).toEqual(createContext);
  expect(
    AnalyticsIdentityContextCreateSchema.safeParse({ ...createContext, user_id_hash: hash }).success
  ).toBe(false);
  expect(AnalyticsIdentityAssociationSchema.parse(association)).toEqual(association);
  for (const changes of [
    { user_id_hash: null },
    { anonymous_id_hash: null },
    { consent_granted: false },
    { binding_hash: "raw-session" },
    { previous_user_id_hash: hash },
    { namespace_revision: 0 }
  ])
    expect(
      AnalyticsIdentityAssociationSchema.safeParse({ ...association, ...changes }).success
    ).toBe(false);
});

it("binds a relay delivery to one closed first-party context reference", () => {
  const reference = {
    context_id: source,
    producer_epoch: destination,
    binding_hash: hash
  };
  expect(AnalyticsRelayIdentityContextReferenceSchema.parse(reference)).toEqual(reference);
  for (const change of [
    { context_id: "not-a-uuid" },
    { producer_epoch: "not-a-uuid" },
    { binding_hash: "raw-session-cookie" },
    { user_id_hash: hash },
    { authenticated: true }
  ])
    expect(
      AnalyticsRelayIdentityContextReferenceSchema.safeParse({ ...reference, ...change }).success
    ).toBe(false);
});
it("bounds handoff routing and forbids arbitrary redirects, query data and caller identities", () => {
  expect(AnalyticsHandoffCreateSchema.parse(create)).toEqual(create);
  for (const changes of [
    { destination_origin: "http://app.example.test" },
    { destination_origin: "https://user:pass@app.example.test" },
    { destination_origin: "https://app.example.test/path" },
    { destination_origin: "https://app.example.test?x=1" },
    { destination_path: "//evil.test" },
    { destination_path: "/path?user_id=x" },
    { destination_path: "/path#token" },
    { destination_path: "/a/../private" },
    { destination_path: "/a/%2e%2e/private" },
    { destination_path: "/path\\next" },
    { user_id_hash: hash }
  ])
    expect(AnalyticsHandoffCreateSchema.safeParse({ ...create, ...changes }).success).toBe(false);
});
it("uses one-time high-entropy handoff codes and binds exchange to the destination instance", () => {
  const code = `dbundle_ah_${"a".repeat(43)}`;
  const receipt = {
    disposition: "issued",
    protocol: "2026-09-analytics-handoff-01",
    code,
    expires_at: "2026-09-28T12:01:00.000Z",
    issued_at: context.issued_at,
    destination_project_id: destination,
    destination_origin: create.destination_origin,
    destination_path: create.destination_path
  };
  expect(AnalyticsHandoffReceiptSchema.parse(receipt)).toEqual(receipt);
  expect(
    AnalyticsHandoffReceiptSchema.safeParse({ ...receipt, expires_at: "2026-09-28T12:01:00.001Z" })
      .success
  ).toBe(false);
  expect(AnalyticsHandoffReceiptSchema.safeParse({ ...receipt, code: "short" }).success).toBe(
    false
  );
  const exchange = {
    code,
    destination_origin: create.destination_origin,
    producer_epoch: destination,
    binding_hash: hash,
    consent_granted: true
  };
  expect(AnalyticsHandoffExchangeSchema.parse(exchange)).toEqual(exchange);
  expect(
    AnalyticsHandoffExchangeSchema.safeParse({ ...exchange, source_user_id: hash }).success
  ).toBe(false);
  expect(
    AnalyticsHandoffExchangeSchema.safeParse({ ...exchange, consent_granted: false }).success
  ).toBe(false);
});

it("never exposes a handoff secret on an idempotent issuance replay", () => {
  const replay = {
    protocol: "2026-09-analytics-handoff-01",
    disposition: "secret_unavailable",
    issued_at: context.issued_at,
    expires_at: "2026-09-28T12:01:00.000Z",
    destination_project_id: destination,
    destination_origin: create.destination_origin,
    destination_path: create.destination_path
  };
  expect(AnalyticsHandoffReceiptSchema.parse(replay)).toEqual(replay);
  expect(
    AnalyticsHandoffReceiptSchema.safeParse({ ...replay, code: `dbundle_ah_${"a".repeat(43)}` })
      .success
  ).toBe(false);
  expect(
    AnalyticsHandoffReceiptSchema.safeParse({ ...replay, expires_at: context.issued_at }).success
  ).toBe(false);
});

it("binds identity revocation and its acknowledgement to the precise producer generation", () => {
  const request = {
    context_id: source,
    producer_epoch: destination,
    binding_hash: hash,
    idempotency_key: space
  };
  const response = {
    protocol: "2026-09-analytics-identity-01",
    context_id: source,
    producer_epoch: destination,
    revoked_at: context.issued_at,
    replayed: false
  };
  expect(AnalyticsIdentityRevokeSchema.parse(request)).toEqual(request);
  expect(AnalyticsIdentityRevocationSchema.parse(response)).toEqual(response);
  expect(AnalyticsIdentityRevokeSchema.safeParse({ ...request, all_users: true }).success).toBe(
    false
  );
  expect(
    AnalyticsIdentityRevokeSchema.safeParse({ ...request, producer_epoch: null }).success
  ).toBe(false);
  expect(
    AnalyticsIdentityRevocationSchema.safeParse({ ...response, binding_hash: hash }).success
  ).toBe(false);
});
