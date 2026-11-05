import { afterEach, expect, it, vi } from "vitest";
import { listProjectAlerts } from "../../../apps/web/src/lib/api-alerts.js";
import { createAlert, jsonResponse, requestUrl } from "./web-test-helpers.js";
import { globalScope } from "./helpers/alert-scopes.js";

afterEach(() => vi.unstubAllGlobals());

it("keeps default reads unchanged and normalises invalid scope metadata", async () => {
  const fetchMock = vi.fn<(input: RequestInfo | URL) => Response>(() =>
    jsonResponse(200, { alerts: [createAlert({ scope: { ...globalScope(), service_count: 0 } })] })
  );
  vi.stubGlobal("fetch", fetchMock);
  expect((await listProjectAlerts("proj_123"))[0]?.scope).toBeNull();
  expect(requestUrl(fetchMock.mock.calls[0]![0])).not.toContain("include_scope");
});

it("retries only a strict predecessor query rejection, once with the same session", async () => {
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Response>(() =>
    jsonResponse(400, { error: "invalid_query" })
  );
  vi.stubGlobal("fetch", fetchMock);
  await expect(listProjectAlerts("proj_123", 20, { includeScope: true })).rejects.toThrow(
    "invalid_query"
  );
  expect(fetchMock).toHaveBeenCalledTimes(2);
  const urls = fetchMock.mock.calls.map(
    ([input]) => new URL(requestUrl(input), "http://localhost")
  );
  expect(urls[0]?.searchParams.get("include_scope")).toBe("true");
  expect(urls[1]?.searchParams.has("include_scope")).toBe(false);
  expect(urls[0]?.origin).toBe(urls[1]?.origin);
  for (const [, init] of fetchMock.mock.calls) expect(init).toEqual({ credentials: "include" });
});

it.each([401, 403, 500, 503])(
  "does not retry failed scope reads with status %s",
  async (status) => {
    const fetchMock = vi.fn(() => jsonResponse(status, { error: "invalid_query" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(listProjectAlerts("proj_123", 20, { includeScope: true })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  }
);
