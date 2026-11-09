import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { type ReportContentView } from "./report-content.js";
import { ReportPdfRenderInputSchema } from "./report-pdf-input.js";
const MAX_INPUT_BYTES = 1024 * 1024;
const MAX_OUTPUT_BYTES = 5 * 1024 * 1024;
const DEADLINE_MS = 20000;
/** The child receives plain canonical data, a fixed executable/entry point and
 * no inherited provider/database credentials. It cannot change queue authority.
 * The caller must hold a live job and recheck access before attaching output. */
export async function renderReportPdfInChild(
  raw: ReportContentView,
  options: { signal?: AbortSignal; onlineReportUrl?: string } = {}
): Promise<Buffer> {
  if (options.signal?.aborted) throw new Error("report_pdf_cancelled");
  const parsed = ReportPdfRenderInputSchema.safeParse({
    view: raw,
    ...(options.onlineReportUrl === undefined ? {} : { online_report_url: options.onlineReportUrl })
  });
  if (!parsed.success) throw new Error("report_pdf_input_invalid");
  const input = Buffer.from(JSON.stringify(parsed.data));
  if (input.length > MAX_INPUT_BYTES) throw new Error("report_pdf_input_limit_exceeded");
  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--max-old-space-size=128",
        "--import",
        "tsx",
        fileURLToPath(new URL("./report-pdf-child.ts", import.meta.url))
      ],
      {
        cwd: fileURLToPath(new URL("../../../", import.meta.url)),
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
        env: { NODE_ENV: "production", TZ: "UTC", PATH: process.env["PATH"] ?? "/usr/bin:/bin" }
      }
    );
    let settled = false,
      length = 0,
      stderrBytes = 0;
    const chunks: Buffer[] = [];
    const finish = (code?: string): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", cancel);
      if (code !== undefined) {
        child.kill("SIGKILL");
        reject(new Error(code));
        return;
      }
      const body = Buffer.concat(chunks);
      if (
        body.subarray(0, 5).toString() !== "%PDF-" ||
        !/%%EOF\s*$/.test(body.subarray(-32).toString("latin1"))
      ) {
        reject(new Error("report_pdf_child_failed"));
        return;
      }
      resolve(body);
    };
    const cancel = (): void => finish("report_pdf_cancelled");
    const timer = setTimeout(() => finish("report_pdf_deadline_exceeded"), DEADLINE_MS);
    timer.unref();
    options.signal?.addEventListener("abort", cancel, { once: true });
    child.on("error", () => finish("report_pdf_child_failed"));
    child.stdin.on("error", () => finish("report_pdf_child_failed"));
    child.stdout.on("data", (chunk: Buffer) => {
      if (settled) return;
      length += chunk.length;
      if (length > MAX_OUTPUT_BYTES) {
        finish("report_pdf_size_exceeded");
        return;
      }
      chunks.push(chunk);
    });
    // Drain diagnostics without retaining captured content or logging child stacks.
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes > 8192) finish("report_pdf_child_failed");
    });
    child.on("close", (code: number | null) =>
      finish(code === 0 ? undefined : "report_pdf_child_failed")
    );
    if (options.signal?.aborted) cancel();
    if (!settled) child.stdin.end(input);
  });
}
