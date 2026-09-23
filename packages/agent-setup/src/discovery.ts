import { lstat, mkdir, readlink, opendir, rmdir, symlink, unlink } from "node:fs/promises";
import { dirname, posix } from "node:path";
import { syncFiles } from "./canonical.js";
import { digest, isMissing, readManaged, safePath } from "./files.js";
import { LINK, NATIVE, type Manifest, type State } from "./model.js";

export type LinkWriter = (target: string, path: string, type: "dir") => Promise<void>;

async function entries(root: string, dir: string, remaining = { count: 100 }): Promise<string[]> {
  const result: string[] = [];
  for await (const entry of await opendir(await safePath(root, dir))) {
    if (--remaining.count < 0 || entry.isSymbolicLink())
      throw new Error("Unowned native discovery entries.");
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) result.push(`${path}/`, ...(await entries(root, path, remaining)));
    else if (entry.isFile()) result.push(path);
    else throw new Error("Unsupported native discovery entry.");
  }
  return result;
}

// Generated file keys use POSIX separators on every platform, including Windows.
function copyDirectories(files: Record<string, string>): string[] {
  return [
    ...new Set(
      Object.keys(files).flatMap((file) => {
        const parts = posix.dirname(file).split("/");
        return parts[0] === "."
          ? []
          : parts.map((_, index) => posix.join(NATIVE, ...parts.slice(0, index + 1)));
      })
    )
  ].sort((left, right) => right.length - left.length);
}

function hasUnknownEntries(existing: string[], files: Record<string, string>): boolean {
  const allowed = new Set([
    ...Object.keys(files).map((file) => `${NATIVE}/${file}`),
    ...copyDirectories(files).map((dir) => `${dir}/`)
  ]);
  return existing.some((entry) => !allowed.has(entry));
}

export async function removeDiscovery(
  root: string,
  files: Record<string, string>,
  manifest: Manifest
): Promise<string | undefined> {
  if (!manifest.claude) return undefined;
  try {
    const path = await safePath(root, NATIVE, true);
    const info = await lstat(path).catch((error: unknown) => {
      if (!isMissing(error)) throw error;
      return undefined;
    });
    if (info) {
      if (manifest.claude.mode === "link") {
        if (!info.isSymbolicLink() || (await readlink(path)) !== LINK)
          return "claude-code: preserved changed skill link during removal.";
        await unlink(path);
      } else {
        if (!info.isDirectory())
          return "claude-code: preserved changed skill directory during removal.";
        const existing = await entries(root, NATIVE);
        if (hasUnknownEntries(existing, files))
          return "claude-code: preserved extra skill files or directories during removal.";
        for (const file of existing.filter((entry) => !entry.endsWith("/"))) {
          const name = file.slice(NATIVE.length + 1);
          const content = await readManaged(root, file);
          if (
            !(name in files) ||
            content === undefined ||
            digest(content) !== manifest.claude.files[name]
          )
            return "claude-code: preserved edited or extra skill files during removal.";
        }
        for (const file of existing.filter((entry) => !entry.endsWith("/"))) {
          const content = await readManaged(root, file);
          if (
            content === undefined ||
            digest(content) !== manifest.claude.files[file.slice(NATIVE.length + 1)]
          )
            return "claude-code: preserved a skill file changed during removal.";
          await unlink(await safePath(root, file));
        }
        for (const dir of copyDirectories(files))
          await rmdir(await safePath(root, dir)).catch((error: unknown) => {
            if (!isMissing(error)) throw error;
          });
        await rmdir(path);
      }
    }
    delete manifest.claude;
    return undefined;
  } catch {
    return "claude-code: cannot safely remove managed discovery; manual review required.";
  }
}

export async function syncDiscovery(
  root: string,
  files: Record<string, string>,
  manifest: Manifest,
  fix: boolean,
  writeLink: LinkWriter = symlink
): Promise<{ status: State; message: string }> {
  try {
    const path = await safePath(root, NATIVE, true);
    let info = await lstat(path).catch((error: unknown) => {
      if (!isMissing(error)) throw error;
      return undefined;
    });
    if (!info && !fix)
      return {
        status: "missing",
        message: `claude-code: missing ${NATIVE}; run debugbundle validate --fix.`
      };
    if (!info && fix) {
      await mkdir(dirname(path), { recursive: true });
      await safePath(root, NATIVE);
      if (manifest.claude?.mode !== "copy") {
        try {
          await writeLink(LINK, path, "dir");
          manifest.claude = { mode: "link", files: {} };
        } catch (error) {
          const code =
            typeof error === "object" && error !== null && "code" in error ? error.code : "";
          if (!["EPERM", "EACCES", "ENOTSUP", "ENOSYS"].includes(String(code))) throw error;
          manifest.claude = { mode: "copy", files: {} };
        }
      }
      if (manifest.claude?.mode === "copy") await mkdir(path, { recursive: true });
      info = await lstat(path);
    }
    if (info?.isSymbolicLink()) {
      // Inspect the literal target; never follow an unknown link, even inside the repo.
      if ((await readlink(path)) !== LINK || manifest.claude?.mode === "copy")
        return {
          status: "conflict",
          message: "claude-code: preserved unknown or changed skill link."
        };
      return {
        status: "ok",
        message: `claude-code: ${NATIVE} links to the canonical project skill.`
      };
    }
    if (!info?.isDirectory() || manifest.claude?.mode !== "copy")
      return {
        status: "conflict",
        message: "claude-code: preserved unowned native skill directory or file."
      };
    const existing = await entries(root, NATIVE);
    if (hasUnknownEntries(existing, files))
      return { status: "conflict", message: "claude-code: preserved extra native skill files." };
    const reports = await syncFiles(root, files, manifest.claude.files, fix, NATIVE);
    const status =
      reports.find((report) => report.status === "conflict")?.status ??
      reports.find((report) => report.status !== "ok")?.status ??
      "ok";
    return {
      status,
      message:
        `claude-code: ${status} managed copy of the canonical project skill. ${status === "ok" ? "" : "Run debugbundle validate --fix; edited files require manual review."}`.trim()
    };
  } catch {
    return {
      status: "conflict",
      message:
        "claude-code: cannot safely access native discovery; review links and directory permissions."
    };
  }
}
