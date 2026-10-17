# OpenClaw security remediation — 2026-10-17

Status: corrective CLI/MCP/OpenClaw 1.16.1 release authorized by the owner; publication in progress. Published OpenClaw 1.16.0 remains Review. The portable skill 1.16.0 has a clean overall outcome. Ecosystem security acceptance remains open until a corrective publication passes the exact-version gates for both distributions.

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

Full typecheck and 250 regression tests across 52 files passed, covering MCP, OpenClaw, CLI retrieval/verification and minimized agent reads. Final native OpenClaw package validation and the assembled-artifact gate passed. The public JavaScript export set is unchanged. Full repository lint and focused lint for the final extracted policy module passed. The saved exact-version public readback passes the new skill gate and fails the new plugin gate, as required. No new public audit outcome is claimed from local tests.

Pre-ship review: changes are confined to host permission metadata/hooks, pure import boundaries, release verification and matching documentation/tests. Default reads and MCP/CLI payloads are preserved. Unknown tools require opt-in, unrelated tool calls receive no hook decision, missing hook registration fails before tool registration, and approval text excludes untrusted inputs. The host owns approval denial/timeout/cancellation routing. Read-only registry verification never publishes; unavailable registry data produces a failed verification result. No database changes, migration, customer records, credentials, cleanup or production runtime mutation are involved. The remaining external gate is the newly published artifact's marketplace review and the operator's approval-delivery surface.

## Release follow-through

After explicit authorization for this corrective release, choose coordinated patch versions for the affected CLI/MCP/OpenClaw artifacts under the existing release contracts, publish exact reviewed sources, and run the MCP ecosystem pipeline. Retain separate version/publication/content-integrity evidence and security review evidence. Do not close acceptance while either ClawHub distribution lacks a completed clean outcome. Native approval delivery through the operator's chosen UI/channel and new public marketplace review remain external qualification steps.

The owner authorized commit, push and publication on 2026-10-17. Before any ClawHub-related pipeline publication, `make openclaw-release-check` now requires native package/artifact validation plus skill, permission, parity, legacy and release-gate regressions. The MCP release workflow runs the same gate before npm publication. Each accepted publisher receipt is persisted immediately. Platform security acceptance still occurs after upload and cannot be substituted with local tests.

Developer distribution review: Codex 1.3.1, Claude 1.16.0 and Gemini 1.2.1 retain their verified MCP 1.16.0 pins. The correction changes OpenClaw host permission enforcement and trims unused imports; it adds no MCP capability or payload change requiring those distributions to be republished. Core, site, shared libraries, SDKs and hosted runtime are unchanged.
