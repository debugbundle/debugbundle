import { digest, readManaged, writeManaged } from "./files.js";
import { CANONICAL, type FileReport } from "./model.js";

/** The caller supplies canonical generated content; metadata only proves ownership. */
export async function syncFiles(
  root: string,
  files: Record<string, string>,
  hashes: Record<string, string>,
  fix: boolean,
  prefix = CANONICAL,
  legacyHashes: Record<string, string> = {}
): Promise<FileReport[]> {
  const reports: FileReport[] = [];
  for (const [file, expected] of Object.entries(files)) {
    const path = `${prefix}/${file}`;
    try {
      const current = await readManaged(root, path);
      let status: FileReport["status"] =
        current === undefined
          ? "missing"
          : current === expected
            ? "ok"
            : hashes[file] === digest(current) ||
                (hashes[file] === undefined && legacyHashes[file] === digest(current))
              ? "stale"
              : "conflict";
      if (fix && (status === "missing" || status === "stale")) {
        await writeManaged(root, path, expected, current);
        status = "ok";
      }
      if (fix && status === "ok") hashes[file] = digest(expected);
      reports.push({
        path,
        status,
        message:
          status === "conflict"
            ? `Preserved edited or unowned file: ${path}. Review it manually.`
            : `${status}: ${path}`
      });
    } catch {
      reports.push({
        path,
        status: "conflict",
        message: `Cannot safely access ${path}; review its file type and parent directories.`
      });
    }
  }
  return reports;
}
