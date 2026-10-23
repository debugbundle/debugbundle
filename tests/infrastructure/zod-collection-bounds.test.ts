import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import * as z4 from "zod/v4";

const require = createRequire(import.meta.url);

describe("legacy Zod collection security backport", () => {
  it.each(["max", "length"] as const)(
    "rejects oversized %s arrays before running element validators",
    (method) => {
      const validate = vi.fn((value: unknown) => value);
      const schema = z.array(z.preprocess(validate, z.string()))[method](2, "too many items");
      const result = schema.safeParse(Array(10_000).fill(0));
      expect(result.success).toBe(false);
      expect(validate).not.toHaveBeenCalled();
      if (!result.success)
        expect(result.error.issues).toEqual([
          expect.objectContaining({ code: "too_big", message: "too many items", maximum: 2 })
        ]);
    }
  );

  it("rejects oversized sets before validating their entries", () => {
    const validate = vi.fn((value: unknown) => value);
    expect(
      z
        .set(z.preprocess(validate, z.string()))
        .max(1)
        .safeParse(new Set([0, 1])).success
    ).toBe(false);
    expect(validate).not.toHaveBeenCalled();
  });

  it("does not start async validators or refinements after an oversized collection", async () => {
    const validate = vi.fn(async (value: unknown) => value);
    const refine = vi.fn(() => true);
    const result = await z
      .array(z.preprocess(validate, z.string()))
      .max(1)
      .refine(refine)
      .safeParseAsync([0, 1]);
    expect(result.success).toBe(false);
    expect(validate).not.toHaveBeenCalled();
    expect(refine).not.toHaveBeenCalled();
  });

  it("preserves transforms, minimum checks and catch behaviour for ordinary inputs", () => {
    expect(
      z
        .array(z.string().transform((value) => value.toUpperCase()))
        .max(2)
        .parse(["ok"])
    ).toEqual(["OK"]);
    expect(z.array(z.string()).min(2).safeParse(["ok"]).success).toBe(false);
    expect(z.array(z.string()).max(1).catch(["fallback"]).parse([0, 1])).toEqual(["fallback"]);
    expect(z.array(z.number()).parse([0, 1])).toEqual([0, 1]);
  });

  it("protects the CommonJS entry point used by installed dependencies", () => {
    const legacy = require("zod") as typeof import("zod");
    const validate = vi.fn((value: unknown) => value);
    expect(
      legacy.array(legacy.preprocess(validate, legacy.string())).max(1).safeParse([0, 1]).success
    ).toBe(false);
    expect(validate).not.toHaveBeenCalled();
  });

  it("protects the bundled v4 compatibility entry point's bounded collections", () => {
    const validate = vi.fn((value: unknown) => value);
    const element = z4.preprocess(validate, z4.string());
    const results = [
      z4.array(element).max(1).safeParse([0, 1]),
      z4
        .set(element)
        .check(z4.maxSize(1))
        .safeParse(new Set([0, 1])),
      z4
        .map(element, element)
        .check(z4.maxSize(1))
        .safeParse(
          new Map([
            [0, 0],
            [1, 1]
          ])
        )
    ];
    expect(results.every((result) => !result.success)).toBe(true);
    expect(validate).not.toHaveBeenCalled();
  });

  it("preserves v4 checks that intentionally rewrite values before a later bound", () => {
    expect(
      z4
        .array(z4.number())
        .overwrite((value) => value.slice(0, 1))
        .max(1)
        .parse([0, 1])
    ).toEqual([0]);
  });
});
