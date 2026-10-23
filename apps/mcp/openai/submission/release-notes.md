# DebugBundle 1.0.2

Portal-package authentication correction.

- Explicitly declares OAuth with `client.mode: "cimd"` under the remote server's `extensions["com.openai"].auth` in the generated `.mcp.json`.
- Includes no client ID, client secret, bearer header, or endpoint override; discovery and the approved CIMD identity continue to govern authentication.
- Retains the existing `private_key_jwt` provider policy, OAuth scopes, twenty-three read-only tools, wire contract `1.0.0`, and 1.0.1 skill guidance.
- Owner-supplied source revealed that the portal's CIMD predicate rejected `private_key_jwt`-only metadata before saving. A temporary local predicate correction cleared that portal blocker. Owner screenshots now show configured/authorized MCP, verified domain, all twenty-three expected tools and no findings in the latest scan. The provider policy is unchanged. Skill checks pass; reviewer information, review and publication remain separate gates.

## 1.0.1

Skill-routing correction for hosts where the read-only OpenAI connection and the separately authenticated DebugBundle CLI coexist.

- Check for the local CLI before reporting a requested mutation unavailable.
- Require safe connection inspection, explicit project scope, exact current records, user authorization, and a fresh readback.
- Preserve read-only user requests, credential separation, permission checks, and uncertainty after failed responses.
- The twenty-three MCP tools, OAuth permissions, wire contract version `1.0.0`, and runtime are unchanged. The archived `tool-scan.json` remains historical 1.0.0 evidence, not a new skill acceptance run.
- This candidate includes CLI handoff acceptance scenarios; public submission/review/publication remain pending. Personal-marketplace reinstall is a separate local delivery step.

## 1.0.0

Initial combined OpenAI plugin release candidate.

- Adds a tailored production-debugging skill.
- Connects to the OAuth-protected read-only MCP endpoint at `https://mcp.debugbundle.com/mcp`.
- Exposes exactly twenty-three tools for authorized projects, incidents, existing redacted artifacts, stored runtime improvements, aggregate product analytics, and endpoint-health evidence.
- Uses bounded schema-valid structured results, field-level privacy projection, and sanitized health-check URLs.
- Does not expose mutations, raw logs, local files, individual analytics journeys/sample IDs, custom dimensions, analytics opportunities/bundles, tokens, signed URLs, hidden artifact generation, custom MCP UI, or external messaging.

This file describes a candidate. It is not evidence of deployment, OpenAI review, approval, publication, directory discovery, or announcement.
