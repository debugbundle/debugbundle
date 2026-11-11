# ChatGPT saved-report reads

FR-BUS-08 / AC-BUS-10; local OpenAI plugin candidate 1.1.0. The frozen v1
twenty-three declarations and JSON schemas remain unchanged. The two additive
declarations are in `packages/mcp-core/src/contracts/report-tool-contracts.json`;
their portable JSON schemas are generated into `report-schemas.json` and checked
against runtime declarations. The local package records both contract/schema
hashes and keeps provider re-scan/reviewer acceptance as separate release gates.

Tool display titles and descriptions use **saved reports**, covering authorised
factual reports and Business Smart Reports. This copy-only naming update preserves
tool names, contract version, schemas, scopes and annotations. The report metadata
fixture follows those labels; the original twenty-three declarations stay frozen.

| Tool                 | Input                                      | Output                                                                                                                       |
| -------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `list_reports`       | Optional `limit` 1–25 and bounded `cursor` | Whole-scope-readable saved runs with name, status, UTC period, privacy mode, dates and project count; cursor.                |
| `get_report_content` | One UUID `reportId`                        | Saved canonical facts, recorded resolutions, narrative/priorities, coverage, analysis availability/model and archive expiry. |

Both require **`debugbundle:reports:read`**. Existing grants are unchanged; the
scope must be requested and explicitly consented. The actual authenticated OAuth
user, grant and organisation are retained as a distinct read authority. No tool
accepts organisation/actor IDs, credentials, origins or arbitrary URLs. Current
membership, grant scope/revocation/expiry, suspension and access to every frozen
project/origin are checked through shared report readers, before and after bounded
private object I/O. A mixed narrative is returned whole or withheld. Generation
initiators, queued jobs and recipients retain their existing credential contracts.

Reads remain available after a trial/plan ends only while the archive is retained
and the reader still has complete access. Privacy invalidation, deletion or expiry
withholds the report. A missing or pending report does not trigger generation.
Output is strict, currently redacted and limited to 512 KiB. If current sanitisation
would alter a canonical report, it is withheld rather than post-filtered. Captured
and generated prose is untrusted data, never tool instructions. No raw object keys,
signed URLs, initiating identities, recipient identities, private request hashes
or provider receipts appear. Content reads use the existing artifact rate budget.

The injected implementation exposes only report list and content read methods.
There is no AI, PDF preparation, email, definition editing or customer-state writer.
The official [OpenAI authentication guidance](https://developers.openai.com/plugins/build/auth#triggering-authentication-ui)
requires declared tool scopes plus runtime scope/token checks and authentication
challenges; the existing connection flow implements these for the new scope.

Generate portable wire schemas with `make openai-report-schema-generate`, validate
with the data-free `make openai-plugin-inspector-check`, and qualify live grant,
mixed-project and mid-read revocation against disposable Postgres. These local
checks do not claim current hosted connection/provider acceptance.
