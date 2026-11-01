import { expect, it } from "vitest";
import { z } from "zod";
import { toInputJsonSchema } from "../../../packages/shared-types/src/json-schema.js";

it("preserves advertised closed inputs and optional defaults without validator adapters", () => {
  const document = toInputJsonSchema(z.object({ name: z.string(), limit: z.number().default(10) }));
  expect(document).toMatchObject({
    $schema: "https://json-schema.org/draft/2019-09/schema#",
    type: "object",
    additionalProperties: false,
    required: ["name"],
    properties: { limit: { type: "number", default: 10 } }
  });
  expect("~standard" in document).toBe(false);
  expect(toInputJsonSchema(z.object({}).passthrough())["additionalProperties"]).not.toBe(false);
});

it("keeps explicit patterns alongside formats while avoiding redundant format patterns", () => {
  expect(toInputJsonSchema(z.string().guid())).toMatchObject({ type: "string", format: "uuid" });
  expect(toInputJsonSchema(z.string().guid())).not.toHaveProperty("pattern");
  expect(toInputJsonSchema(z.string().guid().regex(/^123/))).toMatchObject({
    allOf: expect.arrayContaining([expect.objectContaining({ pattern: "^123" })])
  });
  expect(toInputJsonSchema(z.string().datetime())).not.toHaveProperty("pattern");
});

it("preserves record key constraints without adding a redundant JSON key type", () => {
  expect(toInputJsonSchema(z.record(z.string().regex(/^key-/), z.string()))).toMatchObject({
    type: "object",
    propertyNames: { pattern: "^key-" },
    additionalProperties: { type: "string" }
  });
  expect(toInputJsonSchema(z.record(z.string(), z.unknown()))).not.toHaveProperty("propertyNames");
});

it("keeps native-validator fixtures on draft 7 and emits explicit modern documents on request", () => {
  expect(toInputJsonSchema(z.string(), "draft-7")).toHaveProperty(
    "$schema",
    "http://json-schema.org/draft-07/schema#"
  );
  expect(toInputJsonSchema(z.string(), "draft-2020-12")).toHaveProperty(
    "$schema",
    "https://json-schema.org/draft/2020-12/schema"
  );
});
