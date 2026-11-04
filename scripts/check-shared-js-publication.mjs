import { createHash } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";

const names = ["@debugbundle/shared-types", "@debugbundle/redaction"];
const artifactSchema = z.object({
  name: z.enum(names),
  version: z.string().regex(/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/),
  integrity: z.string().regex(/^sha512-[A-Za-z0-9+/]{86}==$/)
});
const metadataSchema = z.object({
  name: artifactSchema.shape.name,
  version: artifactSchema.shape.version,
  dist: z.object({ integrity: artifactSchema.shape.integrity })
});

// Validate the complete pair before allowing either immutable package to be published.
export function planSharedPublication(candidates, published) {
  const checked = z.array(artifactSchema).length(2).parse(candidates);
  if (new Set(checked.map((artifact) => artifact.name)).size !== names.length) {
    throw new Error("duplicate_shared_package");
  }
  if (!Array.isArray(published) || published.length !== checked.length) {
    throw new Error("incomplete_registry_state");
  }
  const plan = { publish: [], retain: [] };
  for (const [index, candidate] of checked.entries()) {
    const existing = published[index];
    if (existing === null) {
      plan.publish.push(candidate.name);
      continue;
    }
    const verified = artifactSchema.parse(existing);
    if (
      verified.name !== candidate.name ||
      verified.version !== candidate.version ||
      verified.integrity !== candidate.integrity
    ) {
      throw new Error(
        `immutable_published_artifact_mismatch:${candidate.name}@${candidate.version}`
      );
    }
    plan.retain.push(candidate.name);
  }
  return plan;
}

export async function readPublishedSharedArtifact(candidate, fetcher = fetch) {
  artifactSchema.parse(candidate);
  const response = await fetcher(
    `https://registry.npmjs.org/${encodeURIComponent(candidate.name)}/${candidate.version}`,
    { signal: AbortSignal.timeout(30_000), redirect: "error" }
  );
  if (response.status === 404) return null;
  if (!response.ok || !response.body) throw new Error(`registry_check_failed:${response.status}`);
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 2_097_152) throw new Error("registry_metadata_too_large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  const metadata = metadataSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  if (metadata.name !== candidate.name || metadata.version !== candidate.version) {
    throw new Error("registry_identity_mismatch");
  }
  return { name: metadata.name, version: metadata.version, integrity: metadata.dist.integrity };
}

async function main() {
  const directory = path.resolve(process.argv[2] ?? ".tmp/shared-js-packages");
  const candidates = names.map((name) => {
    const shortName = name.split("/")[1];
    const manifest = JSON.parse(readFileSync(`packages/${shortName}/package.json`, "utf8"));
    const archive = readFileSync(
      path.join(directory, `debugbundle-${shortName}-${manifest.version}.tgz`)
    );
    return artifactSchema.parse({
      name: manifest.name,
      version: manifest.version,
      integrity: `sha512-${createHash("sha512").update(archive).digest("base64")}`
    });
  });
  const published = await Promise.all(
    candidates.map((candidate) => readPublishedSharedArtifact(candidate))
  );
  const plan = planSharedPublication(candidates, published);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `publish_shared_types=${plan.publish.includes(names[0])}\npublish_redaction=${plan.publish.includes(names[1])}\n`
    );
  }
  console.log(JSON.stringify(plan));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
