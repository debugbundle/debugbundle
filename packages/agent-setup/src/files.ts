import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, rename, unlink } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export const digest = (text: string): string => createHash("sha256").update(text).digest("hex");
export const isMissing = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";

/** Never traverse project-controlled symlinks when reading or changing managed files. */
export async function safePath(root: string, file: string, allowLeafLink = false): Promise<string> {
  const target = resolve(root, file);
  const rel = relative(root, target);
  if (isAbsolute(file) || !rel || rel === ".." || rel.startsWith(`..${sep}`))
    throw new Error("Invalid managed path.");
  let cursor = root;
  const parts = rel.split(sep);
  for (let i = 0; i < parts.length; i++) {
    cursor = join(cursor, parts[i]!);
    try {
      const info = await lstat(cursor);
      if (info.isSymbolicLink() && !(allowLeafLink && i === parts.length - 1))
        throw new Error(`Unsafe symbolic link: ${file}`);
      if (i < parts.length - 1 && !info.isDirectory())
        throw new Error(`Invalid parent directory: ${file}`);
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }
  return target;
}

export async function readManaged(root: string, file: string): Promise<string | undefined> {
  const path = await safePath(root, file);
  try {
    const initial = await lstat(path);
    if (!initial.isFile() || initial.size > 1024 * 1024)
      throw new Error(`Invalid or oversized managed file: ${file}`);
    // O_NONBLOCK also avoids a hang if a regular file is replaced by a FIFO after lstat.
    const handle = await open(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
    );
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > 1024 * 1024)
        throw new Error(`Invalid or oversized managed file: ${file}`);
      // Bounded even if another process grows the file after stat.
      const buffer = Buffer.alloc(1024 * 1024 + 1);
      let total = 0;
      while (total < buffer.length) {
        const { bytesRead } = await handle.read(buffer, total, buffer.length - total, total);
        if (bytesRead === 0) break;
        total += bytesRead;
      }
      if (total > 1024 * 1024) throw new Error(`Oversized managed file: ${file}`);
      try {
        return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
          buffer.subarray(0, total)
        );
      } catch {
        throw new Error(`Invalid UTF-8 managed file: ${file}`);
      }
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

/** Compare before replacement; a sibling temp file avoids following a destination link. */
export async function writeManaged(
  root: string,
  file: string,
  value: string,
  expected: string | undefined
): Promise<void> {
  const path = await safePath(root, file);
  await mkdir(dirname(path), { recursive: true });
  await safePath(root, file);
  const previousMode = await lstat(path)
    .then((info) => info.mode & 0o777)
    .catch((error: unknown) => {
      if (!isMissing(error)) throw error;
      return undefined;
    });
  const temporary = `${path}.${randomUUID()}.tmp`;
  const handle = await open(
    temporary,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600
  );
  try {
    await handle.writeFile(value, "utf8");
    if (previousMode !== undefined) await handle.chmod(previousMode);
    await handle.close();
    if ((await readManaged(root, file)) !== expected)
      throw new Error(`File changed during setup: ${file}`);
    await safePath(root, file);
    await rename(temporary, path);
  } finally {
    await handle.close();
    await unlink(temporary).catch((error: unknown) => {
      if (!isMissing(error)) throw error;
    });
  }
}

export async function projectRoot(cwd: string): Promise<string> {
  const start = await realpath(cwd);
  let cursor = start;
  while (true) {
    if ((await readManaged(cursor, ".debugbundle/profile.json")) !== undefined) return cursor;
    try {
      await lstat(join(cursor, ".git"));
      return start;
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    const parent = dirname(cursor);
    if (parent === cursor) return start;
    cursor = parent;
  }
}
