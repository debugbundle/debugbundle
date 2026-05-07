import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { BundleV1Schema } from "../../packages/shared-types/src/index.js";

const failureFixturePath = new URL("../../examples/bundle.failure.json", import.meta.url);
const improvementFixturePath = new URL("../../examples/bundle.improvement.json", import.meta.url);
const deployMetadataGoldenFixturePath = new URL("../fixtures/build-bundle.deploy-metadata.golden.json", import.meta.url);

describe("example bundle artifacts", () => {
  it("keeps the failure example aligned to the deterministic failure golden fixture", async () => {
    const [exampleContents, goldenContents] = await Promise.all([
      readFile(failureFixturePath, "utf8"),
      readFile(deployMetadataGoldenFixturePath, "utf8")
    ]);

    expect(JSON.parse(exampleContents)).toEqual(JSON.parse(goldenContents));
    expect(BundleV1Schema.parse(JSON.parse(exampleContents)).bundle_type).toBe("failure");
  });

  it("provides a schema-valid improvement example for the local analysis workflow", async () => {
    const exampleContents = await readFile(improvementFixturePath, "utf8");

    const parsed = BundleV1Schema.parse(JSON.parse(exampleContents));
    expect(parsed.bundle_type).toBe("improvement");
    expect(parsed.sdk).toEqual({
      name: "debugbundle-cli",
      version: "0.1.0"
    });
    expect(parsed.summary.title).toContain("Improvement analysis");
    expect(parsed.links.docs).toBe(".agents/skills/debugbundle/assets/schemas/improvement-analysis.json");
    expect(parsed.metadata.generator_version).toBe("cli-analyze-v1");
  });
});