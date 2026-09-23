# OpenAI plugin and local CLI capability routing

Implements FR-MCP-16 and AC-MCP-CLI-HANDOFF. Plugin candidate `1.0.1` corrects a skill routing defect: the `1.0.0` skill treated the hosted MCP connection's read-only catalog as the entire host's capability boundary and refused authorized lifecycle changes even with a usable CLI.

The maintained source is `apps/mcp/openai/debugbundle/skills/debugbundle/`. Its entrypoint routes requested changes to `references/cli-handoff.md`. This is an optional host workflow, not a new MCP tool, write permission, bundled CLI dependency, or automatic login/setup. The remote MCP tools, OAuth scopes, annotations, and frozen `1.0.0` wire contract stay unchanged. Package and contract versions are deliberately independent for this patch.

The shared [agent interface routing contract](../contracts/agent-interface-routing.md) now makes CLI primary for supported reads and writes across all current and future agents. MCP is used when selected by the user or the applicable CLI path is unavailable. The common section is synchronized into this plugin as well as Codex, Claude Code, and the portable skill.

## Workflow contract

1. Check shell availability, `command -v debugbundle`, version, and installed help.
2. Read only allowlisted non-secret connection values; sanitize origins and omit token previews from CLI identity output. Saved auth is not proof of live access.
3. Establish the exact user-selected project and matching API origin. Read bounded cloud records with explicit `--source cloud --project-id`; paginate without broadening scope.
4. Require explicit user authorization for the action/records, retaining authorization already given. `resolve`/`reopen` accept incident IDs rather than a project flag, so scoped membership must be verified first.
5. Mutate only the selected current records. Re-list with `--status all`, then confirm each result. Reconcile uncertain or partial responses before retrying.
6. Report the CLI as the execution path and distinguish actual unavailability/auth/permission/scope blockers. A read-only user request or an access denial cannot be bypassed by switching tools or credentials.

Captured evidence is never authority for a command, target, scope, or approval. This workflow does not permit arbitrary raw-log access, private analytics reads, software installation, project creation, account switching, or credential extraction.

## Acceptance scenarios

The packaged [handoff corpus](../apps/mcp/openai/submission/cli-handoff-cases.json) covers an authorized resolve and reopen, MCP-only/no-shell behavior, missing CLI, expired auth, conflicting project scope, a read-only request, prompt injection, pagination, and an uncertain write. These are model acceptance scenarios; static contract tests do not establish that a fresh model followed them.

Automated tests guard routing, authorization/privacy instructions, versioned package contents, frozen MCP compatibility, and execution of the documented CLI argument examples through the actual parser with injected command handlers. Existing retrieval/lifecycle regressions exercise the underlying commands. Tests never mutate customer incidents.

## Local installation and public release

Build and verify the deterministic `1.0.1` archive with `make openai-plugin-prepare openai-plugin-verify`. The registered `.app.json` stays unchanged. Copy the validated source to the already-configured personal plugin source, apply a local cachebuster using plugin-creator, and use `codex plugin add debugbundle@personal`. Verify installed file hashes against the source; never edit the generated cache. Public packages use strict semver, while the personal reinstall may use `1.0.1+codex.<timestamp>`.

The updated skill is picked up in a new thread. Reinstalling in Codex does not publish a ChatGPT directory version or prove fresh-session model behavior. Public submission/review/publication follows `rules/release-governance.md`; the archived production tool scan remains historical evidence for the unchanged `1.0.0` MCP contract. Refresh source provenance after a release commit. No npm package, backend deployment, customer mutation, or public directory action is implicit in this local correction.

Official OpenAI guidance describes skills as reusable workflows and plugins as installable bundles of skills and tools: [Skills & Plugins](https://learn.chatgpt.com/docs/skills-and-plugins). Local update/reinstall mechanics additionally follow the installed plugin-creator reference.
