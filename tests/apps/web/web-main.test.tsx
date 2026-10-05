// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ initialize: vi.fn(), observe: vi.fn(), render: vi.fn() }));
vi.mock("react-dom/client", () => ({ createRoot: () => ({ render: mocks.render }) }));
vi.mock("../../../apps/web/src/app.js", () => ({ App: () => null }));
vi.mock("../../../apps/web/src/lib/dogfooding.js", () => ({
  initializeWebDogfooding: mocks.initialize,
  observeWebAnalyticsConsentWithdrawal: mocks.observe
}));
afterEach(() => {
  document.body.innerHTML = "";
  vi.resetModules();
  vi.clearAllMocks();
});
it("registers cross-tab analytics withdrawal before mounting the application", async () => {
  document.body.innerHTML = '<div id="root"></div>';
  await import("../../../apps/web/src/main.js");
  expect(mocks.initialize).toHaveBeenCalledOnce();
  expect(mocks.observe).toHaveBeenCalledOnce();
  expect(mocks.observe.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.render.mock.invocationCallOrder[0]!
  );
});
it("fails clearly when the application mount is missing", async () => {
  await expect(import("../../../apps/web/src/main.js")).rejects.toThrow(
    "debugbundle_web_root_not_found"
  );
  expect(mocks.render).not.toHaveBeenCalled();
});
