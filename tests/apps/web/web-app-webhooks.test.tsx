// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../../apps/web/src/app.js";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.js";
import {
  createProject,
  createSession,
  createWebhook,
  createWebhookDelivery,
  jsonResponse,
  requestUrl
} from "./web-test-helpers.js";

afterEach(() => {
  window.localStorage.clear();
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});

function mockReads(
  webhooks: () => Response | Promise<Response>,
  deliveries: (url: string) => Response | Promise<Response>
) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.endsWith("/v1/auth/session")) return jsonResponse(200, { session: createSession() });
      if (url.endsWith("/v1/projects"))
        return jsonResponse(200, { projects: [createProject({ organization_plan: "team" })] });
      // The setup summary reads a separate, larger list before the page read.
      if (url.includes("/v1/webhooks?") && url.includes("limit=100"))
        return jsonResponse(200, { webhooks: [] });
      if (url.includes("/v1/webhooks?")) return webhooks();
      if (/\/v1\/webhooks\/[^/]+\/deliveries\?/.test(url)) return deliveries(url);
      return jsonResponse(200, {
        services: [],
        activations: [],
        channels: [],
        alerts: [],
        rules: [],
        destinations: [],
        checks: []
      });
    })
  );
}

describe("webhook loading and recovery", () => {
  it("shows a retryable endpoint error instead of leaving skeletons after a failed read", async () => {
    let failing = true;
    mockReads(
      () =>
        failing ? jsonResponse(503, { error: "unavailable" }) : jsonResponse(200, { webhooks: [] }),
      () => jsonResponse(200, { deliveries: [] })
    );
    const user = userEvent.setup();
    const view = render(<App initialEntries={["/projects/proj_123/webhooks"]} />);
    expect(await screen.findByText("Could not load webhook endpoints")).toBeInTheDocument();
    expect(view.container.querySelector('[data-slot="skeleton"]')).toBeNull();
    failing = false;
    await user.click(screen.getByRole("button", { name: "Retry webhook endpoints" }));
    expect(await screen.findByText("No webhook endpoints yet")).toBeInTheDocument();
    expect(screen.getByText("No delivery attempts yet")).toBeInTheDocument();
  });

  it("keeps endpoint configuration visible when delivery history fails and retries that read", async () => {
    let failing = true;
    mockReads(
      () => jsonResponse(200, { webhooks: [createWebhook()] }),
      () =>
        failing
          ? jsonResponse(503, { error: "unavailable" })
          : jsonResponse(200, { deliveries: [createWebhookDelivery()] })
    );
    const user = userEvent.setup();
    render(<App initialEntries={["/projects/proj_123/webhooks"]} />);
    expect(await screen.findByText("Could not load webhook deliveries")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send test webhook" })).toBeInTheDocument();
    expect(screen.queryByText("No delivery attempts yet")).toBeNull();
    failing = false;
    await user.click(screen.getByRole("button", { name: "Retry webhook deliveries" }));
    expect(await screen.findByText("delivered")).toBeInTheDocument();
    expect(screen.queryByText("Could not load webhook deliveries")).toBeNull();
  });

  it("does not show an empty delivery history while its read is still pending", async () => {
    let resolveDelivery!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveDelivery = resolve;
    });
    mockReads(
      () => jsonResponse(200, { webhooks: [createWebhook()] }),
      () => pending
    );
    const view = render(<App initialEntries={["/projects/proj_123/webhooks"]} />);
    expect(await screen.findByRole("button", { name: "Send test webhook" })).toBeInTheDocument();
    expect(screen.queryByText("No delivery attempts yet")).toBeNull();
    view.unmount();
    resolveDelivery(jsonResponse(200, { deliveries: [createWebhookDelivery()] }));
    await waitFor(() => expect(screen.queryByText("delivered")).toBeNull());
  });

  it("retains successful delivery history when another endpoint history fails", async () => {
    mockReads(
      () =>
        jsonResponse(200, {
          webhooks: [createWebhook(), createWebhook({ webhook_id: "wh_other" })]
        }),
      (url) =>
        url.includes("wh_other")
          ? jsonResponse(503, { error: "unavailable" })
          : jsonResponse(200, { deliveries: [createWebhookDelivery()] })
    );
    render(<App initialEntries={["/projects/proj_123/webhooks"]} />);
    expect(await screen.findByText("Could not load webhook deliveries")).toBeInTheDocument();
    expect(screen.getByText("delivered")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Send test webhook" })).toHaveLength(2);
    expect(screen.queryByText("No delivery attempts yet")).toBeNull();
  });
});
