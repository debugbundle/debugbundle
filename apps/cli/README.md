# @debugbundle/cli

Command-line interface for DebugBundle.

## Installation

```sh
npm install -g @debugbundle/cli
```

Supported Node.js versions: 22.x through 26.x.

An unreadable response, connection loss, or server error during an
incident/improvement lifecycle write reports `mutation_outcome_unconfirmed`.
JSON output includes `outcome: "unknown"` and `retry_safe: false`; exit code 1
means confirmation is unavailable, not that the write failed. Check the current
state with a read before retrying. The CLI does not automatically repeat writes.
A confirmed cloud result remains successful if only the local cache update fails;
the incident carries `cache_warning: "cloud_cache_update_unavailable"`.
`doctor` exits 1 when its report contains errors; warning-only reports still
exit 0. `doctor --auth-file <path>` can check an explicit saved login.

Check the installed CLI version with `debugbundle --version` or `debugbundle -v`.

Or install it as a project development dependency:

```sh
npm install --save-dev @debugbundle/cli
```

## Quick start

```sh
debugbundle setup --non-interactive
debugbundle doctor --privacy
debugbundle verify local
debugbundle verify cloud --project-id <id> --trigger-5xx
debugbundle verify cloud --project-id <id> --trigger-4xx 403
debugbundle process
debugbundle incidents
debugbundle explain <incident-id> --source cloud
```

## Agent-aware setup

```sh
debugbundle setup --agent codex --agent claude-code --agent gemini-cli --agent muse-code --non-interactive
debugbundle doctor --json
debugbundle validate --fix --json
```

Interactive setup offers detected agents as defaults. Repeat `--agent` to select integrations explicitly; JSON/non-interactive runs never prompt or infer new agents. Saved selections are reused. Codex, Gemini CLI, and Muse Code discover `.agents/skills/debugbundle/` directly. Claude Code receives a relative link under `.claude/skills/debugbundle/`, with an owned copy fallback when links are unavailable. Only selected native instruction files are managed; existing references/imports are preserved.

Keep `.debugbundle/agent-setup.json` with the canonical skill. It stores ownership hashes and selection, without credentials. Doctor and validate report canonical health separately from native discovery. Repair refreshes unchanged generated artifacts and preserves user edits for manual review. Repeated setup preserves the reviewed profile and cloud connection. Unknown legacy files are retained; exact known 1.10.0 templates can upgrade safely.

`debugbundle setup --agent none --non-interactive` removes only unchanged owned native integrations while retaining the canonical skill and configuration. Edited conflicts remain and require review. A stale `.debugbundle/agent-setup.lock` may be removed only after confirming no setup/repair is running.

Muse Code uses `--agent muse-code` (the agent executable is `muse`). It respects Muse's existing instruction precedence, creates `AGENTS.md` only when no supported instruction file exists, and shares owned blocks safely with other agents. Detection uses `.muse` project evidence; `AGENTS.md` alone does not select Muse. Trust the repository in Muse before expecting project skills to load, then check with `muse skills list --source project --json`.

Portable plugin skills complement the project's profile and workflows. Setup does not install plugins, configure MCP, or change authentication. Project plugin settings are hints; doctor does not prove a running agent loaded the skill. Restart/reload the agent after setup. See [the full contract and rollback guidance](https://github.com/debugbundle/debugbundle/blob/main/spec/agent-aware-cli-setup.md).

## Configuration

The CLI reads local project configuration from `.debugbundle/` and can use member-token authentication for connected cloud operations. Use `debugbundle connect` to configure cloud access, or pass `--auth-file` to commands that support explicit auth state.

## AnalyticsBundle

Analytics commands require connected member authentication and a project with AnalyticsBundle enabled. They query aggregate rollups or request an asynchronous analysis artifact; they do not read raw analytics events.

```sh
debugbundle analytics summary --project <project-id> --last 7d
debugbundle analytics devices --project <project-id> --last 7d
debugbundle analytics journeys --project <project-id> --last 7d
debugbundle analytics opportunities --project <project-id>
debugbundle analytics opportunities --all-projects
debugbundle analytics bundle create --project <project-id> --kind journey_friction --last 7d
debugbundle analytics bundle list --project <project-id>
debugbundle analytics bundle list --all-projects
debugbundle analytics saved-funnels list --project <project-id>
debugbundle analytics saved-funnels create --project <project-id> --key signup --name "Signup" --steps-json '[{"step_key":"landing","display_name":"Landing"},{"step_key":"complete","display_name":"Complete"}]'
```

Use `debugbundle analytics settings get --project <project-id>` to inspect availability and capture/retention settings. Owners and admins can enable it with `debugbundle analytics settings set --project <project-id> --enabled true`; Team projects can additionally manage approved custom dimensions. Saved funnels are reusable project definitions, not per-visit bundles; members can list them and owners/admins can create, update, or archive them within the independent tier cap. Project tokens remain SDK-ingestion-only and cannot read analytics.

## Documentation

Full CLI documentation: https://debugbundle.com/docs/cli

## License

Apache-2.0
