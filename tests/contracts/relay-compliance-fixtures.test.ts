import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  AnalyticsEventEnvelopeSchema,
  EventEnvelopeSchema
} from "../../packages/shared-types/src/index.js";

const relayComplianceFixturePath = new URL("../fixtures/relay-compliance.json", import.meta.url);
const vendoredRelayFixturePaths = [
  new URL("../../sdks/debugbundle-js/tests/fixtures/relay-compliance.json", import.meta.url),
  new URL("../../sdks/debugbundle-python/tests/fixtures/relay-compliance.json", import.meta.url),
  new URL("../../sdks/debugbundle-php/tests/fixtures/relay-compliance.json", import.meta.url),
  new URL("../../sdks/debugbundle-wordpress/tests/fixtures/relay-compliance.json", import.meta.url),
  new URL("../../sdks/debugbundle-java/tests/fixtures/relay-compliance.json", import.meta.url)
];

const RelayHeadersSchema = z.record(z.string(), z.string());

const RelayBodyGeneratorSchema = z.object({
  kind: z.literal("repeat"),
  char: z.string().length(1),
  length: z.number().int().positive()
});

const RelayRequestSchema = z
  .object({
    method: z.string().min(1),
    headers: RelayHeadersSchema,
    ipAddress: z.string().nullable().optional()
  })
  .passthrough()
  .and(
    z.union([
      z.object({ bodyJson: z.unknown() }),
      z.object({ bodyText: z.string() }),
      z.object({ bodyGenerator: RelayBodyGeneratorSchema })
    ])
  );

const RelayExpectedSchema = z.object({
  status: z.number().int(),
  accepted: z.number().int().nonnegative().optional(),
  rejected: z.number().int().nonnegative().optional(),
  errors: z.array(z.string()).optional()
});

const RelayOptionsSchema = z.object({
  projectMode: z.enum(["local-only", "connected"]).optional(),
  projectToken: z.string().min(1).optional(),
  durableWrite: z.boolean().optional(),
  endpoint: z.string().url().optional(),
  service: z.string().min(1).optional(),
  environment: z.string().min(1).optional(),
  rateLimitPerMinute: z.number().int().positive().optional()
});
const BrowserRelayEventEnvelopeSchema = z.union([
  EventEnvelopeSchema,
  AnalyticsEventEnvelopeSchema
]);

const HandlerCaseSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("handler"),
  request: RelayRequestSchema,
  expected: RelayExpectedSchema,
  expectedEventFile: z.array(BrowserRelayEventEnvelopeSchema).optional()
});

const SequenceCaseSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("sequence"),
  relayOptions: RelayOptionsSchema,
  requests: z.array(
    z.object({
      atMs: z.number().int().nonnegative(),
      request: RelayRequestSchema,
      expectedStatus: z.number().int()
    })
  )
});

const DeliveryCaseSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("delivery"),
  relayOptions: RelayOptionsSchema,
  request: RelayRequestSchema,
  expected: RelayExpectedSchema,
  expectedEventFile: z.array(BrowserRelayEventEnvelopeSchema).optional(),
  expectedDeliveredMarker: z.boolean().optional(),
  expectedForwardRequest: z
    .object({
      events: z.array(BrowserRelayEventEnvelopeSchema)
    })
    .optional()
});

const RelayComplianceFixturesSchema = z.object({
  version: z.literal(1),
  cases: z.array(z.union([HandlerCaseSchema, SequenceCaseSchema, DeliveryCaseSchema]))
});

