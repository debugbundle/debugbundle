# Public analytics flows release — 2026-10-05

Scope: FR-ANL-30 / AC-ANL-21, generic project-defined acquisition and activation flows, published Browser SDK helper, API/CLI/developer MCP parity, and DebugBundle's own consumer. The expanded analytics branch remains parked. The owner explicitly approved commits, pushes, tags, package publication, deployment, and return of all repositories to `main` with merged feature branches removed.

## Published artifacts

| Surface                    | Published version/source                           | Evidence                                                                                                           |
| -------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Core                       | 1.14.0, `15f80d2fceb4c4d87478f69a89aee590b1382b86` | Core release run `37290095910`; main CI `37290097080`; runtime compatibility `37290096800`, all successful         |
| Browser and Node SDKs      | 3.1.0, `1d12c7b55d3872472324ae95d351f0ea75472bdc`  | SDK release `37283973938`; 517 tests / 44 files, coverage, types, lint, builds, installed-package privacy/delivery |
| shared-types and redaction | 2.2.0                                              | Release `37286918876`; registry versions verified                                                                  |
| CLI                        | 1.13.0                                             | Release `37287813106`, runtime matrix `37287815336`                                                                |
| MCP                        | 1.13.0                                             | Release `37287816779`, Node 22/24/26 validation and native Codex checks                                            |
| OpenClaw                   | 1.13.0                                             | Ecosystem publication and exact latest version verified                                                            |
| Codex / Claude Code        | 1.1.2 / 1.13.0                                     | Public core marketplace; native installation, 127 tools, authentication, update/removal checks                     |
| Gemini CLI extension       | 1.0.1, `5c3e8964a0569fec1601bbb3a87fd8f7c14946b7`  | Standalone GitHub release; exact five-file parity and public/native Git installation verified                      |
| Site source                | 1.6.0, `9ba5d0935ed61fcc6b59718c5d61133a8fd150ba`  | Site CI `37289516303` and release `37290417641`; hosted deployment `37293228676` passed                            |

The full core source CI `37287814803` passed 3,777 tests across 81 shards, lint, types, builds and changed-source coverage for 41 files. The Gemini jobs were rerun successfully after the exact MCP dependency became public. The site dependency audit required the patched Next.js range; the final lock resolves 16.3.8 and CI passes. Local patched site builds encountered container memory exhaustion; the successful release build ran in GitHub CI. No browser/screenshots were used.

## Ecosystem verification

Official MCP Registry 1.13.0 and Smithery MCP/skill entries are published and indexed. ClawHub skill and OpenClaw 1.13.0 are published; the new ClawHub security scan is clean. Five required ClawHub searches meet their ranking target, while the broad error-reporting query is absent and incident-response ranks 17 against a top-ten target. Publication is complete; search visibility is partial. Glama verification returned 401; PulseMCP and LobeHub require manual verification. These external discovery gates are not reported as passing.

The hosted OpenAI read-only plugin remains independently versioned at 1.0.1 with its existing catalog. No OpenAI portal or directory submission occurred.

## First hosted attempt — stopped before promotion

Cloud source `7f05ad6c5a5401ee5bade01607defe701c87485c` dispatched stack run `37290780026` with the exact product/site sources above and the existing MCP Caddy gate preserved. API and worker images were built at digest `sha256:dc27366c8ff18448857111e69d9ecfed7235effa649ce3094c241a746345cc9a`.

The host passed its memory preflight (924,996 KiB available; 586,065 KiB required). The forward migration reported `applied=1; already_applied=56`. Candidate readiness failed and promotion was stopped. A bounded candidate startup diagnostic identified `parseReviewerConfig` rejecting `OPENAI_REVIEWER_ACCESS`: the existing synthetic-review credential has three days left, below the seven-day startup requirement. Existing expiry incidents predate this release. There was no kernel OOM evidence.

During that failed attempt, production remained healthy on product `370c3c68f9991b7ae4bfde79bea7f505404a264a`, active release `20260926135230-df495c7b00e1`; API `/ready` returned 200. That attempt did not upload app/site assets, including the article. The additive flow migration remains applied. The hosted monitoring runbook requires explicit owner approval for extension of reviewer access. The owner approved a 30-day extension; only the expiry repository secret changed from 2026-10-08T07:53:34.795Z to 2026-11-07T07:53:34.795Z, preserving the credential hash and existing access gates. Stack retry `37293228676` succeeded against the same immutable product/site sources. No security validation was weakened.

## Successful deployment and independent live verification

Stack run [`37293228676`](https://github.com/debugbundle/debugbundle-cloud/actions/runs/37293228676) completed successfully. Memory preflight found 920,840 KiB available against 586,065 KiB required; migration retry reported `applied=0; already_applied=57`. Release `20261005095953-52b95fd62100` was promoted at 10:02:01 UTC on API port 3000. API and worker use immutable digest `sha256:3f0d07996cc88e628f87aa882f31bae7a4597cc5e1b0f0616b6c79bf4f256025`, both report version 1.14.0, are healthy, and have zero restarts. The prior healthy `20260926135230-df495c7b00e1` is retained; exactly those two releases remain and 45 GiB is free. Asset publication, edge checks and CloudFront invalidation completed.

The flow migration ledger contains checksum `75f75659bff0498009e0d210bca5848cf753850ea314bfde247a0a431715b722`, applied at 09:38:29 UTC during the first attempt. All four flow tables are present. Running reviewer/OAuth/MCP flags remain enabled and the corrected expiry is 2026-11-07T07:53:34.795Z. The credential hash was not changed and no portal operation occurred.

Independent verification passed:

- API and MCP readiness, exact app source SHA, and compiled public-site/app flow integration bound to the own-app project. The dedicated write token is restricted to the two exact public origins.
- The [article](https://debugbundle.com/blog/user-flow-analytics-codex-ai-coding-agents/) is live with the exact canonical URL, title, all four agents, BlogPosting metadata and sitemap entry.
- `make verify-public-flows` provisioned/verified the reviewed acquisition and activation definitions. Published Browser SDK 3.1.0 passed cross-origin handoff, wrong-origin rejection, URL fragment scrubbing/query preservation, ordered sign-in completion, duplicate retry, full-UTC-day report boundary and withdrawal in disposable project `0391f480-ba53-44f8-b24d-baed0fddae98`. The fixture project, token and counters were deleted in cleanup; own-project counters were not polluted by the canary.
- Docker-installed CLI/MCP 1.13.0 returned the same authorized live flow report. Native public-agent checks are recorded above and in the distribution ledger.
- Existing `debugbundle-api-ready` check was passing at 10:04:54 UTC. The scoped incident comparison found no new incidents. After the approved expiry correction was independently verified, the eight baseline reviewer-expiry incidents were resolved; the API project's active queue is empty.

Verification used HTTP, Docker, CLI and bounded read-only host/database checks; no browser/screenshots. It proves the deployed contracts and configured consumer assets, not a human browser walkthrough or deferred large-volume capacity test. Documentation/provenance commits after these released source SHAs do not change deployed runtime bytes.

## Repository cleanup

All 17 local repositories are on `main`. Each `update/visit-flows` commit was checked as an ancestor of remote `main` before its local branch was deleted. Remote branches were removed in core, site and JavaScript SDK repositories. The other SDK repositories had no remote feature branches and no release changes. Companion cloud, Gemini, Action and organization-profile repositories were already on `main`. No `update/analytics` branch was merged or removed.
