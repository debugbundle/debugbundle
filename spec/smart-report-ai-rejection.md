# Smart Report AI rejection

Maps to FR-BUS-05/06, AC-BUS-05/06/07 and NFR-SCHEMA-05. This change
preserves factual reports, whole-scope authority, privacy, the Terra profile,
one paid attempt per logical run and the existing USD 1 monthly budget.

## Evidence and scope

A successful provider response can still be unusable: output may be incomplete,
refused, malformed or fail deterministic reference/prose/claim/priority/coverage
checks. Provider connectivity does not prove valid report analysis. Previously,
settlement discarded the precise code, leaving only `model_rejected` in the
canonical report. The original rejected response was not stored (`store:false`),
so its particular rejection cannot be reconstructed from usage or cost.

The private handoff records the affected run and receipts. An authenticated
read of that saved report allowed offline reconstruction of the exact original
request hash. No reason is inferred for the historic run, no receipt is rewritten,
and its factual document remains available.

The Owner approved a single isolated diagnostic request and flexibility on its
cap. The original profile and USD 0.02475 maximum were sufficient and stayed
unchanged. That exact-request diagnostic completed with valid JSON and narrative
shape, then was rejected as `report_claim_not_supported`: a highlight's references
did not support its claim kind. Validated usage was 2,444 input / 357 output
tokens; the local application cost calculation is USD 0.0046519, not independent
provider-invoice evidence. Only an allowlisted code, receipt/hash/usage and finite
structural categories were retained, never rejected prose. This establishes the
reproduced failure class; the historic run's discarded reason remains unknown.

The provider schema admitted every allowed reference for every highlight kind,
while correct local validation required kind-specific supporting facts. It could
therefore generate schema-valid claims that publication had to reject. New
generation now uses kind-dependent reference alternatives. This fixes that
decoder gap without accepting unsupported output or changing old documents.

## Implementation

- Persist an allowlisted, nullable `diagnostic_code` on model attempts. Unknown
  text becomes `report_diagnostic_unavailable`. Never retain prompts, rejected
  text, provider bodies, secrets or exception messages. Codes are operator-only;
  no public report/API/CLI/MCP/OpenAI schema changes.
- Preserve the released receipt hash projection exactly. Duplicate settled
  attempts keep their original diagnostic, including legacy NULL. Uncertain
  recovery keeps its first diagnostic and full allocation; definitive settlement
  can still settle actual known cost independently of publication authority.
- Classify explicit refusal and malformed JSON independently. Retain all
  validation and factual fallback. Rendering and recovery never buy another
  response. Fixed customer explanations are shared by dashboard, HTML/PDF and
  email; layout and interactions remain in the existing components.
- Restrict `recorded_resolution` to currently resolved sources with a period
  resolution event or positive recorded-resolution metrics; `observed_recovery`
  to health evidence with a period recovery observation; and `outstanding` to
  open/regressed sources. Omit a specialised kind when no supporting reference
  exists. General observed/inferred highlights remain available. The provider
  decoder uses nested `anyOf`, which is a supported Structured Outputs schema
  form ([official documentation](https://developers.openai.com/api/docs/guides/structured-outputs#supported-schemas)).
  Keep the canonical `ReportNarrativeSchema` and local validator unchanged so
  previously accepted reports remain readable, including mixed supporting refs.

## Migration and rollout

Apply additive `202611090001_add_report_model_diagnostics` with the normal
`db:migrate` runner before activating dependent API/worker images. No backfill,
bootstrap-on-installed-schema, data reset or destructive cleanup is required.
Readiness fails for a missing ledger entry, column or validated constraint.
Clean bootstrap adds the final column independently of old migration inputs.
The standard self-host Compose and hosted image/source rollout paths already
run migrations before dependent runtime. Older code ignores the nullable column;
retain it if rolling runtime code back. Deployment is a separate authorised action.

## Regression gates

The functional suites cover safe code projection and rejected-text exclusion;
real worker/client/store persistence with a synthetic provider; success, refusal,
incomplete/invalid/numeric output; lost responses and storage recovery without
paid retries; unchanged usage/cost/reservations; legacy NULL receipts and hash
replay; additive migration and preceding ledger preservation; missing physical
schema readiness; private access/privacy boundaries; and shared customer copy.
They also check the emitted provider schema against local claim validation
across every frozen fixture, not only the in-process Zod schema. These local
checks do not establish provider acceptance of the fixed schema or deployment.

Local qualification on 9–10 November: 179 report/interface tests pass (three
text-tool checks skipped in that container, then exercised by the explicit PDF
target); 46 report integration tests and seventeen storage-migration cases pass
across the latest runs; all sixteen explicit PDF/rendering cases pass. TypeScript,
focused lint/format and documentation formatting pass. The complete unit run
had 5,895 passes, 571 skips, two five-second timeouts and a stale startup
query-count expectation; all three files passed their isolated rerun at the
original time limits. The startup fixture now checks the new guard explicitly,
with an additional refusal-to-listen regression for missing diagnostic storage.
This is full-run plus focused-rerun evidence, not a claim of a clean full rerun.
Private command output is retained under
`.tmp/report-model-rejection-20261109/`. Pre-ship review confirms no public schema,
validation, receipt projection, access, allowance or retry-policy change.

The fixed saved-facts request has a new hash; its body is 642 bytes larger. The
largest frozen fixture adds 1,302 bytes. Offline reconstruction verifies that the
prior schema still reproduces the historic request hash exactly. Profiles, input
and output limits, paid-attempt allowance and USD 0.99 worst-case forty-run
reservation remain unchanged. Runtime still counts the entire request before
paid admission and fails closed above 12,000 input tokens.

Automatic approval review initially rejected a broader provider input-token check
because the approval covered one exact diagnostic request. No rejected action was
executed. The Owner subsequently explicitly approved a further fixed-schema paid
verification request and token-only checks for the nine synthetic fixtures.

All nine counters pass; maximum input is 10,930/12,000 tokens. The fixed saved-facts
request succeeds with 2,583 input / 372 output tokens and passes both model-client
and canonical document validation. Its local application cost calculation is
USD 0.0048873; combined with diagnosis, two explicitly authorised calls total
USD 0.0095392. Each local receipt had a durable pre-send intent and an independent
one-attempt guard. No report was regenerated, no production receipt or quota was
changed, and there were no implicit paid retries. This is direct provider success
for the fixed request, not a new paid nine-case quality evaluation or deployment.
An authenticated readback confirms the original canonical document's hash is
unchanged. The forty-run worst-case reservation plus these actual diagnostic
costs is USD 0.9995392, still below the existing USD 1 budget.
