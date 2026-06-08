import { describe, expect, it } from "vitest";

import { RETRIEVAL_MCP_TOOL_NAMES } from "../../../apps/mcp/src/retrieval-tools.js";

describe("mcp retrieval tools parity", () => {
  it("declares retrieval tool parity", () => {
    expect(RETRIEVAL_MCP_TOOL_NAMES).toEqual([
      "list_incidents",
      "get_incident",
      "get_incident_context",
      "resolve_incident",
      "resolve_incidents",
      "reopen_incident",
      "reopen_incidents",
      "get_bundle",
      "get_reproduction",
      "get_logs"
    ]);
  });
});
