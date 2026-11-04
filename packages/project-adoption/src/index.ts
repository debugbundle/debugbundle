import { constants } from "node:fs";
import { open, lstat, realpath, rename, unlink } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { sanitizeTelemetry } from "../../redaction/src/index.js";
import {
  ProjectMergeOperationSchema,
  type ProjectMergeOperation,
  type ProjectAdoptionManifest
} from "../../shared-types/src/project-consolidation.js";
import { ProfileSchema } from "../../shared-types/src/project-profile.js";
import { ConnectionConfigSchema } from "../../shared-types/src/project-connection.js";
import { safePath } from "../../agent-setup/src/files.js";

const paths = [".debugbundle/local/connection.json", ".debugbundle/profile.json"] as const;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const changeSchema = z
  .object({ pointer: z.string(), before: z.string().nullable(), after: z.string().nullable() })
  .strict();
const planBody = z
  .object({
    version: z.literal(1),
    workspace_root: z.string(),
    operation_id: z.string().guid(),
    original_project_id: z.string().guid(),
    canonical_project_id: z.string().guid(),
    manifest_digest: digest,
    files: z
      .array(
        z
          .object({
            path: z.enum(paths),
            before_sha256: digest,
            after_sha256: digest,
            changes: z.array(changeSchema)
          })
          .strict()
      )
      .length(2)
  })
  .strict();
export const ProjectAdoptionPlanSchema = planBody.extend({ plan_digest: digest });
export type ProjectAdoptionPlan = z.infer<typeof ProjectAdoptionPlanSchema>;
type Change = z.infer<typeof changeSchema>;
type Document = Record<string, unknown>;
interface FileSnapshot {
  path: (typeof paths)[number];
  bytes: Buffer;
  data: Document;
  mode: number;
  dev: number;
  ino: number;
}
const hash = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
const object = (value: unknown): value is Document =>
  typeof value === "object" && value !== null && !Array.isArray(value);
