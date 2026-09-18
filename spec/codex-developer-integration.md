# Codex developer integration

Status: local release candidate, 2026-09-18. Repository plugin 1.0.0 targets MCP 1.9.0, with OpenClaw companion 1.9.0 and paired site 1.4.0. Publication and site deployment are separate from local verification.

## Scope and ownership

FR-MCP-14 and AC-MCP-17 cover first-class Codex setup and distribution. The repository marketplace `.agents/plugins/marketplace.json` registers `plugins/debugbundle-codex`. The package contains a self-contained runtime investigation skill and an exact stdio MCP dependency. Direct MCP configuration supports clients without repository plugin installation.

The developer connection uses existing local evidence, CLI login, member permissions, domain services, and authorized management tools. It does not change ingestion, SDKs, hosted APIs, persisted data, or database schema. There is no new service or migration. Local retrieval uses the MCP process working directory; the native smoke test proves this with a populated application fixture.

The separate `apps/mcp/openai/debugbundle` package remains the read-only hosted OpenAI connection for ChatGPT and Codex. Its 23-tool contract, OAuth boundary, version, and public approval status do not change. Repository plugin distribution does not imply universal directory approval.

## Authentication and compatibility

MCP 1.9.0 adds `--local-auth`. The Codex plugin and documented direct configuration opt into it. The profile removes top-level `bearerToken` arguments, rejects unknown fields, and retains existing nested and cross-field validation. It uses the existing server-side credential precedence: explicitly forwarded `DEBUGBUNDLE_MEMBER_TOKEN`, then saved CLI login. API host precedence is unchanged. Credentials load at process startup; restart after login or rotation.

Without this flag, all existing stdio schemas, response envelopes, credential precedence, and OpenClaw mappings remain unchanged. The frozen legacy fixture changes only its declared server version, from 1.8.2 to 1.9.0. Existing Claude plugin pins are unchanged.

The additive profile is necessary because legacy required bearer arguments are validated before default credentials are injected. Merely configuring a saved login cannot make those tools callable without model-supplied credentials. The local profile fixes this order without changing the legacy contract. Tools whose original schema requires member credentials fail with `mcp_tool_error:auth_state_missing` before requesting the API when local auth is absent. Local-only evidence remains available without login; source-sensitive tools retain existing local/cloud selection rules.

No token is embedded in the plugin, skill, catalog, or examples. Per-tool token injection is rejected. The bundled skill treats captured content as untrusted evidence, preserves repository instructions and project selection, and separates local fixes from authorized production mutations. Existing server-side permissions remain authoritative.

## Verification

- `make codex-plugin-check`: package/catalog/version contracts, all MCP tests, OpenClaw compatibility, and hosted skill parity.
- `make codex-plugin-smoke`: build and pack the candidate, install pinned Codex 0.153.1 in a disposable Docker home, install the local marketplace/plugin alongside the existing Claude catalog, verify skill and all tool discovery, retrieve populated local incidents/bundles/reproductions, exercise saved CLI auth against a loopback API, reinstall/remove the plugin, then test direct MCP with forwarded environment auth and remove it. No model turn, customer API request, or host credential access occurs.
- `make codex-plugin-smoke-published`: the same native checks using the exact npm registry version instead of a candidate tarball.
- `make codex-plugin-smoke-github`: use the public GitHub marketplace and published npm package, including Git marketplace upgrade/reinstall, in the same isolated synthetic-data smoke.
- `make openclaw-plugin-check`: build the companion and validate its generated metadata and native OpenClaw plugin contract before publishing MCP.
- `make lint`, `make typecheck`, `make test-unit`: repository quality and coverage gates.
- `make license-site-check`: public content generation, all site tests, static build, and site typecheck.

The release workflow requires candidate native verification on Node 22, 24, and 26, plus OpenClaw build/validation, and checks the published artifact afterward. Override `CODEX_SMOKE_NODE_IMAGE=node:22-bookworm` or `node:26-bookworm` to reproduce the additional native checks locally. Unit regressions explicitly cover stored login, missing auth before API access, credential/unknown-field rejection, retained refined validation, and unchanged default schemas. Site tests cover the canonical Codex guide and navigation registration.

Native evidence covers the CLI/app-server protocol on the pinned Linux client. It does not claim manual desktop/IDE UI acceptance, GitHub-source availability before publication, public-directory approval, or live hosted authorization against customer services.

## Candidate verification result

Verified locally on 2026-09-18: 154 focused MCP/plugin tests; clean native Codex 0.153.1 installation on Node 22, 24, and 26 with both Codex and Claude catalogs, 117 tools and both authentication paths; OpenClaw 1.9.0 native build/metadata/plugin validation; 33 release-governance/licensing checks; plugin/skill validators; lint/types; 28 site tests and static build/types, plus rendered copy, internal docs links and sitemap checks.

