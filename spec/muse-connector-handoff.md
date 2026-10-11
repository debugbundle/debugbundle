# Muse connector deferred handoff

Date: 2026-10-11

State: deferred by the owner; full implementation phase remains open

Saved branch: `feature/muse-connector` in `debugbundle/debugbundle`

The owner requested that the locally qualified candidate be committed/pushed and
the original core, cloud and site checkouts return to `main`. Only core has changes;
cloud/site and SDKs remain unchanged. Preserve the isolated feature workspace and
local planning/evidence files. No merge, deployment or marketplace action follows
this handoff.

## Exact blocker

The signed-in consumer Muse session reaches a country/region waitlist instead of
the application, so that account cannot test a custom connector. Account creation
and publisher intake access succeeded. The publisher form did not establish the
exact OAuth client identity, callback, token-authentication method, resource and
discovery contracts, or an available private-testing path.

Publisher business/country eligibility remains unconfirmed. No publisher-country
rejection or general EU submission ban was established. Creating a Muse Code
account does not close these consumer Muse connector gates; existing Muse Code
project setup is a separate integration. No VPN bypass was used or qualified.

## Saved implementation and local qualification

The owner-approved vendor-independent subsets of Slices 2–3 implement shared
profile-bound token verification, read scopes and bounded admission behind
compatible OpenAI exports. An actual archived-source/candidate credential harness
checks old/new encrypted state, HTTP code/refresh exchanges, shared Redis replay
and concurrency, rollback reads, and candidate reuse rejection/grant revocation.
See [the preservation contract and threat model](hosted-client-foundations.md),
FR-MCP-18 and AC-MCP-20.

- Full Docker suite: 4,216 tests, 512 files, 94 shards.
- Final auth/MCP coverage run: 148 tests, 16 files, including three additional
  tests after the full suite; production code was unchanged afterwards.
- All eight changed-source coverage gates pass; critical auth exceeds 90% on
  every metric. Lint, typecheck, build and the real synthetic credential corpus
  pass, including rejection of non-test targets before database access.
- Fifteen frozen source hashes are unchanged; three intentional auth changes
  preserve formats and correct an existing refresh-rotation defect.

The candidate explicitly rotates refresh tokens on every use. The archived source
passes credential-format compatibility but has a rotation-policy defect; it is
not a security-qualified actual hosted rollback baseline. Qualify a corrected
rollback release before any future activation.

SDK behavior, ingestion, schema, lockfile, OpenAI issuer/client/resource/discovery,
catalog, connection interfaces and production remain unchanged. No complete slice
or full phase is marked done. Muse namespaced storage/migrations, production OAuth,
transport/catalog, consent/connections, shared capacity/operations, deployed
reviewer access and integrated/live qualification remain unimplemented. Reviewer
and vendor-request drafts are preparation only; they remain unsent.

## Resume conditions and sequence

1. Obtain official exact Muse authentication/resource/discovery contracts and an
   authorized consumer tester or vendor private-testing route. Recheck current
   terms and intended publisher eligibility; account creation alone is insufficient.
2. Reopen `feature/muse-connector` and the preserved local proposal at
   `spec/local/proposals/muse-connector-implementation-plan-2026-09-26.md`.
   The proposal owns all 13 ordered slices. Original workspace-relative location:
   `.local-repos/muse-connector-workspace/core`.
3. Revalidate the current OpenAI/runtime baseline, close the remaining Slices 1–3
   gates, then implement Slices 4–13. Obtain applicable future release, legal,
   submission and publication authorizations. Keep OpenAI’s portal escalation
   separate.

Local account-specific evidence and planning files remain excluded from Git by
the existing repository rules. The isolated workspace retains the qualification
receipts, source hashes, vendor observations and drafts; this tracked handoff
preserves the safe restart state with the source candidate. Source/test evidence,
deployment, real-client acceptance, submission, approval, publication, directory
discovery and launch must continue to be recorded separately.
