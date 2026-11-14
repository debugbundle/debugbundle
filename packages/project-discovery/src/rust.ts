import { lstat, opendir, realpath } from "node:fs/promises";
import { posix } from "node:path";
import { Minimatch } from "minimatch";
import { parse } from "smol-toml";
import { z } from "zod";
import { readManaged, safePath } from "../../agent-setup/src/files.js";

const Dependency = z.union([
  z.string().max(512),
  z.object({
    package: z.string().max(128).optional(),
    workspace: z.literal(true).optional(),
    path: z.string().max(512).optional()
  })
]);
const Dependencies = z
  .record(z.string().max(128), Dependency)
  .refine((value) => Object.keys(value).length <= 256);
const Paths = z.array(z.string().min(1).max(256)).max(256);
const Manifest = z.object({
  package: z
    .object({
      name: z
        .string()
        .min(1)
        .max(128)
        .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/u),
      autobins: z.boolean().optional()
    })
    .optional(),
  workspace: z
    .object({
      members: Paths.optional(),
      exclude: Paths.optional(),
      dependencies: Dependencies.optional()
    })
    .optional(),
  dependencies: Dependencies.optional(),
  target: z
    .record(z.string().max(1024), z.object({ dependencies: Dependencies.optional() }))
    .refine((value) => Object.keys(value).length <= 64)
    .optional(),
  bin: z
    .array(z.object({ name: z.string().max(128).optional(), path: z.string().max(512).optional() }))
    .max(128)
    .optional()
});
type CargoManifest = z.infer<typeof Manifest>;
type DependencyMap = z.infer<typeof Dependencies>;
type Workspace = {
  path: string;
  members: Minimatch[];
  exclude: Minimatch[];
  dependencies: DependencyMap;
};
export type RustProject = {
  name: string;
  kind: "backend" | "worker";
  framework: "Axum" | "Actix Web" | "unknown";
  path: string;
};
const IGNORED = new Set([
  ".git",
  ".debugbundle",
  ".local-repos",
  "node_modules",
  "target",
  "vendor",
  "sdks",
  "dist",
  "build",
  "coverage"
]);
const SOURCE_DIRECTORIES = new Set([
  "src",
  "tests",
  "test",
  "examples",
  "benches",
  "docs",
  "public"
]);

function patterns(values: string[] | undefined): Minimatch[] {
  return (values ?? [])
    .filter(
      (value) =>
        !value.startsWith("/") &&
        !value.includes("\\") &&
        !value.split("/").includes("..") &&
        !/^[A-Za-z]:/u.test(value)
    )
    .map(
      (value) =>
        new Minimatch(value.replace(/^\.\//u, ""), {
          dot: true,
          nonegate: true,
          nocomment: true,
          nobrace: true,
          noext: true
        })
    );
}
function workspace(path: string, manifest: CargoManifest): Workspace | undefined {
  const value = manifest.workspace;
  return value
    ? {
        path,
        members: patterns(value.members),
        exclude: patterns(value.exclude),
        dependencies: value.dependencies ?? {}
      }
    : undefined;
}
function included(scope: Workspace, path: string, partial = false): boolean {
  const relative = posix.relative(scope.path, path);
  return (
    relative === "" ||
    (!scope.exclude.some((pattern) => pattern.match(relative)) &&
      scope.members.some((pattern) => pattern.match(relative, partial)))
  );
}
async function regular(root: string, path: string): Promise<boolean> {
  try {
    return (await lstat(await safePath(root, path))).isFile();
  } catch {
    return false;
  }
}
async function binary(root: string, path: string, manifest: CargoManifest): Promise<boolean> {
  for (const bin of manifest.bin ?? []) {
    if (bin.path) {
      if (await regular(root, posix.join(path, bin.path))) return true;
      continue;
    }
    if (
      bin.name === manifest.package?.name &&
      (await regular(root, posix.join(path, "src/main.rs")))
    )
      return true;
    if (
      bin.name &&
      ((await regular(root, posix.join(path, `src/bin/${bin.name}.rs`))) ||
        (await regular(root, posix.join(path, `src/bin/${bin.name}/main.rs`))))
    )
      return true;
  }
  if (manifest.package?.autobins === false) return false;
  if (await regular(root, posix.join(path, "src/main.rs"))) return true;
  try {
    let count = 0;
    for await (const entry of await opendir(await safePath(root, posix.join(path, "src/bin")))) {
      if (++count > 128) return false;
      if (
        (entry.isFile() && entry.name.endsWith(".rs")) ||
        (entry.isDirectory() &&
          (await regular(root, posix.join(path, "src/bin", entry.name, "main.rs"))))
      )
        return true;
    }
  } catch {
    /* A library or unavailable automatic binary directory is not a deployable. */
  }
  return false;
}
function framework(
  manifest: CargoManifest,
  scope: Workspace | undefined
): RustProject["framework"] {
  const names = new Set<string>();
  const dependencies = [
    manifest.dependencies,
    ...Object.values(manifest.target ?? {}).map((target) => target.dependencies)
  ];
  for (const group of dependencies) {
    for (const [alias, value] of Object.entries(group ?? {})) {
      const resolved =
        typeof value === "object" && value.workspace ? scope?.dependencies[alias] : value;
      if (resolved !== undefined)
        names.add(typeof resolved === "object" ? (resolved.package ?? alias) : alias);
    }
  }
  return names.has("axum") ? "Axum" : names.has("actix-web") ? "Actix Web" : "unknown";
}

