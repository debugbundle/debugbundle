# Agent credential action alignment

Status: explicitly approved, implemented and verified locally. No commit, push or release.

Use the existing card-header action pattern, as in Project details and Analytics
overview. Move the existing Create agent credential button from CardContent to
CardHeader/CardAction, aligned to the right of the section heading with its normal
content width. Use the existing Button and PlusIcon conventions, card spacing,
colours, typography and focus styles. Keep the description readable and let the
header follow the existing responsive card pattern.

Keep the current accessible button label, loading/pending disabled states, dialog,
one-time secret display, permissions and credential behaviour. Reuse existing
primitives; add no component, token or interaction pattern.

This is a layout correction that preserves the existing restricted-credential
contract (NFR-SEC-13). Run the existing credential-management tests and focused
static/build checks. No browser inspection or credential creation is required.

Verification: all five existing credential-management tests pass after the move;
full typecheck, focused lint/format and candidate builds pass. The change reuses
CardAction and PlusIcon without changing handlers or credential permissions.
No browser or production action was performed. Receipts:
`.tmp/agent-credential-button-*-20261105.log`.
