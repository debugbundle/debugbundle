import { expect, it, vi } from "vitest";
import { createReportBinaryTransport } from "../../../packages/report-client/src/binary-transport.js";
import { reportOrg, reportRequest } from "../../helpers/smart-reports.js";
const request = {
  method: "GET" as const,
  path: `/v1/organizations/${reportOrg}/reports/${reportRequest}/pdf/file`,
  bearerToken: "synthetic-member",
  maxBytes: 1024
};
it("keeps the PDF bytes binary, authenticates the fixed endpoint and refuses redirects", async () => {
  const bytes = new TextEncoder().encode("%PDF-1.7\n%%EOF\n"),
    fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(bytes, { headers: { "content-type": "application/pdf" } }));
  const result = await createReportBinaryTransport({
    baseUrl: "https://api.example.test/",
    fetchImpl
  }).requestBinary(request);
  expect(result.body).toEqual(bytes);
  expect(result.contentType).toBe("application/pdf");
  expect(fetchImpl).toHaveBeenCalledWith(
    `https://api.example.test${request.path}`,
    expect.objectContaining({
      method: "GET",
      redirect: "error",
      headers: { accept: "application/pdf", authorization: "Bearer synthetic-member" },
      signal: expect.any(AbortSignal)
    })
  );
});
it("cancels an oversized stream even without a content-length header", async () => {
  const cancel = vi.fn(),
    stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(10));
        controller.enqueue(new Uint8Array(10));
      },
      cancel
    });
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(stream));
  await expect(
    createReportBinaryTransport({ baseUrl: "https://api.example.test", fetchImpl }).requestBinary({
      ...request,
      maxBytes: 16
    })
  ).rejects.toThrow("report_pdf_download_limit_exceeded");
  expect(cancel).toHaveBeenCalledOnce();
});
it("rejects credential-bearing bases, unsafe paths and caller-expanded byte limits before fetching", async () => {
  const fetchImpl = vi.fn<typeof fetch>(),
    transport = createReportBinaryTransport({ baseUrl: "https://api.example.test", fetchImpl });
  await expect(
    transport.requestBinary({ ...request, path: "//other.example.test/private" })
  ).rejects.toThrow("invalid_report_pdf_request");
  await expect(
    transport.requestBinary({ ...request, maxBytes: 5 * 1024 * 1024 + 1 })
  ).rejects.toThrow("invalid_report_pdf_request");
  await expect(
    createReportBinaryTransport({
      baseUrl: "https://user:secret@example.test",
      fetchImpl
    }).requestBinary(request)
  ).rejects.toThrow("invalid_report_pdf_base_url");
  expect(fetchImpl).not.toHaveBeenCalled();
});
