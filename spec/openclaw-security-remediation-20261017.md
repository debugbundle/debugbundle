# OpenClaw security remediation — 2026-10-17

Status: CLI/MCP/OpenClaw 1.16.1 and the portable skill are published. Exact-version ClawHub security acceptance passes for both the skill and plugin. The complete ecosystem command remains non-green because Smithery rejects the MCP server update and ClawHub discovery meets only 5/7 configured ranks; these limits are separate from security acceptance.

## Findings and scope

ClawHub's exact 1.16.0 package audit identifies `create_agent_token` and `revoke_agent_token` as incorrectly enabled by default. The generated manifest and runtime projection both omitted them from the mutation set. The 1.15.0 record also currently reports Review; its broad administrative capabilities were insufficiently disclosed. Publication receipts and matching file hashes did not establish security acceptance, and the former release verifier incorrectly treated exact-version existence as sufficient.

The four static findings were traced to:

- AJV runtime compilation brought in through `agent-read-client` importing the hosted MCP server barrel. The client only needs the pure output contract. Storage barrel imports also unnecessarily included hosted/server dependencies.
- Undici's `JEST_WORKER_ID` environment read in its HTTP implementation. This is not a credential; retain the pinned fetch implementation paired with its dispatcher for existing Node compatibility.
- The redaction engine's bearer/basic regular expression, misidentified as a hardcoded secret. It removes credentials and must remain intact.
- Reading the existing DebugBundle CLI auth file before authenticated API requests, an intentional documented workflow. Preserve auth precedence and avoid exposing credential values.

The separate portable skill has a clean final review/antivirus result and low-severity SkillSpector warnings adjudicated by ClawHub. The release gate records those details; a clean overall outcome is not a claim that every individual heuristic scanner is warning-free. No finding is hidden or locally overridden.

## Corrective implementation

- Replace the omission-prone mutation set with an explicit default-tool set. All other tools default to optional. The two credential mutations now require opt-in; existing default reads, names, schemas and delegation remain unchanged.
- Install OpenClaw's native `before_tool_call` approval hook before registering tools. Every optional tool requires allow-once/deny approval with a 120-second deny-on-timeout policy. Raw arguments and credentials are absent from approval text. Missing hook registration fails before any tools register. This enforces the existing AC-OPENCLAW-02 contract.
- Align peer/compatibility declarations with the already-documented install baseline OpenClaw 2026.6.9. Older hosts must upgrade before this security correction. No API/CLI/MCP input or output changes are introduced.
- Import pure storage projections and the minimized output contract directly. Add a packaging gate rejecting unused hosted/server modules, AJV, and dynamic code compilation in the assembled plugin. The generated entry shrinks from roughly 4.5 MB to 2.36 MB.
- Require exact-version clean overall, final reviewer and antivirus results for both skill and plugin, plus unblocked clean skill moderation. Pending, missing, suspicious/Review, failed, stale or unavailable evidence fails closed. A partial ClawHub publication still verifies its unchanged companion without publishing it. Existing publication-only reports cannot pass.
- Split target verification out of the oversized release script at its existing functional boundary. The release entry remains below 800 lines. Scanner evidence is preserved in the normal report.

Requirements: FR-MCP-02, FR-MCP-10, FR-MCP-18; AC-OPENCLAW-01 through AC-OPENCLAW-04; credential isolation and mandatory redaction remain unchanged. No database/schema/runtime deploy is needed for this correction.

## Qualification

Regression tests first demonstrated the missing optional agent-token declarations and the release verifier accepting a flagged plugin. The artifact guard also rejected the unused AJV/server graph before its removal. Native OpenClaw build/manifest validation passes with the corrected artifact.

The unchanged historical MCP/OpenClaw fixture is retained. Its comparison explicitly permits only the two documented optional-flag corrections; every legacy name, schema, response envelope, auth precedence and other exposure flag remains checked.

Full typecheck and 250 regression tests across 52 files passed, covering MCP, OpenClaw, CLI retrieval/verification and minimized agent reads. Final native OpenClaw package validation and the assembled-artifact gate passed. The public JavaScript export set is unchanged. Full repository lint and focused lint for the final extracted policy module passed. The saved 1.16.0 public readback passed the skill gate and failed the flagged plugin gate before publication, as required. Final 1.16.1 public results are recorded below.

Pre-ship review: changes are confined to host permission metadata/hooks, pure import boundaries, release verification and matching documentation/tests. Default reads and MCP/CLI payloads are preserved. Unknown tools require opt-in, unrelated tool calls receive no hook decision, missing hook registration fails before tool registration, and approval text excludes untrusted inputs. The host owns approval denial/timeout/cancellation routing. Read-only registry verification never publishes; unavailable registry data produces a failed verification result. No database changes, migration, customer records, credentials, cleanup or production runtime mutation are involved. Native approval delivery through an operator's particular client/channel remains an installation-specific check; the plugin hook contract, manifest and built artifact are qualified.

