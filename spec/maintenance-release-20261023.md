# Maintenance release — 23 October 2026

Core **1.19.1** and site **1.6.8** are published and deployed following the owner's explicit commit, push and production-release approval. All work stayed on `main` in DebugBundle's repositories. No consumer product was changed.

## Released behaviour

- The exact immediate-peer proxy callback rejects absent/non-string socket addresses without throwing or trusting forwarded input. Existing configured-peer/hop restrictions remain.
- The billing paid-unlock notice appears only after a valid trial start and disappears at eligibility, including timer/focus refresh. FR-BIL-10 and AC-BILL-09 retain the server-authoritative purchase policy.
- One reusable site CTA follows every blog article: centred content, docs first, primary homepage action second/right, contrasting theme foreground and no repeated brand eyebrow. Both actions remain native links.
- The independent site dependency graph pins Next.js 16.4.1 to fix the advisories found by site CI. Production serves a static export; this receipt makes no claim of exploitation of the affected server features.
- OpenAI 1.0.2 candidate source and deterministic OAuth/CIMD portal packaging are included. The frozen 1.0.0 wire contract still has 23 read-only tools. This release does not submit or publish the portal draft.

## Source and publication

| Artifact    | Qualified source                           | Result                                                                                         |
| ----------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Core 1.19.1 | `86c134f1885e8baade8b9ac5c0f1479f13f1304a` | [Published v1.19.1](https://github.com/debugbundle/debugbundle/releases/tag/v1.19.1), deployed |
| Site 1.6.8  | `2cc93191da67c0f52f0d28e7972b6ab2a4e896ee` | [Published v1.6.8](https://github.com/debugbundle/site/releases/tag/v1.6.8), deployed          |

Core implementation commit `64e44f3b0b2b4cca366d4be36daffbcd90e58e2c` precedes the manifest-only provenance commit above. Later documentation/provenance commits do not change the deployed source or version tags. Independently versioned CLI/MCP/SDK distributions are not republished by this core/site release.

The API and worker both run immutable digest `sha256:977b9a0d804318662d808cf68c5c39946794b2e14723136c0676c6b3aeaa9309`, independently matched to the exact source labels and version 1.19.1. Both were healthy with zero restarts; worker processing was enabled with `postgres-v1`. The migration gate reported `applied=0; already_applied=63`. No schema change is introduced here.

Repo-owned retention validation preserves exactly the active runtime and one verified previous stable runtime, including both previous API/worker images at digest `sha256:3801ac0694a04c0510faf158c25ee83185aa36ad20465149ed59f493f11ef83b`. Its post-release dry-run found zero additional release/image candidates.

## Engineering and live evidence

- All 100 local coverage shards pass: 564 files and 4,650 tests. The existing changed-source coverage gate passes both runtime files; proxy handling has 100% coverage across metrics and billing meets the existing changed-line rule.
- Full repository lint/typecheck, focused committed-source checks and dashboard build pass. [Exact-source core CI](https://github.com/debugbundle/debugbundle/actions/runs/40016857367) and CLI runtime compatibility pass, including the native runtime matrix.
- All 41 site tests, static build and typecheck pass after the final UI and Next.js patch. Site audit reports no known vulnerabilities. Core audit retains six low and 31 moderate findings below the high-severity gate; existing bundle-size/React test warnings remain.
- Independent public HTTP checks at 20:39 UTC verify API/MCP readiness, OAuth discovery, protected billing rejection, exact SPA build/served JavaScript, cache policy, homepage/docs/404 behaviour and core 1.19.1 generated references.
- All 28 live posts contain exactly one correctly linked shared CTA with centred markup, the required action order, no eyebrow and the important themed primary foreground in served CSS. No browser visual or conversion-uplift claim is made.
- Authenticated hosted MCP service, usage, action and funnel reads all succeed within the connected production project after promotion. Empty aggregate analytics responses are explicit successful responses.

## Incident closure and reviewer renewal

The CLI was updated to verified latest 1.17.0 before noise handling; `validate --fix` and scaffold validation pass without warnings. Three existing narrow demotion rules remain. Broader suggestions were not applied because they would suppress genuine future failures sharing dynamic status fields.

The owner explicitly chose to retain the login already saved in the OpenAI draft and extend expiry to **23 November 2026**, at `2026-11-23T07:53:34.795Z`. Only expiry was changed; the credential/hash and other public runtime settings were preserved. Persisted configuration and an outside-network POST-body login/synthetic-boundary smoke at 20:38 UTC pass. Callback state and issuer match; the callback was not followed and no token exchange was performed. No credential, hash or authorization code is retained in evidence.

After runtime and renewal proof, the socket-peer crash and reviewer-expiry incidents were resolved at **20:42:30 UTC**. A separate active query for the connected DebugBundle API project returned `incidents: []` with no next cursor; both exact records read back as resolved. The saved readiness monitor passes HTTP 200 with zero consecutive failures. Four earlier historical OpenAI failures had already been resolved on observed recovery; their original privacy-limited causes remain qualified.

## Remaining boundaries

OpenAI portal publication still requires the accessible walkthrough, full reviewer-case execution, imported annotation review, override-disabled reload and owner submission approval. Renewal/login proof is a separate evidence layer. This release did not trigger production payments, customer emails or consumer adoption, and does not prove future incident absence. Existing historic billing-data/provider matters remain outside this maintenance slice. Private receipts and operator details remain in ignored local notes and the private cloud runbooks.
