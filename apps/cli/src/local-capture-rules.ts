import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { CaptureRulesFileSchema, type CaptureRulesFile } from "../../../packages/shared-types/src/index.js";

export const LOCAL_CAPTURE_RULES_FILE_PATH = ".debugbundle/capture-rules.json";

function isFileNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

export function createEmptyLocalCaptureRulesFile(): CaptureRulesFile {
  return {
    version: 1,
    rules: [],
  };
}

export async function readLocalCaptureRulesFile(rootDirectory: string): Promise<CaptureRulesFile> {
  const filePath = join(rootDirectory, LOCAL_CAPTURE_RULES_FILE_PATH);

  try {
    const contents = await readFile(filePath, "utf8");
    return CaptureRulesFileSchema.parse(JSON.parse(contents));
  } catch (error) {
    if (isFileNotFound(error)) {
      return createEmptyLocalCaptureRulesFile();
    }

    throw error;
  }
}

export async function writeLocalCaptureRulesFile(rootDirectory: string, file: CaptureRulesFile): Promise<void> {
  const filePath = join(rootDirectory, LOCAL_CAPTURE_RULES_FILE_PATH);
  const parsed = CaptureRulesFileSchema.parse(file);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
}