## Release follow-through

The owner authorized the corrective release. Coordinated CLI/MCP/OpenClaw 1.16.1 versions were published from reviewed sources, followed by the MCP ecosystem pipeline. Publication/content-integrity evidence and final security outcomes were checked separately; neither pending reviews nor upload receipts were accepted as passes.

The owner authorized commit, push and publication on 2026-10-17. Before any ClawHub-related pipeline publication, `make openclaw-release-check` now requires native package/artifact validation plus skill, permission, parity, legacy and release-gate regressions. The MCP release workflow runs the same gate before npm publication. Each accepted publisher receipt is persisted immediately. Platform security acceptance still occurs after upload and cannot be substituted with local tests.

Developer distribution review: Codex 1.3.1, Claude 1.16.0 and Gemini 1.2.1 retain their verified MCP 1.16.0 pins. The correction changes OpenClaw host permission enforcement and trims unused imports; it adds no MCP capability or payload change requiring those distributions to be republished. Core, site, shared libraries, SDKs and hosted runtime are unchanged.

## Published evidence

- Reviewed source `78febcb86fb072ef1b67d49e7aa3cc030fa9aec8` is on public `main`; [PR #8](https://github.com/debugbundle/debugbundle/pull/8) is merged. [Final CI](https://github.com/debugbundle/debugbundle/actions/runs/39065713100) passes 4,254 tests in 514 files, lint, typecheck, build, dependency audit and all seven changed-source coverage gates. Native Gemini checks on Node 22/24/26 pass. Earlier stale workflow-name test expectations were corrected to assert that the expanded gate retains native validation; no product contract was weakened.
- [CLI publication](https://github.com/debugbundle/debugbundle/actions/runs/39065439875) and [MCP publication](https://github.com/debugbundle/debugbundle/actions/runs/39065585144) succeed, including clean registry installs and native compatibility checks. Both npm `latest` tags resolve to 1.16.1. The published MCP tarball matches registry SHA-512 integrity and SHA-1 shasum; its repacked MCPB passes the stdio smoke test.
- Pre-publication native validation, 30 regression checks, the ClawHub package inspector (zero errors/warnings), and dry-run publish pass. The pipeline enforces these checks before any external publication for an OpenClaw target.
- Official MCP Registry 1.16.1 and the Smithery skill update are accepted and independently found. ClawHub portable skill receipt: `k978eg0km4r97rqbw2kqex62258gf44m`; plugin receipt: `rd74w9kch6jtw0as07mmxsaee98geq17`.
- Both exact-version ClawHub security gates pass: clean overall state, benign/clean final review and clean antivirus; skill moderation is clean and unblocked. The plugin antivirus result reports zero malicious and zero suspicious detections across 61 engines. Earlier missing-version and incomplete-antivirus reads correctly failed acceptance until completed results appeared.
- The dynamic-code-execution finding is gone. The remaining plugin static heuristics identify Undici's test environment flag, a redaction regular expression and intentional CLI authentication reads; ClawHub's final reviewer adjudicates the plugin benign. The skill retains two low-severity SkillSpector warnings adjudicated benign (MIT-0 boilerplate and access-control guidance). These findings remain visible and recorded; no scanner override or warning suppression was used.
- The downloaded plugin archive verifies against ClawHub's published digests and all six files match the reviewed artifact byte-for-byte. Archive SHA-256: `f70269f8e3c3bc197bb1477331cb28f0d99424fc09734e55b1b2d9d2247a9f57`. The published skill body matches source SHA-256 `20e42d17177702b79bfa0ee6d68829f9164749c1c0653baad003848c4fd0be5e`.

## Remaining external follow-through

Smithery MCP publishing returns HTTP 403: `Updating servers has been removed. Contact support@smithery.ai.` The pinned CLI is still the latest 1.2.0 and uses the currently [documented publish endpoint](https://smithery.ai/docs/api-reference/servers/publish-a-server). No new server release was accepted; the existing listing is not evidence of a 1.16.1 update. Provider intervention is required before retrying this target. Do not delete/recreate the existing listing or substitute the hosted read-only endpoint for this stdio distribution.

ClawHub search meets 5/7 configured rank checks: the aggregate query is absent and `incident response` ranks 17 against the top-ten target. Glama returns HTTP 401; PulseMCP and LobeHub require manual verification. MCP.so is found. These previously qualified discovery limits remain open. The full ecosystem verifier intentionally exits nonzero (`smithery:unpublished,clawhub:partial`) while both security fields independently report `passed: true`.

Durable local evidence: `spec/local/openclaw-security-release-20261017.json` and `.tmp/mcp-ecosystem/1.16.1/report.json`. Documentation, contracts, requirements, acceptance and glossary are reconciled. No database, hosted runtime, SDK or independent developer-plugin deployment was performed.
