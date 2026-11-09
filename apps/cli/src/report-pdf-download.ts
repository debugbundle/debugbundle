import { link, lstat, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { CliInputError } from "./argv-helpers.js";

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

/** Publish a complete private file atomically without overwriting another writer's output. */
export async function saveReportPdf(
  outputPath: string,
  download: () => Promise<Uint8Array>
): Promise<{ saved_to: string; bytes: number }> {
  const target = resolve(outputPath);
  try {
    await lstat(target);
    throw new CliInputError("report_pdf_output_exists");
  } catch (error) {
    if (!hasCode(error, "ENOENT")) throw error;
  }
  const bytes = await download();
  let staging: string | undefined;
  try {
    staging = await mkdtemp(join(dirname(target), ".debugbundle-report-"));
    const source = join(staging, "report.pdf");
    await writeFile(source, bytes, { flag: "wx", mode: 0o600 });
    // A same-filesystem hard link is atomic and fails if any target already exists.
    await link(source, target);
    return { saved_to: target, bytes: bytes.byteLength };
  } catch (error) {
    throw new CliInputError(
      hasCode(error, "EEXIST") ? "report_pdf_output_exists" : "report_pdf_write_failed"
    );
  } finally {
    if (staging) await rm(staging, { recursive: true, force: true });
  }
}
