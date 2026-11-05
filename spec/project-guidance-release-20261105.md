# Project/service installation guidance release — 5 November 2026

The owner authorised commit/push, the affected DebugBundle release train and
production publication. FR-PJS-01 / AC-PJS-03: prefer one project per system
across service repositories, preserve existing connections and policy boundaries,
and explain name-based connect without implicit consolidation.

## Release inventory

| Surface                          | Patch  | State                                                             |
| -------------------------------- | ------ | ----------------------------------------------------------------- |
| CLI / MCP                        | 1.19.4 | Candidate; includes cloud and retained-local path fixes           |
| OpenClaw plugin / portable skill | 1.19.4 | Candidate; fresh exact-version gates required                     |
| Codex developer plugin           | 1.5.1  | Candidate, pins published MCP 1.19.4                              |
| Claude Code developer plugin     | 1.19.4 | Candidate, pins published MCP 1.19.4                              |
| Gemini CLI extension             | 1.4.4  | Candidate; prior 1.4.3 publication remains immutable              |
| Public site/docs                 | 1.7.2  | Candidate; local tests/types/build pass                           |
| OpenAI combined plugin           | 1.0.3  | Independent sealed local package; portal process remains separate |

Core API/worker 1.21.0, SDK runtime releases, migrations, credentials and the
completed owner-project merge retain their verified deployed identities. Site
publication uses the dedicated hosted-site workflow. No consumer change is part
of this release. Smithery publishing is retired; Registry and both exact ClawHub
security gates remain required. External directory discovery is qualified
separately from publication, scans and normal public installation.

## Qualification

Before release preparation, all 10 guidance contracts, 44 site tests and eight
audit-helper tests passed. Core/site typechecks, focused lint/format, the 143-page
site export, seven exported HTML entry points, the connection anchor and llms.txt
pass. The final install prompt is 236 words; shared project/service guidance is
four bullets/232 words. Previous pushed-main CI and CLI-runtime workflows passed.

Release-version checks, immutable source commits, publication receipts, native
public installs and production site verification are recorded below as completed.
Local receipts: `.tmp/project-guidance-release-20261105/`.

## Corrective security patch

The 1.19.2 npm packages, Registry entry, portable skill and Gemini 1.4.2 were
published and qualified; the OpenClaw plugin's final security review identified
an actual cloud-cache path traversal. Promotion and production-site publication
paused before merging the release branch. Published versions remain immutable.

A crafted fragment-bearing incident ID could bypass the intended HTTP path and
escape the cache filename. FR-CLI-17 / AC-CLI-CACHE closes this boundary across
CLI/MCP/OpenClaw. Twenty regression cases failed before the fix; 65 focused
retrieval/cache/lifecycle/retention tests passed afterward. The patch also rejects
symlinked directories/leaves and uses existing bounded no-follow reads and atomic
compare-before-replace writes. Native emitted/installed plugin checks now include
malicious IDs. CLI/MCP/OpenClaw 1.19.3 supersedes the affected earlier clients;
Gemini 1.4.3 and the unpromoted developer integrations adopt the corrected MCP.
No SDK, consumer product, credential, database or hosted API/worker change is needed.

## Prior 1.19.3 publication evidence — superseded

