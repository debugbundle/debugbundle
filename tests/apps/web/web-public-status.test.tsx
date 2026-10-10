// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "../../../apps/web/src/app.tsx";
import { statusPageFixture, statusPublicId } from "../../helpers/public-status.ts";
import { jsonResponse, requestUrl } from "./web-test-helpers.js";
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("revalidates on returning to a background tab and clears the previously displayed status", async () => {
  vi.useFakeTimers();
  const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  let complete: ((response: Response) => void) | undefined;
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse(200, statusPageFixture()))
    .mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          complete = resolve;
        })
    );
  vi.stubGlobal("fetch", fetchMock);
  let view: ReturnType<typeof render>;
  await act(async () => {
    view = render(<App initialEntries={[`/status/${statusPublicId}`]} />);
  });
  expect(screen.getByText("Frontend")).toBeTruthy();
  visibility.mockReturnValue("hidden");
  fireEvent(document, new Event("visibilitychange"));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3_600_000);
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  visibility.mockReturnValue("visible");
  fireEvent(document, new Event("visibilitychange"));
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(screen.queryByText("Frontend")).toBeNull();
  await act(async () => {
    complete?.(jsonResponse(404, {}));
  });
  expect(screen.getByText("This status page is unavailable.")).toBeTruthy();
  view!.unmount();
  fireEvent(document, new Event("visibilitychange"));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
it("refreshes without credentials and removes stale green data after unpublishing", async () => {
  vi.useFakeTimers();
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse(200, statusPageFixture()))
    .mockResolvedValue(jsonResponse(404, { error: "status_page_not_found" }));
  vi.stubGlobal("fetch", fetchMock);
  await act(async () => {
    render(<App initialEntries={[`/status/${statusPublicId}`]} />);
  });
  expect(screen.getByRole("heading", { name: "Product status" })).toBeTruthy();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(screen.getByText("This status page is unavailable.")).toBeTruthy();
  expect(screen.queryByText("Frontend")).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
it("renders the shared health view anonymously without session or management requests", async () => {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    expect(requestUrl(input)).toContain(`/v1/public/status/${statusPublicId}`);
    expect(init?.credentials).toBe("omit");
    return jsonResponse(200, statusPageFixture());
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<App initialEntries={[`/status/${statusPublicId}`]} />);
  expect(await screen.findByRole("heading", { name: "Product status" })).toBeTruthy();
  expect(screen.getByText("Frontend")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Expand Frontend checks" }));
  expect(screen.getByText("Checkout")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Powered by DebugBundle" }).getAttribute("href")).toBe(
    "https://debugbundle.com"
  );
  expect(screen.queryByRole("link", { name: "Open" })).toBeNull();
  expect(screen.queryByText("Subscribe to updates")).toBeNull();
  expect(screen.queryByText("View history")).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("serves dedicated-root status URLs and never opens the private session on unknown paths", async () => {
  vi.stubEnv("VITE_PUBLIC_STATUS_PAGE_BASE_URL", window.location.origin);
  const fetchMock = vi.fn(() => jsonResponse(200, statusPageFixture()));
  vi.stubGlobal("fetch", fetchMock);
  const view = render(<App initialEntries={[`/${statusPublicId}`]} />);
  await screen.findByRole("heading", { name: "Product status" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  view.unmount();
  fetchMock.mockClear();
  render(<App initialEntries={["/login"]} />);
  await screen.findByText("This status page is unavailable.");
  expect(fetchMock).not.toHaveBeenCalled();
});
it("shows a bounded unavailable state for unpublished pages, without a login redirect", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => jsonResponse(404, { error: "status_page_not_found" }))
  );
  render(<App initialEntries={[`/status/${statusPublicId}`]} />);
  await waitFor(() => expect(screen.getByText("This status page is unavailable.")).toBeTruthy());
  expect(screen.queryByText("Sign in")).toBeNull();
});
