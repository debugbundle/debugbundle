import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { z } from "zod";
import { AnalyticsPreparedEventSchema } from "../../packages/shared-types/src/index.js";
import { validatePreparedAnalyticsBatch } from "../../packages/event-normalizer/src/semantic-analytics-outbox.js";

const corpus = z
  .object({
    protocol: z.literal("2026-09-analytics-prepared-01"),
    vectors: z.array(
      z
        .object({
          name: z.string(),
          canonical_endpoint: z.string().url(),
          destination_json: z.string(),
          event_utf8_bytes: z.number().int(),
          record: AnalyticsPreparedEventSchema
        })
        .strict()
    )
  })
  .strict()
  .parse(JSON.parse(readFileSync("tests/fixtures/analytics-outbox-vectors.json", "utf8")));
const sha = (text: string) => `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;

it.each(corpus.vectors)(
  "matches independent Python-produced exact bytes and hashes: $name",
  (vector) => {
    const record = vector.record;
    expect(
      JSON.stringify([
        "debugbundle.analytics.destination.v1",
        vector.canonical_endpoint,
        record.project_id
      ])
    ).toBe(vector.destination_json);
    expect(sha(vector.destination_json)).toBe(record.destination_binding);
    expect(Buffer.byteLength(record.event_json, "utf8")).toBe(vector.event_utf8_bytes);
    expect(sha(record.event_json)).toBe(record.prepared_content_hash);
    expect(
      validatePreparedAnalyticsBatch([record], {
        project_id: record.project_id,
        destination_binding: record.destination_binding,
        now: "2026-09-28T12:00:00.000Z"
      }).valid
    ).toBe(true);
  }
);
