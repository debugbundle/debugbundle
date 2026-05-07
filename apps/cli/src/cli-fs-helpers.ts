import { isAbsolute, join } from "node:path";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isMissingPathError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

export function resolveWorkspacePath(rootDirectory: string, targetPath: string): string {
  return isAbsolute(targetPath) ? targetPath : join(rootDirectory, targetPath);
}
