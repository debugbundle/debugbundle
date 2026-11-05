import { relative } from "node:path";
import { z } from "zod";
import { readManaged, safePath, writeManaged } from "../../../packages/agent-setup/src/files.js";
import { RetrievalApiError } from "../../../packages/retrieval-client/src/index.js";

type ArtifactKind = "bundle" | "reproduction";
const paths = {
  bundle: z
    .string()
    .regex(/^\.debugbundle\/bundles\/local\/[A-Za-z0-9][A-Za-z0-9._-]*\.bundle\.json$/),
  reproduction: z
    .string()
    .regex(
      /^\.debugbundle\/bundles\/local\/reproductions\/[A-Za-z0-9][A-Za-z0-9._-]*\.reproduction\.json$/
    )
};

export function validateLocalArtifactPath(value: unknown, kind: ArtifactKind): string {
  const result = paths[kind].safeParse(value);
  if (!result.success) throw new RetrievalApiError(400, "invalid_local_artifact_path");
  return result.data;
}

export async function resolveLocalArtifactPath(
  root: string,
  value: unknown,
  kind: ArtifactKind
): Promise<string> {
  const path = validateLocalArtifactPath(value, kind);
  try {
    return await safePath(root, path);
  } catch {
    throw new RetrievalApiError(400, "invalid_local_artifact_path");
  }
}

// Retain Node readFile's existing size ceiling for state/event files. Allocation
// is bounded to the opened regular file's size and concurrent growth is rejected.
const LOCAL_FILE_LIMIT = 2 ** 31 - 1;
export async function readWorkspaceFile(
  root: string,
  path: string,
  reader?: (path: string) => Promise<string>,
  maxBytes = LOCAL_FILE_LIMIT
): Promise<string> {
  const file = relative(root, path);
  await safePath(root, file);
  const raw = reader ? await reader(path) : await readManaged(root, file, maxBytes);
  if (raw === undefined)
    throw Object.assign(new Error("Local file not found."), { code: "ENOENT" });
  if (Buffer.byteLength(raw, "utf8") > maxBytes) throw new Error("Oversized local file.");
  return raw;
}

export async function writeWorkspaceFile(
  root: string,
  path: string,
  contents: string,
  writer?: (path: string, contents: string) => Promise<void>
): Promise<void> {
  const file = relative(root, path);
  await safePath(root, file);
  if (writer) return writer(path, contents);
  const previous = await readManaged(root, file, LOCAL_FILE_LIMIT);
  await writeManaged(root, file, contents, previous, LOCAL_FILE_LIMIT);
}