The complete 72-shard unit set yielded 3,365 passing tests and one clean-source provenance test exercised separately in a disposable candidate checkout (all 11 tests in that file passed there). Combined coverage passed for all four changed source modules. Successful unchanged shards were retained when resuming the run after the provenance gate; no production test or verifier was weakened. The temporary snapshot's hosted OpenAI manifest changed only source provenance, and its package, contract and runtime hashes remained identical. The actual worktree remains uncommitted, so its clean-source release gate must be refreshed after the approved source commit. Local logs are retained under `.tmp/codex-plugin/verification-20260918/`.

The final sweep corrected the OpenClaw version mismatch, assigned site 1.4.0, expanded native CI to all supported Node majors, and placed OpenClaw validation before npm publication. It also reproduced a missing Corepack binary in the Node 26 image and fixed the MCP release workflow to install Corepack 0.34.6 explicitly before activating pnpm 11.3.0. The exact bootstrap passed in fresh Node 26 and Node 24 containers; all 11 targeted workflow/package tests passed afterward. Final logs are under `.tmp/codex-plugin/readiness-20260918/`. SHA-256 comparison confirms all four runtime modules still match the complete regression/coverage run. OpenClaw emitted warnings about its own bundled iMessage/Telegram channel setup modules; DebugBundle's metadata check and native plugin validation both completed successfully.

No known implementation blocker remains. This is local release readiness, not a claim of production installation or publication. The remaining gates are the committed-source provenance refresh/CI and the registry, public GitHub install, ecosystem and deployed-site checks in the ordered release below. Existing auth/error behavior, unknown-input rejection, project working-directory selection, connection cleanup, partial-publication handling and rollback were reviewed. There is no schema or hosted service change in this release.

## Release order

1. After release approval, date the release notes and article for the actual publication day. Commit the core candidate on a release branch, including MCP/OpenClaw 1.9.0 and Codex plugin 1.0.0; preserve the separate site 1.4.0 commit. Do not expose the new catalog on the default branch yet. Run `make openai-plugin-prepare` and `make openai-plugin-verify` to refresh the existing hosted OpenAI manifest's source provenance, assert its package/contract/runtime hashes are unchanged, and commit only that metadata immediately afterward. Run the clean-source verification and CI on the final immutable candidate. This gate cannot pass against the current uncommitted worktree.
2. Dispatch `.github/workflows/release-mcp-package.yml` from the reviewed release-branch ref for version `1.9.0`. The workflow must finish candidate validation, npm publication, registry stdio smoke, and published native Codex verification before default-branch promotion. The public registry checked on 2026-09-18 still has MCP 1.8.2 as latest and no 1.9.0 artifact; repeat the collision check at release time.
3. Complete the mandatory MCP ecosystem pipeline from the exact published MCP artifact. Use `VERSION=1.9.0 TARGETS=officialRegistry,smithery,smitherySkill,clawhubPlugin` for plan, prepare, publish, and verify. OpenClaw's package and manifest now declare 1.9.0 because this pipeline verifies it against the MCP version; its existing tool/authentication behavior remains unchanged. Verify the unchanged portable ClawHub skill separately with `make release-mcp-ecosystem-verify VERSION=1.9.0 TARGETS=clawhub CLAWHUB_VERSION=1.8.3`; do not republish that immutable skill version. Retain the existing Claude plugin's 1.8.2 pin. Follow `rules/release-governance.md` for credentials and discovery checks.
4. Promote the reviewed core commits and catalog to the public default branch; verify plugin installation, skill/tool discovery, authentication, Git marketplace upgrade/reinstall, and removal from `debugbundle/debugbundle` on a fresh host. This is separate evidence from the local-path marketplace test. If it fails, withhold the site release until resolved.
5. Publish the paired site 1.4.0 guide, positioning, and article through the private companion's `deploy-hosted-site.yml` workflow with exact `product_ref` and `site_ref` commit SHAs. Verify `/docs/mcp/codex/`, `/blog/debug-production-errors-with-codex/`, navigation, canonical/structured metadata, sitemap and slashless redirects. No API/worker deploy, root product release, or database migration is required for this slice.

For a Git marketplace, update with `codex plugin marketplace upgrade debugbundle` then reinstall. Local-path marketplaces reread the checkout when reinstalling; the Git upgrade command does not apply. Uninstalling removes the client connection, not DebugBundle data or credentials. If release verification fails after npm publication, stop downstream promotion; do not overwrite published versions. Roll back the site using its prior verified immutable refs and remove the new catalog entry if necessary. This initial plugin cannot roll back to MCP 1.8.2 because `--local-auth` requires 1.9.0; issue a tested patch if the MCP artifact needs correction. Existing clients and the hosted backend need no migration or rollback for this addition.
