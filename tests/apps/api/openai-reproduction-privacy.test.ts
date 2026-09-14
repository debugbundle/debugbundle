import { describe, expect, it } from "vitest";
import { mapReproduction } from "../../../apps/api/src/openai-mcp-projections.js";

describe("OpenAI reproduction privacy", () => {
  it.each(["UNKNOWN", "GET"])(
    "does not advertise legacy placeholder reproductions as feasible (%s)",
    (method) => {
      expect(
        mapReproduction({
          possible: true,
          confidence: 0.8,
          reason: "request_context_available",
          artifacts: {
            curl: `curl -X ${method} 'https://example.invalid/'`,
            json_spec: { method, url: "https://example.invalid/" }
          }
        })
      ).toMatchObject({ possible: false, confidence: 0.1, curl: null, httpie: null });
    }
  );
  it("does not launder excluded request data through stored command strings", () => {
    const output = mapReproduction({
      possible: true,
      confidence: 0.8,
      reason: "request_context_available",
      artifacts: {
        curl: "curl https://example.test/ -H 'x-openai-subject: private-person' --data-raw 'private-body'",
        httpie: "http POST https://example.test/ secret=private-body"
      }
    });
    expect(output).toMatchObject({ curl: null, httpie: null });
    expect(JSON.stringify(output)).not.toMatch(/private-person|private-body/);
  });
});