export class ProjectAdoptionError extends Error {}
function fail(code: string): never {
  throw new ProjectAdoptionError(code);
}
function manifestFor(input: unknown): {
  operation: ProjectMergeOperation;
  manifest: ProjectAdoptionManifest;
} {
  const parsed = ProjectMergeOperationSchema.safeParse(input);
  if (!parsed.success) return fail("adoption_invalid_operation");
  const operation = parsed.data;
  if (operation.state !== "completed" || !operation.verified_at || !operation.committed_at)
    fail("adoption_server_not_verified");
  const manifest = operation.receipt?.adoption_manifest;
  if (!manifest) return fail("adoption_manifest_missing");
  if (manifest.canonical_project_id !== operation.canonical_project_id)
    fail("adoption_manifest_stale");
  return { operation, manifest };
}
async function hierarchy(root: string, relative: string): Promise<void> {
  if (resolve(root) !== root || (await realpath(root)) !== root) fail("adoption_unsafe_path");
  try {
    await safePath(root, relative);
  } catch {
    fail("adoption_unsafe_path");
  }
}
async function read(root: string, path: (typeof paths)[number]): Promise<FileSnapshot> {
  await hierarchy(root, path);
  const full = join(root, path),
    before = await lstat(full);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1)
    fail("adoption_unsafe_path");
  const file = await open(full, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await file.stat();
    if (
      !info.isFile() ||
      info.dev !== before.dev ||
      info.ino !== before.ino ||
      info.size > 1024 * 1024
    )
      fail("adoption_file_changed");
    const bytes = Buffer.alloc(1024 * 1024 + 1),
      result = await file.read(bytes, 0, bytes.length, 0);
    if (result.bytesRead > 1024 * 1024) fail("adoption_file_too_large");
    const retained = bytes.subarray(0, result.bytesRead);
    let data: unknown;
    try {
      data = JSON.parse(retained.toString("utf8"));
    } catch {
      return fail("adoption_invalid_scaffold");
    }
    if (!object(data)) return fail("adoption_invalid_scaffold");
    return { path, bytes: retained, data, mode: info.mode & 0o777, dev: info.dev, ino: info.ino };
  } finally {
    await file.close();
  }
}
function setLeaf(
  parent: Document,
  key: string,
  after: string | null,
  pointer: string,
  changes: Change[]
): void {
  const before = parent[key];
  if (before === after) return;
  if (before !== undefined && before !== null && typeof before !== "string")
    fail("adoption_custom_context_conflict");
  if (typeof before === "string") {
    const safe = sanitizeTelemetry(before);
    if (!safe.ok || safe.value !== before) fail("adoption_custom_context_conflict");
  }
  changes.push({ pointer, before: before ?? null, after });
  parent[key] = after;
}
function child(parent: Document, key: string): Document {
  if (parent[key] === undefined) parent[key] = {};
  const value = parent[key];
  if (!object(value)) return fail("adoption_custom_context_conflict");
  return value;
}
function render(
  file: FileSnapshot,
  manifest: ProjectAdoptionManifest,
  original: string,
  operationId: string
): { bytes: Buffer; changes: Change[] } {
  // Validate known fields, but retain the original object, including custom content.
  const document = structuredClone(file.data),
    changes: Change[] = [];
  if (file.path === paths[0]) {
    const parsed = ConnectionConfigSchema.safeParse(document);
    if (
      !parsed.success ||
      parsed.data.mode !== "connected" ||
      !manifest.origin_project_ids.includes(parsed.data.cloud_project_id ?? "")
    )
      fail("adoption_workspace_not_in_merge");
    setLeaf(
      document,
      "cloud_project_id",
      manifest.canonical_project_id,
      "/cloud_project_id",
      changes
    );
  } else {
    if (!ProfileSchema.safeParse(document).success) fail("adoption_invalid_profile");
    const context = child(child(document, "debugbundle"), "project_context");
    for (const [key, value] of Object.entries({
      canonical_project_id: manifest.canonical_project_id,
      origin_project_id: original,
      operation_id: operationId,
      metadata_source: "merge_receipt_snapshot",
      credential_strategy: manifest.credential_strategy
    }))
      setLeaf(context, key, value, `/debugbundle/project_context/${key}`, changes);
    const services = document["services"] as Document[];
    const used = new Set<string>();
    for (const [index, local] of services.entries()) {
      const matches = manifest.services.filter(
        (service) =>
          service.origin_project_id === original &&
          service.retained_input_names.includes(String(local["name"]))
      );
      if (matches.length !== 1) fail("adoption_service_mapping_required");
      const service = matches[0]!;
      if (service.manual_review_required || used.has(service.service_definition_id))
        fail("adoption_service_mapping_required");
      used.add(service.service_definition_id);
      const metadata = child(local, "debugbundle");
      for (const [key, value] of Object.entries({
        canonical_project_id: manifest.canonical_project_id,
        service_definition_id: service.service_definition_id,
        origin_project_id: service.origin_project_id,
        canonical_name: service.name,
        runtime_input_name: String(local["name"]),
        repository_url: service.repository?.url ?? null,
        repository_root: service.repository?.root ?? null
      }))
        setLeaf(metadata, key, value, `/services/${index}/debugbundle/${key}`, changes);
    }
  }
  const originalText = file.bytes.toString("utf8"),
    newline = originalText.includes("\r\n") ? "\r\n" : "\n";
  const indent = originalText.match(/\n([ \t]+)"/)?.[1] ?? 2;
  const output =
    changes.length === 0
      ? file.bytes
      : Buffer.from(
          JSON.stringify(document, null, indent).replaceAll("\n", newline) +
            (originalText.endsWith("\n") ? newline : "")
        );
  return { bytes: output, changes };
}
export async function previewProjectAdoption(input: {
  workspace_root: string;
  operation: unknown;
}): Promise<ProjectAdoptionPlan> {
  const { operation, manifest } = manifestFor(input.operation);
  const files = await Promise.all(paths.map((path) => read(input.workspace_root, path)));
  let original = files[0]!.data["cloud_project_id"];
  if (typeof original !== "string" || !manifest.origin_project_ids.includes(original))
    fail("adoption_workspace_not_in_merge");
  const metadata = files[1]!.data["debugbundle"];
  const context = object(metadata) ? metadata["project_context"] : undefined;
  if (
    object(context) &&
    context["canonical_project_id"] === original &&
    typeof context["origin_project_id"] === "string" &&
    manifest.origin_project_ids.includes(context["origin_project_id"])
  )
    original = context["origin_project_id"];
  const origin = String(original);
  const body = planBody.parse({
    version: 1,
    workspace_root: input.workspace_root,
    operation_id: operation.operation_id,
    original_project_id: origin,
    canonical_project_id: manifest.canonical_project_id,
    manifest_digest: hash(JSON.stringify(manifest)),
    files: files.map((file) => {
      const rendered = render(file, manifest, origin, operation.operation_id);
      return {
        path: file.path,
        before_sha256: hash(file.bytes),
        after_sha256: hash(rendered.bytes),
        changes: rendered.changes
      };
    })
  });
  return { ...body, plan_digest: hash(JSON.stringify(body)) };
}
async function replace(
  root: string,
  snapshot: FileSnapshot,
  bytes: Buffer,
  expectedHash: string
): Promise<FileSnapshot> {
  const path = join(root, snapshot.path),
    temporary = join(dirname(path), `.debugbundle-adoption-${randomBytes(16).toString("hex")}.tmp`);
  await hierarchy(root, snapshot.path);
  const handle = await open(
    temporary,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600
  );
  try {
    const placed = await handle.stat();
    try {
      await handle.writeFile(bytes);
      await handle.chmod(snapshot.mode);
      await handle.sync();
    } finally {
      await handle.close();
    }
    const current = await read(root, snapshot.path);
    if (
      hash(current.bytes) !== expectedHash ||
      current.dev !== snapshot.dev ||
      current.ino !== snapshot.ino
    )
      fail("adoption_file_changed");
    await hierarchy(root, snapshot.path);
    await rename(temporary, path);
    return { ...snapshot, bytes, dev: placed.dev, ino: placed.ino };
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}
export async function applyProjectAdoption(
  input: { plan: unknown; operation: unknown },
  hooks: { beforeReplace?: (path: string, index: number) => Promise<void> } = {}
): Promise<{
  local_configuration: "applied";
  local_adoption: "pending_repository_checks";
  deployed_runtime: "pending";
  canonical_project_id: string;
  remaining_tasks: string[];
}> {
  const parsed = ProjectAdoptionPlanSchema.safeParse(input.plan);
  if (!parsed.success) return fail("adoption_invalid_plan");
  const plan = parsed.data,
    { plan_digest, ...body } = plan;
  if (
    hash(JSON.stringify(body)) !== plan_digest ||
    new Set(plan.files.map((file) => file.path)).size !== 2
  )
    fail("adoption_invalid_plan");
  const { operation, manifest } = manifestFor(input.operation);
  if (
    operation.operation_id !== plan.operation_id ||
    operation.canonical_project_id !== plan.canonical_project_id ||
    hash(JSON.stringify(manifest)) !== plan.manifest_digest ||
    !manifest.origin_project_ids.includes(plan.original_project_id)
  )
    fail("adoption_manifest_stale");
  await hierarchy(plan.workspace_root, paths[0]);
  const lockPath = join(plan.workspace_root, ".debugbundle/adoption.lock");
  const lock = await open(
    lockPath,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600
  ).catch(() => fail("adoption_already_running"));
  const written: Array<{ before: FileSnapshot; after: FileSnapshot }> = [];
  let lockIdentity: { dev: number; ino: number } | undefined;
  try {
    lockIdentity = await lock.stat();
    const work = await Promise.all(
      plan.files.map(async (entry) => {
        const file = await read(plan.workspace_root, entry.path),
          current = hash(file.bytes);
        if (current === entry.after_sha256) return { entry, file, bytes: file.bytes, done: true };
        if (current !== entry.before_sha256) return fail("adoption_file_changed");
        const rendered = render(file, manifest, plan.original_project_id, operation.operation_id);
        if (
          hash(rendered.bytes) !== entry.after_sha256 ||
          JSON.stringify(rendered.changes) !== JSON.stringify(entry.changes)
        )
          fail("adoption_invalid_plan");
        return { entry, file, bytes: rendered.bytes, done: false };
      })
    );
    for (const [index, item] of work.entries()) {
      if (item.done) continue;
      await hooks.beforeReplace?.(item.entry.path, index);
      const placed = await replace(
        plan.workspace_root,
        item.file,
        item.bytes,
        item.entry.before_sha256
      );
      written.push({ before: item.file, after: placed });
    }
    for (const entry of plan.files) {
      const current = await read(plan.workspace_root, entry.path);
      if (
        hash(current.bytes) !== entry.after_sha256 ||
        render(current, manifest, plan.original_project_id, operation.operation_id).changes
          .length !== 0
      )
        fail("adoption_invalid_plan");
    }
    return {
      local_configuration: "applied",
      local_adoption: "pending_repository_checks",
      deployed_runtime: "pending",
      canonical_project_id: plan.canonical_project_id,
      remaining_tasks: [
        "Read the current service catalogue and compare it with the receipt snapshot. Review application SDK, relay, environment/CI configuration and documentation; retain existing tokens and runtime input names.",
        "Run this repository's checks and separately authorise any deployment or production canary. Verify real runtime evidence before declaring adoption complete."
      ]
    };
  } catch (error) {
    let rollbackFailed = false;
    for (const item of written.reverse())
      await replace(
        plan.workspace_root,
        item.after,
        item.before.bytes,
        hash(item.after.bytes)
      ).catch(() => {
        rollbackFailed = true;
      });
    if (rollbackFailed) fail("adoption_partial_apply_review_required");
    if (error instanceof ProjectAdoptionError) throw error;
    return fail("adoption_apply_failed");
  } finally {
    await lock.close();
    await hierarchy(plan.workspace_root, ".debugbundle/adoption.lock");
    const current = await lstat(lockPath).catch(() => null);
    if (
      !lockIdentity ||
      !current?.isFile() ||
      current.nlink !== 1 ||
      current.dev !== lockIdentity.dev ||
      current.ino !== lockIdentity.ino
    )
      fail("adoption_lock_changed_review_required");
    await unlink(lockPath);
  }
}
