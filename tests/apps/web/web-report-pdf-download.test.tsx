// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ReportPdfDownloadButton } from "../../../apps/web/src/components/system/report-pdf-download-button.js";
import type { ReportPdfState } from "../../../packages/smart-reports/src/report-pdf.js";
import { reportOrg, reportRequest } from "../../helpers/smart-reports.js";
const calls = vi.hoisted(() => ({ status: vi.fn(), request: vi.fn(), download: vi.fn() }));
vi.mock("../../../apps/web/src/lib/report-api.js", () => ({
  reportApi: { pdf: calls },
  reportScope: (organizationId: string) => ({ organizationId, bearerToken: "browser-session" }),
  reportErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "Unavailable")
}));
let save: ReturnType<typeof vi.spyOn>;
const pdf = (status: ReportPdfState["status"]): ReportPdfState => ({
  run_id: reportRequest,
  status,
  retry_after_seconds: null
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:report-preview"),
    revokeObjectURL: vi.fn()
  });
  save = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  calls.request.mockResolvedValue(pdf("queued"));
  calls.status.mockResolvedValue(pdf("ready"));
  calls.download.mockResolvedValue(new TextEncoder().encode("%PDF-1.7\n%%EOF\n"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});
function Example({ initial = "not_requested" }: { initial?: ReportPdfState["status"] }) {
  const [state, setState] = useState(pdf(initial)),
    [error, setError] = useState<string | null>(null);
  return (
    <>
      <ReportPdfDownloadButton
        organizationId={reportOrg}
        runId={reportRequest}
        pdf={state}
        onPdfChange={setState}
        onError={setError}
      />
      {error ? <p role="alert">{error}</p> : null}
    </>
  );
}
const click = async () =>
  act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));
  });
const tick = async () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
it("prepares once, shows inline progress and automatically saves exactly one PDF when ready", async () => {
  calls.status.mockResolvedValueOnce(pdf("processing")).mockResolvedValue(pdf("ready"));
  render(<Example />);
  await click();
  const busy = screen.getByRole("button", { name: "Preparing PDF..." });
  expect(busy).toBeDisabled();
  expect(busy.querySelector("svg")).toHaveClass("animate-spin");
  fireEvent.click(busy);
  expect(calls.request).toHaveBeenCalledOnce();
  await tick();
  await tick();
  expect(calls.download).toHaveBeenCalledOnce();
  expect(save).toHaveBeenCalledOnce();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:report-preview");
  expect(screen.getByRole("button", { name: "Download PDF" })).toBeEnabled();
});
it("downloads a cached PDF directly and keeps pending state through the file read", async () => {
  let finish!: (bytes: Uint8Array) => void;
  calls.download.mockImplementationOnce(
    () =>
      new Promise<Uint8Array>((resolve) => {
        finish = resolve;
      })
  );
  render(<Example initial="ready" />);
  await click();
  expect(screen.getByRole("button", { name: "Preparing PDF..." })).toBeDisabled();
  expect(calls.request).not.toHaveBeenCalled();
  await act(async () => {
    finish(new Uint8Array([1]));
  });
  expect(save).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "Download PDF" })).toBeEnabled();
});
it("does not download an already queued PDF until the user requests it", async () => {
  render(<Example initial="queued" />);
  await tick();
  expect(calls.download).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
  await click();
  expect(calls.request).not.toHaveBeenCalled();
  expect(save).toHaveBeenCalledOnce();
});
it("restores Download PDF with an error when preparation fails", async () => {
  calls.request.mockRejectedValueOnce(new Error("Preparation unavailable"));
  render(<Example />);
  await click();
  expect(screen.getByRole("alert")).toHaveTextContent("Preparation unavailable");
  expect(screen.getByRole("button", { name: "Download PDF" })).toBeEnabled();
  expect(calls.download).not.toHaveBeenCalled();
});
it("retries an interrupted status read without requesting another PDF preparation", async () => {
  calls.status
    .mockRejectedValueOnce(new Error("Status unavailable"))
    .mockResolvedValue(pdf("ready"));
  render(<Example />);
  await click();
  await tick();
  expect(screen.getByRole("button", { name: "Download PDF" })).toBeEnabled();
  await click();
  await tick();
  expect(calls.request).toHaveBeenCalledOnce();
  expect(save).toHaveBeenCalledOnce();
});
it("discards a file response after navigation without creating a download URL", async () => {
  let finish!: (bytes: Uint8Array) => void;
  calls.download.mockImplementationOnce(
    () =>
      new Promise<Uint8Array>((resolve) => {
        finish = resolve;
      })
  );
  const view = render(<Example initial="ready" />);
  await click();
  view.unmount();
  await act(async () => {
    finish(new Uint8Array([1]));
  });
  expect(save).not.toHaveBeenCalled();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
