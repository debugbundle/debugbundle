import { z } from "zod";
import { nodeFetch } from "../../node-http/src/index.js";
import { ReportModelUsageSchema } from "./model-cost.js";

export async function boundedJson(response: Response, maxBytes: number): Promise<unknown> {
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
export const responseSchema = z
  .object({
    id: z.string().regex(/^resp_[A-Za-z0-9_-]{1,200}$/),
    model: z.string().max(128),
    service_tier: z.string().max(50),
    status: z.string().max(50),
    usage: ReportModelUsageSchema.nullable(),
    output: z.array(z.object({ type: z.string() }).passthrough()).max(20)
  })
  .passthrough();
export const messageSchema = z
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
/** Shared fixed-origin bounded transport. Each product owns its own durable
 * admission, immutable receipts, validation and independent budget. */
export function createReportModelTransport(input: {
  apiKey: string;
  fetch?: typeof globalThis.fetch;
}): (
  path: "/responses" | "/responses/input_tokens",
  body: string,
  timeout: number
) => Promise<Response> {
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
  return post;
}
