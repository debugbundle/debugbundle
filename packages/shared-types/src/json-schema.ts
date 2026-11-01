import { z } from "zod";

/** Preserve advertised input contracts while replacing the Zod 3 exporter. */
export function toInputJsonSchema(
  schema: z.ZodType,
  target: "draft-7" | "draft-2019-09" | "draft-2020-12" = "draft-2019-09"
): Record<string, unknown> {
  const document: Record<string, unknown> = {
    ...z.toJSONSchema(schema, {
      target: target === "draft-2019-09" ? "draft-7" : target,
      io: "input",
      unrepresentable: "any",
      // Inline reusable shapes: native interpreters intentionally support only
      // the closed contract vocabulary, without generic definition containers.
      reused: "inline",
      override: ({ zodSchema, jsonSchema }) => {
        const definition = zodSchema._zod.def;
        // Discriminators make these branches exclusive. Keep the existing union
        // vocabulary understood by every maintained native validator.
        if (definition.type === "union" && "discriminator" in definition && jsonSchema.oneOf) {
          jsonSchema.anyOf = jsonSchema.oneOf;
          delete jsonSchema.oneOf;
        }
        // Existing published schemas describe stripped object keys as closed.
        // Keep that advertised contract; explicit passthrough objects stay open.
        if (definition.type === "object" && definition.catchall === undefined)
          jsonSchema.additionalProperties = false;
        if (definition.type === "string" && jsonSchema.format !== undefined) {
          const hasExplicitPattern = (definition.checks ?? []).some((check) => {
            const rule = check._zod.def;
            return rule.check === "string_format" && "format" in rule && rule.format === "regex";
          });
          if (!hasExplicitPattern) delete jsonSchema.pattern;
        }
        // All JSON property names are strings. Keep only additional key constraints.
        if (
          typeof jsonSchema.propertyNames === "object" &&
          jsonSchema.propertyNames?.type === "string"
        ) {
          delete jsonSchema.propertyNames.type;
          if (Object.keys(jsonSchema.propertyNames).length === 0) delete jsonSchema.propertyNames;
        }
      }
    })
  };
  // The generated draft-7 vocabulary is a subset of the existing 2019-09 inputs.
  if (target === "draft-2019-09")
    document["$schema"] = "https://json-schema.org/draft/2019-09/schema#";
  // Spreading also strips Zod's non-enumerable Standard Schema adapter. Passing
  // that adapter into TypeBox would turn a plain parameter schema into a validator.
  return document;
}