/** Read bounded Cargo metadata only. Never execute Cargo, build scripts or source. */
export async function discoverRustProjects(directory: string): Promise<RustProject[]> {
  let root: string;
  try {
    root = await realpath(directory);
  } catch {
    return [];
  }
  const records: { path: string; manifest: CargoManifest; scope: Workspace | undefined }[] = [];
  const budget = { entries: 0, directories: 0, manifests: 0, exhausted: false };
  async function scan(path: string, depth: number, inherited?: Workspace): Promise<void> {
    if (depth > 8) return;
    if (++budget.directories > 512) {
      budget.exhausted = true;
      return;
    }
    const entries = [];
    try {
      for await (const entry of await opendir(path === "." ? root : await safePath(root, path))) {
        if (++budget.entries > 4096) {
          budget.exhausted = true;
          return;
        }
        entries.push(entry);
      }
    } catch {
      return;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    let scope = inherited;
    const cargo = entries.find((entry) => entry.name === "Cargo.toml");
    if (cargo) {
      if (!cargo.isFile()) return;
      if (++budget.manifests > 256) {
        budget.exhausted = true;
        return;
      }
      try {
        const text = await readManaged(root, posix.join(path, "Cargo.toml"), 64 * 1024);
        if (text === undefined) return;
        const parsed = Manifest.safeParse(parse(text, { maxDepth: 32 }));
        if (!parsed.success) return;
        scope = workspace(path, parsed.data) ?? scope;
        if (parsed.data.package && (!scope || included(scope, path)))
          records.push({ path, manifest: parsed.data, scope });
      } catch {
        /* Malformed or replaced manifests cannot provide setup metadata. */
        return;
      }
    }
    for (const entry of entries) {
      if (budget.exhausted) return;
      if (!entry.isDirectory() || entry.name.startsWith(".") || IGNORED.has(entry.name)) continue;
      const child = posix.join(path, entry.name);
      if (scope ? !included(scope, child, true) : SOURCE_DIRECTORIES.has(entry.name)) continue;
      await scan(child, depth + 1, scope);
    }
  }
  await scan(".", 0);
  if (budget.exhausted) return [];
  const projects: RustProject[] = [];
  for (const record of records) {
    if (record.manifest.package && (await binary(root, record.path, record.manifest))) {
      const name = record.manifest.package.name;
      projects.push({
        name,
        kind: name.toLowerCase().includes("worker") ? "worker" : "backend",
        framework: framework(record.manifest, record.scope),
        path: record.path
      });
    }
  }
  return projects;
}
