import { expect, it, vi } from "vitest";
import {
  buildReviewModelRequest,
  createReviewModelClient,
  REVIEW_PROFILE_VERSION
} from "../../../packages/smart-improvements/src/model-client.js";
import { configureImprovementReviews } from "../../../packages/smart-improvements/src/runtime-config.js";
import { reviewPlanningFixture } from "../../helpers/improvement-reviews.js";
import qualifiedFixtures from "../../../evals/smart-improvements/qualification-fixtures-20261111.json" with { type: "json" };
import qualifiedResults from "../../../evals/smart-improvements/qualification-20261111.json" with { type: "json" };
import { ReviewFactsSchema } from "../../../packages/smart-improvements/src/review-contract.js";
import { reviewFactsFixture } from "../../helpers/improvement-reviews.js";
import { reportTestUsage } from "../../helpers/report-runs.js";
const guidance = {
  version: 1,
  investigations: [
    {
      title: "Investigate the failure",
      hypothesis: "A retry path may amplify the observed failure.",
      checks: ["Inspect the linked evidence and reproduce the observed path."],
      evidence_refs: ["e1"]
    }
  ]
};
const response = (value: unknown): Response => new Response(JSON.stringify(value));
it("preserves the exact qualified v1 request bytes and the no-data refusal", () => {
  for (const fixture of qualifiedFixtures) {
    const facts = ReviewFactsSchema.parse(fixture.facts);
    if (facts.sources.length === 0) {
      expect(() => buildReviewModelRequest(facts)).toThrow("review_no_model_evidence");
      continue;
    }
    const saved = qualifiedResults.cases.find((c) => c.id === fixture.id);
    expect(saved).toBeDefined();
    expect(buildReviewModelRequest(facts).request_hash).toBe(saved!.request_sha256);
  }
});
it("requires qualification of the changed prompt through the existing AI quality gate", () => {
  const env = {
    SMART_IMPROVEMENTS_ENABLED: "true",
    SMART_IMPROVEMENTS_AI_ENABLED: "true",
    SMART_IMPROVEMENTS_AI_API_KEY: "sk-synthetic-evaluation"
  };
  expect(
    configureImprovementReviews({
      ...env,
      SMART_IMPROVEMENTS_AI_QUALIFIED_PROFILE: "weekly-review-terra-v1"
    }).model
  ).toBeNull();
  expect(
    configureImprovementReviews({
      ...env,
      SMART_IMPROVEMENTS_AI_QUALIFIED_PROFILE: REVIEW_PROFILE_VERSION
    }).model
  ).not.toBeNull();
});
it("projects safe configuration and binds guidance to deterministic plans within one attempt", async () => {
  const artifact = reviewPlanningFixture();
  const request = buildReviewModelRequest(artifact.facts, artifact.context);
  expect(request.body).not.toContain(artifact.facts.project_id);
  expect(request.body).not.toContain(artifact.facts.sources[0]!.source_id!);
  expect(request.body).toContain("server plans");
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(response({ object: "response.input_tokens", input_tokens: 100 }))
    .mockResolvedValueOnce(response(envelope()));
  const prepared = await createReviewModelClient({
    apiKey: "sk-synthetic-evaluation",
    fetch
  }).prepare({ facts: artifact.facts, context: artifact.context, identities: [] });
  expect((await prepared.run(async () => {})).state).toBe("succeeded");
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("requests symptom-specific comparisons and distinct monitor checks only for planned guidance", () => {
  const artifact = reviewPlanningFixture();
  const request = JSON.parse(buildReviewModelRequest(artifact.facts, artifact.context).body) as {
    input: Array<{ content: Array<{ text: string }> }>;
  };
  const instructions = request.input[0]!.content[0]!.text;
  for (const constraint of [
    "with and without",
    "previously successful",
    "observation windows",
    "omit a redundant investigation",
    "do not invent"
  ])
    expect(instructions).toContain(constraint);
});
it("falls back after repeated monitor prose without buying another response", async () => {
  const artifact = reviewPlanningFixture();
  artifact.facts.sources[0]!.kind = "health";
  artifact.facts.sources[0]!.status = "failing";
  artifact.facts.sources.push({ ...artifact.facts.sources[0]!, ref: "e2" });
  artifact.context.signals.push({ ...artifact.context.signals[0]!, source_ref: "e2" });
  const repeated = {
    version: 1,
    investigations: ["e1", "e2"].map((ref) => ({
      title: "Inspect the failing monitor",
      hypothesis: null,
      checks: ["Inspect the retained failure and current recovery evidence."],
      evidence_refs: [ref]
    }))
  };
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(response({ object: "response.input_tokens", input_tokens: 100 }))
    .mockResolvedValueOnce(
      response(
        envelope({
          output: [
            {
              type: "message",
              role: "assistant",
              status: "completed",
              content: [{ type: "output_text", text: JSON.stringify(repeated), annotations: [] }]
            }
          ]
        })
      )
    );
  const attempt = await createReviewModelClient({
    apiKey: "sk-synthetic-evaluation",
    fetch
  }).prepare({
    facts: artifact.facts,
    context: artifact.context,
    identities: []
  });
  expect(await attempt.run(async () => {})).toMatchObject({ state: "rejected", guidance: null });
  await expect(attempt.run(async () => {})).rejects.toThrow("review_attempt_already_used");
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("gives the model explicit linked evidence and a bounded investigation and verification rubric", () => {
  const facts = reviewFactsFixture();
  facts.sources.push({
    ...facts.sources[0]!,
    ref: "e2",
    kind: "improvement",
    related_refs: ["e1"]
  });
  const request = JSON.parse(buildReviewModelRequest(facts).body) as {
    input: Array<{ content: Array<{ text: string }> }>;
  };
  const evidence = JSON.parse(request.input[1]!.content[0]!.text) as {
    sources: Array<{ related_refs?: string[] }>;
  };
  expect(evidence.sources[1]!.related_refs).toEqual(["e1"]);
  const instructions = request.input[0]!.content[0]!.text;
  for (const constraint of [
    "disprove",
    "denominator",
    "regression",
    "content marketing",
    "related_refs",
    "generic"
  ])
    expect(instructions).toContain(constraint);
});
function envelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "resp_review_fixture",
    model: "gpt-6.1-terra",
    service_tier: "default",
    status: "completed",
    usage: reportTestUsage,
    output: [
      {
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: JSON.stringify(guidance), annotations: [] }]
      }
    ],
    ...overrides
  };
}
it("allowlists every restricted provider string and excludes private project/source identities", () => {
  const facts = reviewFactsFixture();
  facts.sources[0]!.title = "HiddenAcme at https://private.test with token=secret-value";
  facts.sources[0]!.context = "HiddenAcme source";
  facts.sources[0]!.observation = "HiddenAcme source";
  facts.sources[0]!.status = "HiddenAcme";
  facts.limitations = ["HiddenAcme context"];
  const request = buildReviewModelRequest(facts);
  for (const body of [request.body, request.counter_body]) {
    for (const privateValue of [
      "HiddenAcme",
      "private.test",
      "secret-value",
      facts.project_id,
      facts.sources[0]!.source_id!
    ])
      expect(body).not.toContain(privateValue);
    expect(body).toContain('"e1"');
  }
  facts.sources = [];
  expect(() => buildReviewModelRequest(facts)).toThrow("review_no_model_evidence");
});
it("minimises full-mode sources and never offers tools or external destinations", () => {
  const facts = reviewFactsFixture();
  facts.privacy_mode = "full";
  facts.sources[0]!.context = "See https://private.test with owner@example.test";
  const parsed = JSON.parse(buildReviewModelRequest(facts).body) as {
    input: Array<{ content: Array<{ text: string }> }>;
    tools: unknown[];
    tool_choice: string;
    store: boolean;
  };
  expect(parsed.tools).toEqual([]);
  expect(parsed.tool_choice).toBe("none");
  expect(parsed.store).toBe(false);
  expect(parsed.input[1]!.content[0]!.text).not.toContain("private.test");
  expect(parsed.input[1]!.content[0]!.text).not.toContain("owner@example.test");
});
it("uses the one-attempt bound and persists the callback before sending", async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(response({ object: "response.input_tokens", input_tokens: 100 }))
    .mockResolvedValueOnce(response(envelope()));
  const client = createReviewModelClient({ apiKey: "sk-synthetic-evaluation", fetch });
  const prepared = await client.prepare({
    facts: reviewFactsFixture(),
    identities: ["HiddenAcme"]
  });
  const before = vi.fn(async () => {
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  expect(await prepared.run(before)).toMatchObject({ state: "succeeded", guidance });
  expect(before).toHaveBeenCalledOnce();
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[0]?.[0]).toBe("https://api.openai.com/v1/responses/input_tokens");
  await expect(prepared.run(before)).rejects.toThrow("review_attempt_already_used");
});
it.each([
  { status: "incomplete" },
  { model: "wrong" },
  { usage: null },
  { service_tier: "priority" },
  { output: [{ type: "function_call" }] },
  {
    output: [
      {
        type: "message",
        role: "assistant",
        status: "completed",
        content: [
          {
            type: "output_text",
            text: JSON.stringify({
              ...guidance,
              investigations: [{ ...guidance.investigations[0], title: "HiddenAcme needs review" }]
            }),
            annotations: []
          }
        ]
      }
    ]
  }
])("does not retry rejected or uncertain provider output %j", async (overrides) => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(response({ object: "response.input_tokens", input_tokens: 100 }))
    .mockResolvedValueOnce(response(envelope(overrides)));
  const attempt = await createReviewModelClient({
    apiKey: "sk-synthetic-evaluation",
    fetch
  }).prepare({ facts: reviewFactsFixture(), identities: ["HiddenAcme"] });
  expect((await attempt.run(async () => {})).state).not.toBe("succeeded");
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("fails preflight before a paid request, and treats a paid transport loss as uncertainty", async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(response({ object: "response.input_tokens", input_tokens: 12001 }));
  const client = createReviewModelClient({ apiKey: "sk-synthetic-evaluation", fetch });
  await expect(client.prepare({ facts: reviewFactsFixture(), identities: [] })).rejects.toThrow(
    "review_input_limit_exceeded"
  );
  expect(fetch).toHaveBeenCalledOnce();
  fetch
    .mockResolvedValueOnce(response({ object: "response.input_tokens", input_tokens: 100 }))
    .mockRejectedValueOnce(new Error("network loss"));
  const attempt = await client.prepare({ facts: reviewFactsFixture(), identities: [] });
  expect(await attempt.run(async () => {})).toEqual({
    state: "uncertain",
    maximum_nano_usd: 24750000
  });
});
it("requires the separate qualification marker and explicit AI flag", () => {
  const env = {
    SMART_IMPROVEMENTS_ENABLED: "true",
    SMART_IMPROVEMENTS_AI_ENABLED: "true",
    SMART_IMPROVEMENTS_AI_API_KEY: "sk-synthetic-evaluation"
  };
  expect(configureImprovementReviews({})).toEqual({ enabled: false, model: null });
  expect(configureImprovementReviews(env)).toEqual({ enabled: true, model: null });
  expect(
    configureImprovementReviews({
      ...env,
      SMART_IMPROVEMENTS_AI_QUALIFIED_PROFILE: REVIEW_PROFILE_VERSION
    }).model
  ).not.toBeNull();
});