- Corrective source `63cd6303f27a9ae7e3a2ba92e67ed6ac738e7c63` contains code
  `32b6a8d1` plus the source-bound OpenAI manifest. CLI
  [41940235540](https://github.com/debugbundle/debugbundle/actions/runs/41940235540),
  MCP [41940239118](https://github.com/debugbundle/debugbundle/actions/runs/41940239118)
  and CLI-runtime
  [41940243606](https://github.com/debugbundle/debugbundle/actions/runs/41940243606)
  pass all their supported runtime, native and public-consumer gates.
- At that publication, both npm `latest` tags were 1.19.3 with that exact `gitHead`; SRI and attestation
  URLs are retained locally. All four installed packages have verified Registry
  signatures and attestations. The actual public CLI emits the corrected skill,
  keeps fresh setup local-only and rejects six unsafe bundle/reproduction inputs
  before HTTP/cache access using its existing exit-4 validation output.
- Official Registry `com.debugbundle/mcp` 1.19.3 is published and exact readback
  succeeds. ClawHub accepted both 1.19.3 submissions. Both overall/final reviews are
  clean/benign, and skill moderation is clean. Antivirus completion remains
  pending. Normal public skill installation matches source bytes; normal
  OpenClaw 2026.10.10 installation loads all 149 tools, matches the reviewed
  emitted entry, and passes scoped/auth/pagination/doctor/local checks and
  malicious-ID rejection. Neither remote install uses a force or scan override. Published 1.19.2
  artifacts are immutable and are superseded by the correction.
- Gemini [1.4.3](https://github.com/debugbundle/debugbundle-gemini/releases/tag/v1.4.3)
  main/tag `91fe4f5643240dfbab8553ac113a05839a6bc3dd` and all five public files
  match core; the actual downloaded release ZIP is byte-identical. Archive SHA-256:
  `b54f734dcf6e173a12a4e7aa46ddbfa4d3c4c08ec524e962ec398f2393938323`.
  A normal retained public 1.4.2 → 1.4.3 update passes 149-tool discovery,
  auth/access denial, local evidence, project-skill setup, settings and removal.
- Site source `78fdb97229f342023a3eeddea77d5d9e08959f60` passes
  [source CI 41941111211](https://github.com/debugbundle/site/actions/runs/41941111211)
  and [release 41941466599](https://github.com/debugbundle/site/actions/runs/41941466599).
  The dedicated site deployment follows public core marketplace promotion.
- Read-only production CLI checks independently verify operation
  `f38fb964-4cce-4eca-9a73-e3528998b253` true/no failures, canonical DebugBundle
  and all five retained services. Saved API/App/Site checks pass HTTP 200 with no
  consecutive failures; all eight CloudWatch alarms are OK across their two
  configured regions. Four served App resources are byte-identical and API
  readiness returns 200. No canary or repository adoption was performed.

Pre-ship review confirms invalid IDs fail before URL/cache use, safe opaque IDs
remain valid, symlinked cache paths fail closed, retention preserves unknown files,
and confirmed remote mutation outcomes survive optional cache failure. Adjacent
improvement reads do not persist artifacts via their IDs. No schema migration,
SDK change or new glossary term is needed. Full-source CI and final external
acceptance remain in progress; initial native Gemini jobs failed only because
MCP 1.19.3 was not public yet and will be rerun once the running source job ends.

## Second security correction — retained local artifacts

A refreshed final review of 1.19.3 changed to suspicious after its isolated local
read probe: retained `bundle_path`/`reproduction_path` could select unrelated JSON
outside the intended directories. The earlier clean review and antivirus/public
install proof do not override this later concrete finding. Complete findings remain
in `.tmp/project-guidance-release-20261105/1193-final-local-read-finding.json`.

FR-CLI-18 / AC-CLI-LOCAL-ARTIFACT adds canonical path validation across local
retrieval, rebuilds and cleanup, symlink rejection and guarded state/event IO.
Invalid retained state is preserved, and existing large stores retain their size
allowance. Seven initial path regressions failed before the fix, with further
state/parent-link, large-store and rebuild cases added. CLI/MCP/OpenClaw 1.19.4 and
Gemini 1.4.4 supersede earlier clients. No hosted API/worker, SDK, database,
credential, consumer or production event change is involved.

Local qualification now passes 1,106 cases across 149 affected files, all 84 Gemini/agent-setup contracts, types/lint/format and emitted/installed OpenClaw checks. Six further retrieval-route regressions failed before applying the same identifier validation to improvement/project URL components; all 54 focused retrieval/local/ledger cases then pass. Site 1.7.2 and Gemini 1.4.4 are fresh immutable patches; earlier tags stay intact.

Full source CI 41940243633 completed all 111 shards; its only source test failure
was the stale distribution-ledger pin, now corrected. Native Gemini jobs had only
the earlier pre-publication npm ETARGET. The corrected candidate must pass the
full suite and fresh external gates before this release is complete.

## Hosted artifact generator correction

Exact-source 1.19.4 CI passes 5,174 cases across 111 shards (including 103 actual
Postgres cases), coverage and changed-source checks. Public native Codex 1.5.1,
Claude Code 1.19.4, Gemini 1.4.4 and OpenClaw 1.19.4 checks pass. Core PR #12 merged
normally at `e77cca52`, with a tree identical to qualified source `61555f74`.
Site 1.7.2 source `cb8d67d1` passed source/release workflows and deployment
41949806320; all guide-page/asset checks and production endpoint/alarms pass.

The live llms.txt assertion then exposed the real hosted build path: core's
`public-site-artifacts.ts` overwrote the corrected site-vendored copy. Its older
MCP-first text contradicted the routing contract and omitted one-project guidance.
An active generated-output contract reproduced the failure; correcting the core
template and setup link makes production generation reproduce the approved copy.
This changes the site generator only; published client artifacts remain immutable.
A follow-up site rollout with the corrected core ref is required before closure.
