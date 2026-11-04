# Project/service consolidation release train — 4 November 2026

The owner authorised the production release and complete DebugBundle release
train on 4 November. Live consolidation of existing DebugBundle projects remains
a later task. Consumer products are outside this release.

The audited source passed 5,131 tests across 110 shards, including 103 real
Postgres cases; 180 general integration cases passed with one existing optional
skip. Static, coverage, retained-client and sealed migration/rollback rehearsals
passed. See [qualification](project-service-qualification.md) for exact receipts.

## Distribution inventory

| Surface                              | Candidate/current version   | Release disposition                                          | Current result         |
| ------------------------------------ | --------------------------- | ------------------------------------------------------------ | ---------------------- |
| Core API/worker and app              | 1.21.0                      | New minor release; forward migrations before runtime         | Preparing              |
| Shared types                         | 3.1.0                       | Publish additive schemas first                               | Preparing              |
| Redaction                            | 2.7.0                       | Unchanged; verify published artifact                         | Pending verification   |
| CLI                                  | 1.19.0                      | Publish and verify clean installed commands                  | Preparing              |
| MCP                                  | 1.19.0                      | Publish; exact Registry entry and installed native clients   | Preparing              |
| OpenClaw plugin / portable skill     | 1.19.0                      | Publish both; require exact security and runtime acceptance  | Preparing              |
| Codex developer plugin               | 1.5.0                       | Promote marketplace only after MCP publication               | Preparing              |
| Claude Code developer plugin         | 1.19.0                      | Promote marketplace only after MCP publication               | Preparing              |
| Gemini CLI extension                 | 1.4.0                       | Standalone repository, tag, archive and public installation  | Preparing              |
| Public site/docs                     | 1.7.0                       | Publish aligned guidance and verify served artifacts         | Preparing              |
| Hosted OpenAI connection             | Existing read-only contract | Verify live endpoint; independent submission gates remain    | Pending verification   |
| Node / Browser SDKs                  | 3.2.0                       | Unchanged; verify current public artifacts and compatibility | Pending verification   |
| Python / PHP / Ruby / .NET SDKs      | 2.1.0                       | Unchanged; verify current public artifacts and compatibility | Pending verification   |
| Java / Go / Android SDKs             | 3.1.0                       | Unchanged; verify current public artifacts and compatibility | Pending verification   |
| Swift SDK                            | 3.1.1                       | Unchanged; preserve existing SPM/CocoaPods installs          | Pending verification   |
| React Native SDK                     | 3.1.0                       | Unchanged; preserve published native dependency floors       | Pending verification   |
| WordPress plugin                     | 2.1.0                       | Unchanged; verify public ZIP without changing consumer sites | Pending verification   |
| Smithery publisher / skill publisher | Retired                     | Excluded; provider retirement reconfirmed                    | No publication claimed |

Private internal workspace packages are delivered in the core/client artifacts;
they are not independent registry publications. Existing SDK sources and wire
formats are unchanged, with the applicability matrix retained in
`project-service-sdk-compatibility.md`.

## Hosted rollout and rollback

Pin core, site and cloud source commits and immutable API/worker image digests.
Record the pre-release active/stable identity and schema ledger. Run ordered
migrations before new code starts, verify API/worker readiness and source identity,
preserve the managed MCP route, and verify served app/site assets independently.

Keep merge apply disabled until the actual fleet, compatible stable rollback and
served credential/origin/cache gates in the cloud runbook pass. Publication or a
healthy readiness endpoint does not close that activation gate. No existing
project is consolidated by this release.

## Evidence and outstanding gates

Release preparation is in progress. Add source/CI/workflow/registry/installation
and production receipts here as each gate completes. An accepted upload is not
platform security acceptance or deployed-runtime proof.
