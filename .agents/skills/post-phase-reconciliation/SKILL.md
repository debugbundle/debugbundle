---
name: post-phase-reconciliation
description: Mandatory documentation sync after a phase ships
---

# Post-Phase Doc Reconciliation

After all slices in a phase are green and committed, run this reconciliation before moving on.

## Steps

1. Diff all files changed in the phase.
2. Cross-reference against:
   - `/spec/*`
   - `/contracts/*`
   - `/rules/*`
   - `/SYSTEM_OVERVIEW.md`
   - `/ARCHITECTURE_MAP.md`
3. Update any doc that no longer matches implemented reality.
4. Update the local `/STATUS.md` tracker when present — move completed items with key details of what was done.
5. Verify `/rules/glossary.md` — any new terms introduced must be defined.

## Rules

- This is not "update docs when you remember." It is a mandatory step at every phase boundary.
- If architecture or module boundaries changed, `SYSTEM_OVERVIEW.md` and `ARCHITECTURE_MAP.md` must be updated.
