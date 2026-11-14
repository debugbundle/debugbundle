import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { readRustRelease, verifyRustRelease } from "../../scripts/check-rust-release.mjs";

const specification = {
  repository: "debugbundle/debugbundle-rust",
  registry: "crates.io",
  package: "debugbundle",
  version: "1.0.0",
  workflow: "release.yml"
};
const archive = "synthetic qualified archive";
const checksum = createHash("sha256").update(archive).digest("hex");
const metadata = {
  version: { crate: "debugbundle", num: "1.0.0", checksum, yanked: false }
};
const index = { name: "debugbundle", vers: "1.0.0", cksum: checksum, yanked: false };

function registry(overrides: { metadata?: unknown; index?: unknown; archive?: string } = {}) {
  return async (url: string) => {
    if (url.startsWith("https://crates.io/api/"))
      return Response.json(overrides.metadata ?? metadata);
    if (url.startsWith("https://index.crates.io/"))
      return new Response(JSON.stringify(overrides.index ?? index) + "\n");
    expect(url).toBe("https://static.crates.io/crates/debugbundle/debugbundle-1.0.0.crate");
    return new Response(overrides.archive ?? archive);
  };
}

describe("Rust in the coordinated release train", () => {
  it("records the independent stable crate and checks it before the canonical release", () => {
    const manifest = JSON.parse(readFileSync("sdks.json", "utf8"));
    expect(readRustRelease(manifest)).toEqual(specification);
    const workflow = readFileSync(".github/workflows/release.yml", "utf8");
    expect(workflow).toContain("node scripts/check-rust-release.mjs");
    expect(workflow.indexOf("node scripts/check-rust-release.mjs")).toBeLessThan(
      workflow.indexOf("- name: Create GitHub release")
    );
    expect(workflow).toContain("Rust SDK: debugbundle@");
  });

  it("accepts only matching public metadata, index and downloaded crate bytes", async () => {
    const result = await verifyRustRelease(specification, registry());
    expect(result).toMatchObject({ version: "1.0.0", checksum, package: "debugbundle" });
  });

  it("rejects prerelease or substituted release identities", () => {
    for (const invalid of [
      { version: "1.0.0-alpha.1" },
      { repository: "other/rust" },
      { package: "other" },
      { workflow: "other.yml" }
    ]) {
      expect(() =>
        readRustRelease({ releases: { rust: { ...specification, ...invalid } } })
      ).toThrow();
    }
  });

  it("fails closed for missing publication, transport errors and excessive metadata", async () => {
    for (const response of [
      new Response(null, { status: 404 }),
      new Response(null, { status: 503 }),
      new Response("x".repeat(8 * 1024 * 1024 + 1))
    ]) {
      await expect(verifyRustRelease(specification, async () => response)).rejects.toThrow();
    }
  });

  it("rejects yanks, different versions and changed download or index checksums", async () => {
    for (const overrides of [
      { metadata: { version: { ...metadata.version, yanked: true } } },
      { metadata: { version: { ...metadata.version, num: "1.0.1" } } },
      { index: { ...index, cksum: "0".repeat(64) } },
      { index: { ...index, yanked: true } },
      { archive: "different bytes" }
    ]) {
      await expect(verifyRustRelease(specification, registry(overrides))).rejects.toThrow();
    }
  });
});
