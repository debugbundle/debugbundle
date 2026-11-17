import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deleteAlert,
  deleteProjectWeeklyReportChannel,
  exportAccountData,
  getIncidentBundle,
  getSession,
  InvalidSessionError,
  logout,
  resetBrowserSessionClientState,
  subscribeToBrowserSessionInvalidation,
  verifyEmailCode
} from "../../../apps/web/src/lib/api.js";
import { buildBrowserSessionHeaders } from "../../../apps/web/src/lib/api-client.js";
import { renewBrowserSession } from "../../../apps/web/src/lib/api-auth.js";
import { listProjectCaptureRules } from "../../../apps/web/src/lib/capture-rules-api.js";
import { listProjectMembers } from "../../../apps/web/src/lib/project-sharing-api.js";
import {
  deleteProjectSlackDestination,
  listProjectSlackDestinations
} from "../../../apps/web/src/lib/slack-api.js";
import { requestNotificationPreferences } from "../../../apps/web/src/lib/api-notification-preferences.js";
import { createSession } from "./web-test-helpers.js";

afterEach(() => {
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});

const requests: [string, () => Promise<unknown>][] = [
  ["session renewal", () => renewBrowserSession()],
  ["capture rules", () => listProjectCaptureRules("proj_1")],
  ["project members", () => listProjectMembers("proj_1")],
  ["Slack destinations", () => listProjectSlackDestinations("proj_1")],
  ["Slack deletion", () => deleteProjectSlackDestination("proj_1", "dest_1")],
  ["alert deletion", () => deleteAlert("alert_1", "proj_1")],
  ["weekly report deletion", () => deleteProjectWeeklyReportChannel("channel_1")],
  ["account export", () => exportAccountData()],
  ["incident download", () => getIncidentBundle("inc_1")],
  [
    "notification preferences",
    () => requestNotificationPreferences({ audience: "personal" }, "get")
  ]
];

describe("browser session API boundaries", () => {
  it("does not invalidate a new sign-in when an old renewal error body arrives late", async () => {
    const session = createSession();
    const replacement = createSession({
      session_id: "replacement",
      csrf_token: "replacement-csrf"
    });
    let finish!: (body: unknown) => void;
    const response = new Response(null, { status: 401 });
    const readBody = vi.spyOn(response, "json").mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ session })))
        .mockResolvedValueOnce(response)
        .mockResolvedValueOnce(new Response(JSON.stringify({ session: replacement })))
    );
    await getSession();
    const invalidated = vi.fn();
    subscribeToBrowserSessionInvalidation(invalidated);
    const pending = renewBrowserSession();
    await vi.waitFor(() => expect(readBody).toHaveBeenCalled());
    await verifyEmailCode({ email: "owner@example.test", code: "123456" });
    finish({ error: "invalid_session" });
    await expect(pending).rejects.toThrow();
    expect(invalidated).not.toHaveBeenCalled();
    expect(buildBrowserSessionHeaders()).toEqual({ "X-CSRF-Token": "replacement-csrf" });
  });
  it("renews with CSRF and updates only the matching session expiry", async () => {
    const session = createSession();
    const expires_at = "2026-11-24T12:00:00.000Z";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ session })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            session_id: session.session_id,
            expires_at,
            absolute_expires_at: "2026-12-01T12:00:00.000Z"
          })
        )
      );
    vi.stubGlobal("fetch", fetchMock);
    await getSession();
    expect(await renewBrowserSession()).toEqual({ ...session, expires_at });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "X-CSRF-Token": session.csrf_token },
      body: "{}"
    });
  });

  it.each([200, 401])(
    "ignores a late renewal response (%s) after a new sign-in",
    async (status) => {
      let finish!: (response: Response) => void;
      const session = createSession();
      const replacement = createSession({
        session_id: "replacement",
        csrf_token: "replacement-csrf"
      });
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValueOnce(new Response(JSON.stringify({ session })))
          .mockImplementationOnce(
            () =>
              new Promise<Response>((resolve) => {
                finish = resolve;
              })
          )
          .mockResolvedValueOnce(new Response(JSON.stringify({ session: replacement })))
      );
      await getSession();
      const invalidated = vi.fn();
      subscribeToBrowserSessionInvalidation(invalidated);
      const pending = renewBrowserSession();
      await verifyEmailCode({ email: "owner@example.test", code: "123456" });
      finish(
        new Response(
          JSON.stringify(
            status === 401
              ? { error: "invalid_session" }
              : {
                  session_id: session.session_id,
                  expires_at: "2026-11-24T12:00:00.000Z",
                  absolute_expires_at: "2026-12-01T12:00:00.000Z"
                }
          ),
          { status }
        )
      );
      expect(await pending).toEqual(replacement);
      expect(invalidated).not.toHaveBeenCalled();
      expect(buildBrowserSessionHeaders()).toEqual({ "X-CSRF-Token": "replacement-csrf" });
    }
  );
  describe.each(["invalid_session", "invalid_member_token"])("%s responses", (error) => {
    it.each(requests)("invalidates and clears CSRF for %s", async (_label, request) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValueOnce(new Response(JSON.stringify({ session: createSession() })))
          .mockImplementation(async () => new Response(JSON.stringify({ error }), { status: 401 }))
      );
      await getSession();
      const invalidated = vi.fn();
      subscribeToBrowserSessionInvalidation(invalidated);
      await expect(request()).rejects.toBeInstanceOf(InvalidSessionError);
      expect(invalidated).toHaveBeenCalledOnce();
      expect(buildBrowserSessionHeaders()).toEqual({});
    });
  });

  it.each(["sign-out", "new sign-in"])(
    "does not overwrite %s with an earlier session read",
    async (action) => {
      let finish!: (response: Response) => void;
      const newSession = createSession({ session_id: "new-session", csrf_token: "new-csrf" });
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ session: createSession() })))
        .mockImplementationOnce(
          () =>
            new Promise<Response>((resolve) => {
              finish = resolve;
            })
        )
        .mockResolvedValueOnce(new Response(JSON.stringify({ session: newSession })));
      vi.stubGlobal("fetch", fetchMock);
      await getSession();
      const pending = getSession();
      if (action === "sign-out") await logout();
      else await verifyEmailCode({ email: "owner@example.com", code: "123456" });
      finish(
        new Response(JSON.stringify({ session: action === "sign-out" ? createSession() : null }))
      );
      expect(await pending).toEqual(action === "sign-out" ? null : newSession);
      expect(buildBrowserSessionHeaders()).toEqual(
        action === "sign-out" ? {} : { "X-CSRF-Token": "new-csrf" }
      );
      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
        credentials: "include",
        cache: "no-store"
      });
    }
  );
});
