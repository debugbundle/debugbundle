import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { z } from "zod";

const stableVersion = z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const releaseSchema = z
  .object({
    repository: z.literal("debugbundle/debugbundle-rust"),
    registry: z.literal("crates.io"),
    package: z.literal("debugbundle"),
    version: stableVersion,
    workflow: z.literal("release.yml")
  })
  .strict();
const metadataSchema = z.object({
  version: z.object({
    crate: z.literal("debugbundle"),
    num: stableVersion,
    checksum: digest,
    yanked: z.literal(false)
  })
});

export function readRustRelease(manifest) {
  return releaseSchema.parse(manifest?.releases?.rust);
}

async function boundedRead(url, fetcher) {
  const response = await fetcher(url, {
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
    headers: {
      "user-agent": "debugbundle-release-train/1.0 (https://github.com/debugbundle/debugbundle)"
    }
  });
  if (!response.ok || !response.body)
    throw new Error(`rust_registry_read_failed:${response.status}`);
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 8 * 1024 * 1024) throw new Error("rust_registry_response_too_large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

// The SDK's own workflow owns qualification and publication. The core release
// checks the advertised dependency's real registry bytes without publishing it.
export async function verifyRustRelease(specification, fetcher = fetch) {
  const release = releaseSchema.parse(specification);
  const metadata = metadataSchema.parse(
    JSON.parse(
      (
        await boundedRead(`https://crates.io/api/v1/crates/debugbundle/${release.version}`, fetcher)
      ).toString("utf8")
    )
  );
  if (metadata.version.num !== release.version) throw new Error("rust_registry_version_mismatch");
  const index = (await boundedRead("https://index.crates.io/de/bu/debugbundle", fetcher))
    .toString("utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((entry) => entry?.name === release.package && entry.vers === release.version);
  if (
    index.length !== 1 ||
    index[0].yanked !== false ||
    index[0].cksum !== metadata.version.checksum
  )
    throw new Error("rust_registry_index_mismatch");
  const url = `https://static.crates.io/crates/debugbundle/debugbundle-${release.version}.crate`;
  const archive = await boundedRead(url, fetcher);
  const checksum = createHash("sha256").update(archive).digest("hex");
  if (checksum !== metadata.version.checksum) throw new Error("rust_registry_archive_mismatch");
  return { ...release, checksum, size: archive.length, artifactUrl: url };
}

async function main() {
  const release = readRustRelease(JSON.parse(readFileSync(process.argv[2] ?? "sdks.json", "utf8")));
  const receipt = await verifyRustRelease(release);
  mkdirSync(".tmp/sdk-release-train", { recursive: true });
  writeFileSync(".tmp/sdk-release-train/rust.json", JSON.stringify(receipt, null, 2) + "\n");
  console.log(`Verified Rust ${release.package}@${release.version}: ${receipt.checksum}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
