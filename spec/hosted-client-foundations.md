# Hosted client compatibility foundations

Status: locally qualified foundations; Muse phase deferred by the owner
Date: 2026-10-11

The owner approved vendor-independent compatibility work while the signed-in
Muse consumer account is region-gated. This is an optional connector extension
on the existing runtime. SDK capture, ingestion, billing, bundle generation,
ordinary member/project auth and existing OpenAI connections retain their contracts.

The saved candidate remains on `feature/muse-connector`; no production change
followed local qualification. See the [deferred-phase handoff](muse-connector-handoff.md)
for completed evidence, the exact blocker and restart conditions.

## Preservation contract

OpenAI retains its exact issuer `https://api.debugbundle.com`, audience
`https://mcp.debugbundle.com`, client `https://chatgpt.com/oauth/client.json`,
callback, discovery documents, RSA signing keys, token lifetimes, scopes and
23-tool catalog. Its `private_key_jwt` policy and separate portal escalation are
unchanged. Legacy factory exports, grant callback shape, errors and AuthInfo
shape remain compatible. No existing credential is reissued or rewritten.

Shared access-token verification accepts an explicitly constructed server-owned
profile. The profile fixes issuer, full resource URI (including path), exact
client, product scopes, lifetime and bounded failure identifier. It is never
selected by request data. Signature, minimal identity, temporal claims and an
active backing grant are checked before returning a principal. Grant checking
receives the exact profile identity, so a same-host resource with a different
path cannot reuse another profile's grants. Storage failures fail closed with
the configured fixed error; token or dependency detail is never returned.

The shared profile is a verification contract, not an OAuth registration policy.
It does not authorize a client, install routes, discover unknown clients, change
token-endpoint methods, or activate Muse. No Muse callback/client/issuer/resource
is supplied by production defaults. Synthetic `.example.test` values in tests
are protocol fixtures, not vendor proof.

The bounded local admission gate is shared mechanics: at most 32 waiters, eight
per grant and one-second waiting, cancellable and idempotently released. Existing
OpenAI exports remain wrappers. This does not create another runtime gate or
Redis budget. Before another provider is wired, both must consume the same gate
and legacy shared Redis aggregate lease key during mixed-version rollout.

## Threat model and remaining dependencies

Reject cross-client, cross-issuer and cross-resource tokens in both directions,
including resources on the same origin. Reject malformed/expired signatures,
identity-bearing email claims, duplicate/unsupported scopes, inactive grants,
wrong token type and incorrect lifetime. Freeze profile inputs at construction
so later configuration mutation cannot broaden accepted credentials.

Namespaced Muse persistence must use an additive forward migration with separate
lookup hashes/encrypted records. Keep legacy OpenAI hashes, envelope, tables and
cleanup semantics intact. Never add Muse grants to legacy connection inventory.
Migration, old/new concurrent execution and actual rollback need separate proof;
unit token fixtures do not establish code exchange or refresh compatibility.

Muse OAuth/provider/routes/consent/storage and external release gates remain
dependent on verified client identity, redirect and authentication/discovery
behavior. A generic PKCE checkbox supplies none of those values. Obtain an
eligible authorized tester or a documented vendor private-testing route; do not
bypass account/region restrictions. No public availability claim is authorized
by a passing local test.

## Qualification

See FR-MCP-18 and AC-MCP-20. Run Docker-backed contract/security regressions,
typecheck/lint and a separate old-source credential corpus. Compare the frozen
OpenAI catalog and metadata, keys/encryption/lookup behavior and installed SDK
contracts. Report local source, old-binary, migrations, load, deployment, real
Muse, submission, approval, public discovery and announcement separately.

## Credential corpus and discovered rotation defect

Run `make test-hosted-oauth-compatibility PREVIOUS_API_REVISION=<baseline SHA>`
with Docker and a verified source commit. The runner archives that exact source,
installs its frozen dependencies, bootstraps only a disposable empty database,
then applies candidate forward migrations. Both source runtimes issue real
provider credentials. Each exercises the other's encrypted grant/session/code/
refresh records, access tokens, HTTP S256 code exchange, private-key client
assertions, refresh exchange, shared assertion replay and concurrency leases.
The old runtime also reads and refreshes candidate-issued credentials. Synthetic
signing keys and credentials remain in owner-only temporary files deleted on exit.

The baseline provider lacks explicit `rotateRefreshToken: true`. Its maintained
library defaults rotate confidential-client refresh tokens only after 70 percent
of TTL, contrary to FR-MCP-05 / SEC-30. A red configuration regression and actual
HTTP replay exposed the defect. The candidate explicitly enables every-use
rotation, preserving old credential formats. The harness distinguishes legacy
non-rotation from candidate rotation and proves candidate reuse rejection and
backing-grant revocation. Do not change tests to treat the old behavior as
security-compliant.

Passing source coexistence/rollback reads does not qualify the archived runtime's
security policy or a hosted rollback. The actual release rollback target needs
this correction or independent equivalent evidence before activation. No hosted
runtime or old refresh token is changed by running the local harness. The root
release version and OpenAI immutable release manifest must be reconciled after
implementation commits and before any authorized deployment.
