# Project/service installation guidance release — 5 November 2026

The owner authorised commit/push, the affected DebugBundle release train and
production publication. FR-PJS-01 / AC-PJS-03: prefer one project per system
across service repositories, preserve existing connections and policy boundaries,
and explain name-based connect without implicit consolidation.

## Release inventory

| Surface                          | Patch  | State                                                      |
| -------------------------------- | ------ | ---------------------------------------------------------- |
| CLI / MCP                        | 1.19.3 | Candidate                                                  |
| OpenClaw plugin / portable skill | 1.19.3 | Candidate                                                  |
| Codex developer plugin           | 1.5.1  | Candidate, pins MCP 1.19.3                                 |
| Claude Code developer plugin     | 1.19.3 | Candidate, pins MCP 1.19.3                                 |
| Gemini CLI extension             | 1.4.3  | Candidate, pins MCP 1.19.3                                 |
| Public site/docs                 | 1.7.1  | Candidate                                                  |
| OpenAI combined plugin           | 1.0.3  | Independent local package; portal process remains separate |

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