describe("relay compliance fixtures", () => {
  it("tracks the required cross-SDK relay cases in a schema-validated source-of-truth pack", async () => {
    const parsed = RelayComplianceFixturesSchema.parse(
      JSON.parse(await readFile(relayComplianceFixturePath, "utf8"))
    );

    expect(parsed.cases.map((fixture) => fixture.id)).toEqual([
      "valid-browser-batch",
      "valid-analytics-event",
      "mixed-valid-invalid-batch",
      "credential-smuggling-payload",
      "wrong-origin-request",
      "missing-origin-request",
      "oversized-body",
      "rate-limit-sequence",
      "local-only-write",
      "connected-durable-spool",
      "connected-cloud-forwarding"
    ]);
  });

  it("keeps the oversized-body and rate-limit fixtures aligned to the relay contract thresholds", async () => {
    const parsed = RelayComplianceFixturesSchema.parse(
      JSON.parse(await readFile(relayComplianceFixturePath, "utf8"))
    );

    const oversizedBodyFixture = parsed.cases.find((fixture) => fixture.id === "oversized-body");
    const rateLimitFixture = parsed.cases.find((fixture) => fixture.id === "rate-limit-sequence");

    expect(oversizedBodyFixture?.kind).toBe("handler");
    if (oversizedBodyFixture?.kind === "handler") {
      expect("bodyGenerator" in oversizedBodyFixture.request).toBe(true);
      if (
        "bodyGenerator" in oversizedBodyFixture.request &&
        typeof oversizedBodyFixture.request.bodyGenerator === "string"
      ) {
        expect(oversizedBodyFixture.request.bodyGenerator.length).toBeGreaterThan(256 * 1024);
      }
      expect(oversizedBodyFixture.expected.status).toBe(413);
    }

    expect(rateLimitFixture?.kind).toBe("sequence");
    if (rateLimitFixture?.kind === "sequence") {
      expect(rateLimitFixture.relayOptions.rateLimitPerMinute).toBe(3);
      expect(rateLimitFixture.requests.map((entry) => entry.expectedStatus)).toEqual([
        202, 202, 202, 429, 202
      ]);
    }
  });

  it("keeps delivery fixtures aligned to sanitized event files and server-side forwarding payloads", async () => {
    const parsed = RelayComplianceFixturesSchema.parse(
      JSON.parse(await readFile(relayComplianceFixturePath, "utf8"))
    );

    const smugglingFixture = parsed.cases.find(
      (fixture) => fixture.id === "credential-smuggling-payload"
    );
    const connectedForwardingFixture = parsed.cases.find(
      (fixture) => fixture.id === "connected-cloud-forwarding"
    );

    expect(smugglingFixture?.kind).toBe("handler");
    if (smugglingFixture?.kind === "handler") {
      expect(smugglingFixture.expectedEventFile?.[0]?.sdk_name).toBe("@debugbundle/sdk-browser");
      expect("project_token" in (smugglingFixture.expectedEventFile?.[0] ?? {})).toBe(false);
      expect("organization_id" in (smugglingFixture.expectedEventFile?.[0] ?? {})).toBe(false);
    }

    expect(connectedForwardingFixture?.kind).toBe("delivery");
    if (connectedForwardingFixture?.kind === "delivery") {
      expect(connectedForwardingFixture.expectedForwardRequest?.events[0]?.project_token).toBe(
        "dbundle_proj_test"
      );
      expect(connectedForwardingFixture.relayOptions.durableWrite).toBe(false);
    }
  });

  it("keeps present vendored SDK copies byte-for-byte aligned with the source fixture manifest", async () => {
    const sourceContents = await readFile(relayComplianceFixturePath, "utf8");
    const existingVendoredFixturePaths = (
      await Promise.all(
        vendoredRelayFixturePaths.map(async (fixturePath) => {
          try {
            await access(fixturePath);
            return fixturePath;
          } catch {
            return null;
          }
        })
      )
    ).filter((fixturePath): fixturePath is URL => fixturePath !== null);

    const vendoredContents = await Promise.all(
      existingVendoredFixturePaths.map((fixturePath) => readFile(fixturePath, "utf8"))
    );

    for (const fixtureContents of vendoredContents) {
      expect(fixtureContents).toBe(sourceContents);
    }
  });
});
