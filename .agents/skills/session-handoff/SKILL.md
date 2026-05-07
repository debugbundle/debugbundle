---
name: session-handoff
description: Ensure clean session continuity when context is getting long or session is ending
---

# Session Handoff

Run this before ending a session or when context is getting long.

## Steps

1. Update the local `/STATUS.md` tracker when present with:
   - Current phase progress and in-progress items.
   - Any blockers or open questions.
2. Capture any decisions made during this session that aren't yet in `/spec/` or `/rules/`.
3. If mid-slice, note exactly where work stopped and what's next.

## Goal

Zero-cost handoff. The next session picks up without re-discovery.
