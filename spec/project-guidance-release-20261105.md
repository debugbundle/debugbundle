# Project/service installation guidance release — 5 November 2026

The owner authorised commit/push, the affected DebugBundle release train and
production publication. FR-PJS-01 / AC-PJS-03: prefer one project per system
across service repositories, preserve existing connections and policy boundaries,
and explain name-based connect without implicit consolidation.

## Release inventory

| Surface                          | Patch  | State                                                      |
| -------------------------------- | ------ | ---------------------------------------------------------- |
| CLI / MCP                        | 1.19.2 | Candidate                                                  |
| OpenClaw plugin / portable skill | 1.19.2 | Candidate                                                  |
| Codex developer plugin           | 1.5.1  | Candidate, pins MCP 1.19.2                                 |
| Claude Code developer plugin     | 1.19.2 | Candidate, pins MCP 1.19.2                                 |
| Gemini CLI extension             | 1.4.2  | Candidate, pins MCP 1.19.2                                 |
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
