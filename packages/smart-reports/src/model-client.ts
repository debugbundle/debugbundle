import { z } from "zod";
import { nodeFetch } from "../../node-http/src/index.js";
import {
  actualReportAttemptCost,
  ReportModelUsageSchema,
  type ReportAttemptProfile,
  type ReportModelId
} from "./model-cost.js";
import { validateReportNarrative, type ReportNarrative } from "./model-narrative.js";
import { buildReportModelRequest } from "./model-request.js";
import { redactReportData } from "./report-redaction.js";

type Usage = z.infer<typeof ReportModelUsageSchema>;
type Settled = {
  usage: Usage;
  cost_nano_usd: number;
  provider_response_id: string;
  elapsed_ms: number;
};
export type ReportModelAttemptOutcome =
  | (Settled &
      ({ state: "succeeded"; narrative: ReportNarrative } | { state: "rejected"; reason: string }))
  | { state: "uncertain"; reason: string; maximum_nano_usd: number; elapsed_ms: number };
export interface PreparedReportModelAttempt {
  input_tokens: number;
  profile: ReportAttemptProfile;
  request_hash: string;
  maximum_nano_usd: number;
  run(beforeSend: () => Promise<void>): Promise<ReportModelAttemptOutcome>;
}
export interface ReportModelClient {
  prepare(input: { model: ReportModelId; facts: unknown }): Promise<PreparedReportModelAttempt>;
}
export class ReportModelInputLimitError extends Error {
  constructor(
    readonly input_tokens: number,
    readonly maximum_input_tokens: number
  ) {
    super("report_input_limit_exceeded");
    this.name = "ReportModelInputLimitError";
  }
}
async function boundedJson(response: Response, maxBytes: number): Promise<unknown> {
  const body = response.body;
  if (body === null) throw new Error("report_provider_body_missing");
  const reader = body.getReader(),
    chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > maxBytes) throw new Error("report_provider_body_exceeded");
      chunks.push(next.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
const responseSchema = z
  .object({
    id: z.string().regex(/^resp_[A-Za-z0-9_-]{1,200}$/),
    model: z.string().max(128),
    service_tier: z.string().max(50),
    status: z.string().max(50),
    usage: ReportModelUsageSchema.nullable(),
    output: z.array(z.object({ type: z.string() }).passthrough()).max(20)
  })
  .passthrough();
const messageSchema = z
  .object({
    type: z.literal("message"),
    role: z.literal("assistant"),
    status: z.literal("completed"),
    content: z
      .array(
        z
          .object({
            type: z.literal("output_text"),
            text: z.string().max(128 * 1024),
            annotations: z.array(z.unknown()).max(0)
          })
          .passthrough()
      )
      .length(1)
  })
  .passthrough();
const validationReasons = new Set([
  "report_untrusted_link",
  "report_numeric_prose",
  "report_unsafe_prose",
  "report_unknown_reference",
  "report_claim_not_supported",
  "report_priority_not_supported",
  "report_priority_missing",
  "report_coverage_missing"
]);

/** Fixed-origin, bounded, single-attempt transport. The caller authorises the
 * whole scope before preflight and durably reserves each attempt in beforeSend.
 * Unknown outcomes retain that reservation; this client never retries. */
export function createReportModelClient(input: {
  apiKey: string;
  fetch?: typeof globalThis.fetch;
}): ReportModelClient {
  const apiKey = input.apiKey.trim();
  if (!/^sk-[A-Za-z0-9_-]{12,508}$/.test(apiKey)) throw new Error("report_invalid_api_key");
  const fetch = input.fetch ?? nodeFetch;
  async function post(
    path: "/responses" | "/responses/input_tokens",
    body: string,
    timeout: number
  ): Promise<Response> {
    return fetch(`https://api.openai.com/v1${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body,
      redirect: "error",
      credentials: "omit",
      signal: AbortSignal.timeout(timeout)
    });
  }
  return {
    async prepare(raw) {
      const prepared = buildReportModelRequest(raw);
      let count: number;
      try {
        const response = await post("/responses/input_tokens", prepared.counter_body, 15_000);
        if (!response.ok) {
          await response.body?.cancel();
          throw new Error(`report_preflight_http_${response.status}`);
        }
        count = z
          .object({
            object: z.literal("response.input_tokens"),
            input_tokens: z.number().int().positive()
          })
          .parse(await boundedJson(response, 8192)).input_tokens;
      } catch (error) {
        if (error instanceof Error && /^report_preflight_http_\d{3}$/.test(error.message))
          throw error;
        throw new Error("report_input_preflight_failed");
      }
      if (count > prepared.profile.max_input_tokens)
        throw new ReportModelInputLimitError(count, prepared.profile.max_input_tokens);
      let used = false;
      return {
        input_tokens: count,
        profile: Object.freeze({ ...prepared.profile }),
        request_hash: prepared.request_hash,
        maximum_nano_usd: prepared.maximum_nano_usd,
        async run(beforeSend) {
          if (used) throw new Error("report_attempt_already_used");
          used = true;
          await beforeSend();
          const started = Date.now();
          const uncertain = (reason: string): ReportModelAttemptOutcome => ({
            state: "uncertain",
            reason,
            maximum_nano_usd: prepared.maximum_nano_usd,
            elapsed_ms: Date.now() - started
          });
          let envelope: z.infer<typeof responseSchema>;
          try {
            const response = await post("/responses", prepared.body, 55_000);
            if (!response.ok) {
              await response.body?.cancel();
              return uncertain(`report_provider_http_${response.status}`);
            }
            const parsed = responseSchema.safeParse(await boundedJson(response, 256 * 1024));
            if (!parsed.success || parsed.data.usage === null)
              return uncertain("report_usage_unavailable");
            envelope = parsed.data;
          } catch {
            return uncertain("report_provider_outcome_unknown");
          }
          const usage = envelope.usage!;
          if (
            envelope.model !== prepared.profile.model ||
            envelope.service_tier !== "default" ||
            usage.input_tokens > prepared.profile.max_input_tokens ||
            usage.output_tokens > prepared.profile.max_output_tokens ||
            usage.input_tokens_details.cache_write_tokens_details.ttl_12h_tokens !== 0
          )
            return uncertain("report_unexpected_billing_profile");
          const cost = actualReportAttemptCost({
            model: prepared.profile.model,
            regional_processing: prepared.profile.regional_processing,
            usage
          });
          if (cost > prepared.maximum_nano_usd) return uncertain("report_usage_out_of_bounds");
          const settled: Settled = {
            usage,
            cost_nano_usd: cost,
            provider_response_id: envelope.id,
            elapsed_ms: Date.now() - started
          };
          if (envelope.status !== "completed")
            return { ...settled, state: "rejected", reason: "report_output_incomplete" };
          const messages = envelope.output.filter((item) => item.type === "message");
          if (
            messages.length !== 1 ||
            envelope.output.some((item) => !["message", "reasoning"].includes(item.type))
          )
            return { ...settled, state: "rejected", reason: "report_unexpected_model_output" };
          const message = messageSchema.safeParse(messages[0]);
          const refusal = messageSchema
            .extend({
              content: z
                .array(
                  z
                    .object({ type: z.literal("refusal"), refusal: z.string().max(128 * 1024) })
                    .passthrough()
                )
                .length(1)
            })
            .safeParse(messages[0]);
          if (refusal.success)
            return { ...settled, state: "rejected", reason: "report_model_refused" };
          if (!message.success)
            return { ...settled, state: "rejected", reason: "report_invalid_model_message" };
          let parsedNarrative: unknown;
          try {
            parsedNarrative = JSON.parse(message.data.content[0]!.text);
          } catch {
            return { ...settled, state: "rejected", reason: "report_invalid_json" };
          }
          try {
            const narrative = validateReportNarrative(prepared.facts, parsedNarrative);
            // Readers withhold a whole report if mandatory privacy projection
            // changes its prose. Reject before persisting a successful receipt,
            // so unsafe output leaves a readable factual report, never a false ready.
            if (JSON.stringify(redactReportData(narrative)) !== JSON.stringify(narrative))
              throw new Error("report_unsafe_prose");
            return { ...settled, state: "succeeded", narrative };
          } catch (error) {
            return {
              ...settled,
              state: "rejected",
              reason:
                error instanceof Error && validationReasons.has(error.message)
                  ? error.message
                  : "report_invalid_narrative"
            };
          }
        }
      };
    }
  };
}
