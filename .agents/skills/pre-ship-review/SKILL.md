---
name: pre-ship-review
description: Structured "what can still break" audit before marking a phase or slice complete
---

# Pre-Ship Review

Before updating the local STATUS tracker to mark any phase or slice as complete, run this checklist.

## Checklist

1. **Inventory** — List every changed module, route, and data path in this slice.
2. **Failure modes** — For each: what happens under bad input, concurrency, partial failure, edge-case state?
3. **Trust boundaries** — Does untrusted data cross into privileged contexts anywhere?
4. **Resource cleanup** — Leaked connections, orphaned files, dangling references?
5. **Contract alignment** — Does the implementation still match `/contracts/` and `/spec/`?
6. **Test coverage** — Are all changed paths covered? Any missing edge-case tests?
7. **Schema/deploy safety** — If this slice touches database shape or schema-dependent runtime behavior, does it use a real forward migration, does deploy run that migration before new code starts, and is any destructive cleanup deferred to a later release?

## Rules

- If any issue is found, fix it before marking green.
- This is not optional polish — it is the final gate before a slice ships.
- Do not skip this review under time pressure.
- Post-production slices that change the database must explicitly reject bootstrap-as-migration shortcuts and destructive-in-place schema edits.
