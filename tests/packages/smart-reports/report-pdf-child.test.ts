import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough, Readable } from "node:stream";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { renderReportPdfInChild } from "../../../packages/smart-reports/src/report-pdf-process.js";
import { reportDocumentFixture } from "../../helpers/report-document.js";
vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
const view = () => ({ document: reportDocumentFixture(), available_source_refs: [] });
function child() {
  const streams = {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn()
  };
  const process = Object.assign(new EventEmitter(), streams);
  vi.mocked(spawn).mockReturnValue(process as unknown as ChildProcessWithoutNullStreams);
  return process;
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
describe("bounded PDF child process", () => {
  it("validates the real child entry point's stdin envelope and withholds output after malformed or oversized input", async () => {
    const render = vi.fn().mockResolvedValue(Buffer.from("%PDF-1.7\n%%EOF\n"));
    vi.doMock("../../../packages/smart-reports/src/report-pdf-node.js", () => ({
      renderReportPdf: render
    }));
    const oldExitCode = process.exitCode;
    try {
      for (const [input, valid] of [
        [Buffer.from(JSON.stringify({ view: view() })), true],
        [Buffer.from("{invalid json"), false],
        [Buffer.alloc(1024 * 1024 + 1), false]
      ] as const) {
        vi.resetModules();
        const stdin = Readable.from([input]);
        vi.spyOn(process.stdin, Symbol.asyncIterator).mockImplementation(() =>
          stdin[Symbol.asyncIterator]()
        );
        const output = vi
          .spyOn(process.stdout, "write")
          .mockImplementation(
            (
              _chunk: Uint8Array | string,
              encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void),
              callback?: (error?: Error | null) => void
            ) => {
              if (typeof encodingOrCallback === "function") encodingOrCallback();
              else callback?.();
              return true;
            }
          );
        const error = vi.spyOn(process.stderr, "write").mockReturnValue(true);
        render.mockClear();
        process.exitCode = 0;
        await import("../../../packages/smart-reports/src/report-pdf-child.js");
        if (valid) {
          expect(render).toHaveBeenCalledOnce();
          expect(output.mock.calls[0]?.[0]).toEqual(Buffer.from("%PDF-1.7\n%%EOF\n"));
          expect(process.exitCode).toBe(0);
          expect(error).not.toHaveBeenCalled();
        } else {
          expect(render).not.toHaveBeenCalled();
          expect(output).not.toHaveBeenCalled();
          expect(process.exitCode).toBe(1);
          expect(error).toHaveBeenCalledExactlyOnceWith("report_pdf_failed\n");
        }
        vi.restoreAllMocks();
      }
    } finally {
      process.exitCode = oldExitCode;
      vi.doUnmock("../../../packages/smart-reports/src/report-pdf-node.js");
    }
  });
  it("rejects non-report, credential-bearing and mismatched online locations before spawning", async () => {
    vi.mocked(spawn).mockClear();
    const document = view().document,
      path = `/reports/${document.report.organization_id}/${document.run_id}`;
    for (const onlineReportUrl of [
      "javascript:alert(1)",
      "https://app.example.test/foreign",
      `https://key:secret@app.example.test${path}`,
      `https://app.example.test${path}?bearer=secret`,
      `https://app.example.test${path}#foreign`
    ])
      await expect(renderReportPdfInChild(view(), { onlineReportUrl })).rejects.toThrow(
        "report_pdf_input_invalid"
      );
    expect(spawn).not.toHaveBeenCalled();
  });
  it("passes only closed canonical input and a small safe environment to a fixed local renderer", async () => {
    const process = child();
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "synthetic-parent-only");
    vi.stubEnv("SMART_REPORT_AI_API_KEY", "synthetic-parent-only");
    const result = renderReportPdfInChild(view());
    expect(vi.mocked(spawn).mock.calls[0]?.[1]).toEqual(
      expect.arrayContaining([
        "--max-old-space-size=128",
        "--import",
        "tsx",
        expect.stringContaining("report-pdf-child.ts")
      ])
    );
    const options = vi.mocked(spawn).mock.calls[0]?.[2];
    expect(options?.env).not.toHaveProperty("AWS_SECRET_ACCESS_KEY");
    expect(options?.env).not.toHaveProperty("SMART_REPORT_AI_API_KEY");
    const written: unknown = process.stdin.read();
    if (!Buffer.isBuffer(written)) throw new Error("report_pdf_test_input_missing");
    expect(JSON.parse(written.toString("utf8"))).toEqual({ view: view() });
    process.stdout.write(Buffer.from("%PDF-1.7\n%%EOF\n"));
    process.emit("close", 0, null);
    expect((await result).subarray(0, 5).toString()).toBe("%PDF-");
  });
  it("kills oversized output and rejects malformed or unsuccessful child responses without exposing stderr", async () => {
    const process = child(),
      result = renderReportPdfInChild(view());
    const refused = expect(result).rejects.toThrow("report_pdf_size_exceeded");
    process.stdout.write(Buffer.alloc(5 * 1024 * 1024 + 1));
    await refused;
    expect(process.kill).toHaveBeenCalledWith("SIGKILL");
    const failed = child(),
      error = renderReportPdfInChild(view());
    failed.stderr.write("synthetic private body");
    failed.emit("close", 1, null);
    await expect(error).rejects.toThrow("report_pdf_child_failed");
    const invalid = child(),
      malformed = renderReportPdfInChild(view());
    invalid.stdout.write("not a PDF");
    invalid.emit("close", 0, null);
    await expect(malformed).rejects.toThrow("report_pdf_child_failed");
  });
  it("enforces a hard deadline and cancellation without starting work for an already aborted request", async () => {
    vi.useFakeTimers();
    const process = child(),
      result = renderReportPdfInChild(view());
    const refused = expect(result).rejects.toThrow("report_pdf_deadline_exceeded");
    await vi.advanceTimersByTimeAsync(20000);
    await refused;
    expect(process.kill).toHaveBeenCalledWith("SIGKILL");
    const controller = new AbortController();
    controller.abort();
    vi.mocked(spawn).mockClear();
    await expect(renderReportPdfInChild(view(), { signal: controller.signal })).rejects.toThrow(
      "report_pdf_cancelled"
    );
    expect(spawn).not.toHaveBeenCalled();
    const active = child(),
      next = new AbortController(),
      pending = renderReportPdfInChild(view(), { signal: next.signal });
    next.abort();
    await expect(pending).rejects.toThrow("report_pdf_cancelled");
    expect(active.kill).toHaveBeenCalledWith("SIGKILL");
  });
});
