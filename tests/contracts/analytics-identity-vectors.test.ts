import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { z } from "zod";

const fixture = z
  .object({
    description: z.string(),
    key_hex: z.string().length(64),
    vectors: z.array(
      z.object({
        name: z.string(),
        scope_kind: z.enum(["project", "space"]),
        scope_id: z.string().uuid(),
        namespace_revision: z.number().int().positive(),
        entity_kind: z.enum(["anonymous", "user", "account", "binding"]),
        canonical_id: z.string(),
        frame_hex: z.string(),
        reference: z.string()
      })
    )
  })
  .parse(
    JSON.parse(
      readFileSync(new URL("../fixtures/analytics-identity-vectors.json", import.meta.url), "utf8")
    )
  );
// This independent Node reference checks Python-generated vectors, not an SDK implementation.
// SDK contract suites must consume the same literal expected frame/digest when their APIs are added.
it.each(fixture.vectors)("fixes cross-language namespace framing for $name", (vector) => {
  const parts = [
    vector.scope_kind,
    vector.scope_id,
    String(vector.namespace_revision),
    vector.entity_kind,
    vector.canonical_id
  ];
  const frame = Buffer.concat([
    Buffer.from("debugbundle.analytics.identity\0v1\0", "ascii"),
    ...parts.flatMap((part) => {
      const bytes = Buffer.from(part, "utf8");
      const size = Buffer.alloc(4);
      size.writeUInt32BE(bytes.length);
      return [size, bytes];
    })
  ]);
  expect(frame.toString("hex")).toBe(vector.frame_hex);
  expect(
    `sha256:${createHmac("sha256", Buffer.from(fixture.key_hex, "hex")).update(frame).digest("hex")}`
  ).toBe(vector.reference);
});
it("separates entity types, namespace scope, rotation and binding references", () => {
  expect(new Set(fixture.vectors.map((vector) => vector.reference)).size).toBe(
    fixture.vectors.length
  );
});
