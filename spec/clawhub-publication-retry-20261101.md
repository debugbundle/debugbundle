# MCP and ClawHub packaging retry — 1 November 2026

Status: MCP 1.18.1 is published to npm and the official Registry. ClawHub accepted
the plugin 1.18.1 upload and is checking it; the skill transport retry and both
exact-version security outcomes remain pending. No support issue is submitted.

## Purpose and version decision

ClawHub accepted OpenClaw plugin 1.18.0 but its Skillspector scanner failed before
returning a verdict. Its exact publication state is now failed and not recoverable;
public latest remains 1.17.0. ClawHub's retained-version recovery applies to its
OpenClaw release-authorised attempts, not this ordinary publisher upload.
The separate skill 1.18.0 antivirus result has since arrived clean.

The owner authorised one fresh coordinated MCP/OpenClaw patch attempt. MCP and
the plugin use **1.18.1** under their existing version-alignment contract. The
portable skill also uses **1.18.1**, correcting its stale installer metadata to
MCP 1.18.1 and the already-published CLI 1.18.0. A regression first reproduces the
old 1.17.0 pins, then requires the selected package manifests' exact versions.
The MCP package's direct Codex example is updated to this patch. ClawHub's plugin
publisher and inspector use 0.25.0. The portable skill publisher retains 0.22.0
for its supported direct multipart transport: 0.25.0's upload-ticket requests
failed twice with HTTP 500 before accepting either file. Both publishers use the
same authenticated API and mandatory platform security checks. The two-file
skill's 0.22.0 dry run passes; this transport correction does not require another
MCP package version or changes to the immutable 1.18.1 npm artifact.

No tool catalog, input schema, transport, authentication, redaction, native approval
or SDK implementation changes. Core stays 1.20.0 and its deployed API/worker/app
source remains 88a9a42c; site 1.6.11 and all language SDK/WordPress versions retain
their verified releases. No hosted deployment or consumer adoption is part of
this patch. Existing immutable tags and published versions are preserved.

## Compatibility and acceptance

This maps to FR-MCP-18, AC-OPENCLAW-01–04 and the portable install metadata contract
in `contracts/public-interfaces.md`. Existing native per-call approval, optional
tool exposure, privacy and token scope tests remain unchanged.

Codex 1.4.1, Gemini 1.3.1 and Claude Code 1.18.0 retain their verified MCP 1.18.0
pins: the patch changes packaging and documentation only. Their reviewed runtime
catalog and authentication remain equivalent. The frozen OpenAI 1.0.2 package is
unchanged; only local committed-source provenance must be refreshed, with no
portal action or deployed-image claim. Capture SDKs, relays and native bridges
have no applicable implementation change.

Required gates: native OpenClaw build/manifest/artifact checks; portable skill,
permission, parity, legacy and release security tests; MCP staged and registry
stdio/native Codex checks on Node 22/24/26; ClawHub 0.25.0 inspector and dry run;
immutable source/archive integrity; official Registry exact version; both exact
ClawHub versions' clean final review/antivirus/moderation; bounded discovery.
Smithery publishing is retired and explicitly excluded. Directory discovery and
upload acknowledgement do not replace platform security acceptance.

If the new attempt repeats the operational scanner failure, retain its complete
receipt and stop further version churn. Do not bypass scanners, alter assertions,
discard the earlier attempt, or submit a support issue without owner direction.

## Current proof

The stale-pin regression fails against the old skill. With corrected pins and the
regenerated 1.18.1 plugin manifest, all 32 OpenClaw release checks and 209 MCP,
OpenClaw and developer-plugin compatibility checks pass. ClawHub 0.25.0 inspection
passes with zero warnings/breakages, and its package publish dry run passes. The
multipart configuration's 16 release/security/publication regressions pass.

Immutable `mcp-v1.18.1` and npm `gitHead` identify
`fbfdd394fac52087bb11489f53a2980c64ba057e`. The public npm archive has SHA-256
`ba13e37b5257281019e46b693cb6e7f7d756b1b2f42fbf8935e3174f23e7287b`;
its required README/license/server manifest and executable bytes match source.
[MCP release 41359104108](https://github.com/debugbundle/debugbundle/actions/runs/41359104108),
[full source CI 41359102668](https://github.com/debugbundle/debugbundle/actions/runs/41359102668)
and CLI compatibility 41359102664 pass. Installed public MCP/Codex checks pass on
Node 22, 24 and 26. The official Registry's immutable 1.18.1 entry is active/latest.
The MCPB is prepared from that public archive, with native dependency and staged
stdio checks passing. Runtime source under MCP, CLI and shared packages is
unchanged from published MCP 1.18.0 source `c3bec35e`.

ClawHub's first skill upload and one retry failed at upload-ticket file 1/2 with
HTTP 500 (request IDs `46409b1815572a90` and `e2cb8530b871c048`). Exact owner reads
confirm that skill 1.18.1 was not accepted. The first plugin call hit platform
database write contention; after its backoff, one bounded same-version retry was
accepted and exact publication status is pending at checks. Neither an upload
receipt nor this pending status satisfies the final security gate. The existing
1.18.0 failed plugin attempt and all immutable versions are retained.
