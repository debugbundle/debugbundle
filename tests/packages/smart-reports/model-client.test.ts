import { describe, expect, it, vi } from "vitest";
import cases from "../../../evals/smart-reports/cases.json" with { type: "json" };
import { createReportModelClient } from "../../../packages/smart-reports/src/model-client.js";
const narrative = {
  version: 1,
  overview: { text: "The observed period was quiet.", evidence_refs: ["p01_coverage"] },
  highlights: [],
  priorities: [],
  limitations: []
};
const usage = {
  input_tokens: 1000,
  output_tokens: 500,
  total_tokens: 1500,
  input_tokens_details: {
    cached_tokens: 0,
    cache_write_tokens: 0,
    cache_write_tokens_details: { ttl_30m_tokens: 0, ttl_12h_tokens: 0 }
  },
  output_tokens_details: { reasoning_tokens: 0 }
};
function response(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200 });
}
function completed(overrides: Record<string, unknown> = {}) {
  return {
    id: "resp_synthetic",
    model: "gpt-6-luna",
    service_tier: "default",
    status: "completed",
    usage,
    output: [
      {
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: JSON.stringify(narrative), annotations: [] }]
      }
    ],
    ...overrides
  };
}
describe("budgeted report model client", () => {
  it("keeps restricted identity metadata out of both requests and rejects an identity-bearing response once", async () => {
    const facts = structuredClone(cases.cases[0]!.facts);
    facts.privacy_mode = "restricted";
    facts.projects[0]!.notes = ["HiddenAcme has partial coverage."];
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ object: "response.input_tokens", input_tokens: 1000 }))
      .mockResolvedValueOnce(
        response(
          completed({
            output: [
              {
                type: "message",
                role: "assistant",
                status: "completed",
                content: [
                  {
                    type: "output_text",
                    annotations: [],
                    text: JSON.stringify({
                      ...narrative,
                      overview: {
                        ...narrative.overview,
                        text: "HiddenAcme observations need review."
                      },
                      limitations: [
                        {
                          text: "Restricted evidence limits interpretation.",
                          evidence_refs: ["p01_coverage"]
                        }
                      ]
                    })
                  }
                ]
              }
            ]
          })
        )
      );
    const attempt = await createReportModelClient({
      apiKey: "sk-synthetic-evaluation",
      fetch: request
    }).prepare({ model: "gpt-6-luna", facts, identities: ["HiddenAcme"] });
    expect(await attempt.run(async () => {})).toMatchObject({
      state: "rejected",
      reason: "report_unsafe_prose",
      usage
    });
    for (const [, init] of request.mock.calls) expect(init?.body).not.toContain("HiddenAcme");
    expect(request).toHaveBeenCalledTimes(2);
    await expect(attempt.run(async () => {})).rejects.toThrow("report_attempt_already_used");
  });
  it("preflights the full prompt/schema then requires a durable admission before a single paid request", async () => {
    const order: string[] = [],
      request = vi.fn<typeof fetch>().mockImplementation(async (url) => {
        if (typeof url !== "string") throw new Error("expected_fixed_url");
        order.push(url.endsWith("/input_tokens") ? "count" : "send");
        return url.endsWith("/input_tokens")
          ? response({ object: "response.input_tokens", input_tokens: 1000 })
          : response(completed());
      });
    const client = createReportModelClient({ apiKey: "sk-synthetic-evaluation", fetch: request });
    const prepared = await client.prepare({ model: "gpt-6-luna", facts: cases.cases[0]!.facts });
    const result = await prepared.run(async () => {
      order.push("reserve");
    });
    expect(order).toEqual(["count", "reserve", "send"]);
    expect(result.state).toBe("succeeded");
    expect(result).toHaveProperty("cost_nano_usd");
    const encoded = request.mock.calls[1]?.[1]?.body;
    if (typeof encoded !== "string") throw new Error("expected_json_body");
    const body = JSON.parse(encoded);
    expect(body).toMatchObject({
      store: false,
      service_tier: "default",
      tools: [],
      tool_choice: "none",
      truncation: "disabled",
      reasoning: { effort: "none" },
      prompt_cache_options: { mode: "explicit", ttl: "30m" },
      max_output_tokens: 8000
    });
    expect(body.text.format).toMatchObject({ type: "json_schema", strict: true });
    expect(body.text.format.schema).toHaveProperty("$defs");
    expect(body.text.format.schema).not.toHaveProperty("definitions");
    expect(JSON.stringify(body)).not.toContain("sk-synthetic");
  });
  it("refuses a candidate input limit without silently dropping source facts", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response({ object: "response.input_tokens", input_tokens: 12001 }));
    const client = createReportModelClient({ apiKey: "sk-synthetic-evaluation", fetch: request });
    await expect(
      client.prepare({ model: "gpt-6.1-terra", facts: cases.cases[1]!.facts })
    ).rejects.toThrow("report_input_limit_exceeded");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("does not call the model when durable admission or current authorisation refuses", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response({ object: "response.input_tokens", input_tokens: 1000 }));
    const client = createReportModelClient({ apiKey: "sk-synthetic-evaluation", fetch: request });
    const prepared = await client.prepare({ model: "gpt-6-luna", facts: cases.cases[0]!.facts });
    await expect(
      prepared.run(async () => {
        throw new Error("report_budget_unavailable");
      })
    ).rejects.toThrow("report_budget_unavailable");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("retains only the safe preflight HTTP status and never a provider error body", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("sensitive provider error", { status: 401 }));
    const client = createReportModelClient({ apiKey: "sk-synthetic-evaluation", fetch: request });
    await expect(
      client.prepare({ model: "gpt-6-luna", facts: cases.cases[0]!.facts })
    ).rejects.toThrow("report_preflight_http_401");
  });
  it("settles known paid usage even when output is rejected, without retrying", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ object: "response.input_tokens", input_tokens: 1000 }))
      .mockResolvedValueOnce(response(completed({ status: "incomplete", output: [] })));
    const prepared = await createReportModelClient({
      apiKey: "sk-synthetic-evaluation",
      fetch: request
    }).prepare({ model: "gpt-6-luna", facts: cases.cases[0]!.facts });
    expect(await prepared.run(async () => {})).toMatchObject({
      state: "rejected",
      reason: "report_output_incomplete",
      usage
    });
    expect(request).toHaveBeenCalledTimes(2);
  });
  it.each([
    "Contact private@example.test for the evidence.",
    "The captured password=orchid needs review.",
    "The captured Bearer abcdefgh needs review."
  ])("rejects prose that the private report reader would withhold: %s", async (text) => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ object: "response.input_tokens", input_tokens: 1000 }))
      .mockResolvedValueOnce(
        response(
          completed({
            output: [
              {
                type: "message",
                role: "assistant",
                status: "completed",
                content: [
                  {
                    type: "output_text",
                    annotations: [],
                    text: JSON.stringify({
                      ...narrative,
                      overview: { ...narrative.overview, text }
                    })
                  }
                ]
              }
            ]
          })
        )
      );
    const prepared = await createReportModelClient({
      apiKey: "sk-synthetic-evaluation",
      fetch: request
    }).prepare({ model: "gpt-6-luna", facts: cases.cases[0]!.facts });
    const outcome = await prepared.run(async () => {});
    expect(outcome).toMatchObject({ state: "rejected", reason: "report_unsafe_prose", usage });
    expect(outcome).not.toHaveProperty("narrative");
    expect(JSON.stringify(outcome)).not.toContain(text);
    await expect(prepared.run(async () => {})).rejects.toThrow("report_attempt_already_used");
    expect(request).toHaveBeenCalledTimes(2);
  });
  it.each([
    [
      {
        type: "output_text",
        text: JSON.stringify({
          ...narrative,
          highlights: [
            {
              kind: "outstanding",
              text: "The linked observation describes active work.",
              evidence_refs: ["p01_coverage"]
            }
          ]
        }),
        annotations: []
      },
      "report_claim_not_supported"
    ],
    [{ type: "refusal", refusal: "private refusal text" }, "report_model_refused"],
    [
      { type: "output_text", text: "not JSON: private text", annotations: [] },
      "report_invalid_json"
    ],
    [{ type: "output_text", text: "{}", annotations: [] }, "report_invalid_narrative"],
    [
      {
        type: "output_text",
        text: JSON.stringify({
          ...narrative,
          overview: { text: "Untrusted fact.", evidence_refs: ["unknown"] }
        }),
        annotations: []
      },
      "report_unknown_reference"
    ]
  ])(
    "classifies unusable paid output without retaining its text or retrying",
    async (content, reason) => {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(response({ object: "response.input_tokens", input_tokens: 1000 }))
        .mockResolvedValueOnce(
          response(
            completed({
              output: [
                { type: "message", role: "assistant", status: "completed", content: [content] }
              ]
            })
          )
        );
      const prepared = await createReportModelClient({
        apiKey: "sk-synthetic-evaluation",
        fetch: request
      }).prepare({ model: "gpt-6-luna", facts: cases.cases[0]!.facts });
      const result = await prepared.run(async () => {});
      expect(result).toMatchObject({ state: "rejected", reason, usage });
      expect(JSON.stringify(result)).not.toContain("private");
      await expect(prepared.run(async () => {})).rejects.toThrow("report_attempt_already_used");
      expect(request).toHaveBeenCalledTimes(2);
    }
  );
  it("retains an uncertain reservation for missing usage, transport failures and unexpected tools", async () => {
    for (const result of [
      completed({ usage: null }),
      completed({ output: [{ type: "function_call", name: "unexpected" }] })
    ]) {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(response({ object: "response.input_tokens", input_tokens: 1000 }))
        .mockResolvedValueOnce(response(result));
      const prepared = await createReportModelClient({
        apiKey: "sk-synthetic-evaluation",
        fetch: request
      }).prepare({ model: "gpt-6-luna", facts: cases.cases[0]!.facts });
      const outcome = await prepared.run(async () => {});
      expect(outcome.state).toBe(result.usage === null ? "uncertain" : "rejected");
      expect(request).toHaveBeenCalledTimes(2);
    }
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ object: "response.input_tokens", input_tokens: 1000 }))
      .mockRejectedValueOnce(new Error("secret provider error"));
    const prepared = await createReportModelClient({
      apiKey: "sk-synthetic-evaluation",
      fetch: request
    }).prepare({ model: "gpt-6-luna", facts: cases.cases[0]!.facts });
    const outcome = await prepared.run(async () => {});
    expect(outcome.state).toBe("uncertain");
    expect(JSON.stringify(outcome)).not.toContain("secret");
  });
});
