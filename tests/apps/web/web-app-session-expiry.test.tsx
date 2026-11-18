// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../../apps/web/src/app.js";
import { listProjects, resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.js";
import * as notify from "../../../apps/web/src/lib/notify.js";
import { createSession, jsonResponse, requestUrl } from "./web-test-helpers.js";

afterEach(() => {
  cleanup();
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("expired browser sessions", () => {
  it.each(["focus", "visibilitychange", "protected request"])(
    "returns to sign-in once after %s confirms expiry",
    async (trigger) => {
      let expired = false;
      const info = vi.spyOn(notify, "showInfoToast");
      vi.stubGlobal(
        "fetch",
        vi.fn((input: RequestInfo | URL) => {
          if (requestUrl(input).endsWith("/v1/auth/session")) {
            return jsonResponse(200, { session: expired ? null : createSession() });
          }
          if (expired) return jsonResponse(401, { error: "invalid_member_token" });
          return jsonResponse(200, {
            projects: [],
            organizations: [],
            incidents: [],
            total_count: 0
          });
        })
      );
      vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
      render(<App initialEntries={["/dashboard"]} />);
      await screen.findByText("Incidents today", { selector: "[data-slot=card-title]" });
      expired = true;
      if (trigger === "protected request") {
        await act(async () => {
          await expect(listProjects()).rejects.toThrow("invalid_session");
        });
      } else {
        fireEvent(trigger === "focus" ? window : document, new Event(trigger));
      }
      expect(
        await screen.findByRole("heading", { name: /continue to debugbundle/i })
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(info).toHaveBeenCalledWith("Your session expired. Please sign in again.")
      );
      expect(info).toHaveBeenCalledTimes(1);
      expect(screen.queryByText("Could not refresh the current page.")).not.toBeInTheDocument();
    }
  );
});
