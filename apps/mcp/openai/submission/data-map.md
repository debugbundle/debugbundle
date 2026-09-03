# Submission Data Map

The normative field-level allowlist is [`contracts/openai-plugin-v1-data-map.md`](../../../../contracts/openai-plugin-v1-data-map.md). The exact executable schemas are [`tests/fixtures/openai-plugin-v1/schemas.json`](../../../../tests/fixtures/openai-plugin-v1/schemas.json).

## Declared categories

| Category                     | Purpose                                                               | Principal safeguards                                                                                                       |
| ---------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Account/project metadata     | Let a linked user select a project/service they can already access    | Runtime grant and membership checks; no organization inventory, roles, owner email, billing, or tokens                     |
| Production incident metadata | Triage lifecycle, severity, timing, stack summary, and deploy context | Project authorization, existing redaction, fixed schemas, bounded strings/lists, no raw logs                               |
| Redacted debug artifacts     | Explain an existing bundle or reproduction                            | Existing artifacts only; no queueing/regeneration; 512 KiB structured-output ceiling; object keys/signed URLs omitted      |
| Runtime improvement evidence | Review stored deterministic improvement findings                      | Bounded existing summaries/artifacts; no analytics journeys or mutation                                                    |
| Aggregate product analytics  | Explain usage, routes, devices, acquisition, actions, funnels, transitions, and incident reach | Fixed lookbacks, lists at most 25, aggregate ledgers only; no individual journeys, custom dimensions, or bundle generation |
| Endpoint-health data         | Explain public endpoint failures and uptime trends                    | Sanitized display URLs; no userinfo/query/fragment, response body, redirect chain, request headers, or scheduler internals |
| Verified identity            | Authenticate and enforce workspace-domain restrictions                | OIDC `sub` and verified email only; no email in access tokens or tool results                                              |

## Universal exclusions

Raw logs, prompt/model content, individual analytics journey samples/sample IDs, raw analytics events, analytics opportunities/bundles/generation state, local filesystem/setup behavior, project/member tokens, authorization headers, cookies, object-store keys, signed URLs, database-only IDs, internal hashes, arbitrary custom dimensions, mutation results, and custom MCP UI are outside v1.

Customer-captured strings are untrusted data. Embedded instructions, links, credentials, or commands are never treated as authority and are covered by the negative review corpus.
