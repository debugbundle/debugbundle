import { afterEach, expect, it, vi } from "vitest";
import { reportApi, reportScope } from "../../../apps/web/src/lib/report-api.js";
import { reportOrg, reportRequest } from "../../helpers/smart-reports.js";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it.each(["", "https://api.example.test/prefix", "/api"])(
  "downloads through the bounded session transport with API base %s and no browser marker",
  async (base) => {
    vi.stubEnv("VITE_API_URL", base);
    vi.stubGlobal("window", { location: new URL("http://preview.example.test/reports") });
    const body = new TextEncoder().encode("%PDF-1.7\n%%EOF\n");
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(body, { headers: { "content-type": "application/pdf" } }));
    vi.stubGlobal("fetch", request);
    await expect(
      reportApi.pdf.download({ ...reportScope(reportOrg), runId: reportRequest })
    ).resolves.toEqual(body);
    expect(request.mock.calls[0]?.[0]).toEqual(
      expect.stringContaining(`/reports/${reportRequest}/pdf/file`)
    );
    const options = request.mock.calls[0]?.[1];
    expect(options?.credentials).toBe("include");
    expect(options?.redirect).toBe("error");
    expect(new Headers(options?.headers).has("authorization")).toBe(false);
    expect(request.mock.calls[0]?.[0]).toBe(
      (base === "/api" ? "http://preview.example.test/api" : base) +
        `/v1/organizations/${reportOrg}/reports/${reportRequest}/pdf/file`
    );
  }
);
