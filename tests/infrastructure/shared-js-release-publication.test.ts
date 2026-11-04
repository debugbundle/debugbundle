import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  planSharedPublication,
  readPublishedSharedArtifact
} from "../../scripts/check-shared-js-publication.mjs";

const integrity = (value: string) =>
  `sha512-${createHash("sha512").update(value).digest("base64")}`;
const candidates = [
  { name: "@debugbundle/shared-types", version: "3.1.0", integrity: integrity("types") },
  { name: "@debugbundle/redaction", version: "2.7.0", integrity: integrity("redaction") }
];

describe("shared JS immutable publication", () => {
  it("publishes only missing artifacts, retaining exact published bytes", () => {
    expect(planSharedPublication(candidates, [null, candidates[1]])).toEqual({
      publish: ["@debugbundle/shared-types"],
      retain: ["@debugbundle/redaction"]
    });
    expect(planSharedPublication(candidates, [null, null]).publish).toHaveLength(2);
    expect(planSharedPublication(candidates, candidates).publish).toEqual([]);
  });

  it.each([
    { ...candidates[1], integrity: integrity("different archive") },
    { ...candidates[1], version: "2.6.0" },
    { ...candidates[1], name: "@debugbundle/other" },
    { ...candidates[1], integrity: "sha512-invalid" }
  ])("fails before publication when an existing artifact differs: %j", (published) => {
    expect(() => planSharedPublication(candidates, [null, published])).toThrow();
  });

  it("rejects missing, duplicate, prerelease and unknown candidate identities", () => {
    expect(() => planSharedPublication(candidates.slice(0, 1), [null])).toThrow();
    expect(() => planSharedPublication([candidates[0], candidates[0]], [null, null])).toThrow();
    expect(() =>
      planSharedPublication(
        [{ ...candidates[0], version: "3.1.0-rc.1" }, candidates[1]],
        [null, null]
      )
    ).toThrow();
    expect(() =>
      planSharedPublication([{ ...candidates[0], name: "unexpected" }, candidates[1]], [null, null])
    ).toThrow();
  });

  it("treats only a registry 404 as an unpublished version", async () => {
    const fetcher = async () => new Response(null, { status: 404 });
    expect(await readPublishedSharedArtifact(candidates[0], fetcher)).toBeNull();
    await expect(
      readPublishedSharedArtifact(candidates[0], async () => new Response(null, { status: 503 }))
    ).rejects.toThrow();
  });

  it("checks registry identity, integrity and metadata size", async () => {
    const metadata = { ...candidates[0], dist: { integrity: candidates[0]!.integrity } };
    const fetcher = async () => Response.json(metadata);
    expect(await readPublishedSharedArtifact(candidates[0], fetcher)).toEqual(candidates[0]);
    for (const response of [
      Response.json({ ...metadata, version: "3.0.0" }),
      Response.json({ ...metadata, name: "wrong" }),
      Response.json({ ...metadata, dist: {} }),
      new Response("not json"),
      new Response(" ".repeat(2_097_153))
    ]) {
      await expect(
        readPublishedSharedArtifact(candidates[0], async () => response)
      ).rejects.toThrow();
    }
  });
});
