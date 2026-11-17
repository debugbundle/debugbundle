import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCsrfToken, SESSION_COOKIE_NAME } from "../../../packages/auth/src/index.js";
import { mockedObject } from "../../helpers/vitest.js";
import { createTokenApiServer, type ApiServerDependencies } from "../../helpers/api-tokens.js";
import { buildPublicOpenApiSpec } from "../../../apps/api/src/openapi.js";

const path = "/v1/auth/session/renew";
const headers = {
  origin: "http://localhost:5291",
  cookie: `${SESSION_COOKIE_NAME}=session-secret`,
  "x-csrf-token": buildCsrfToken("session-secret")
};
const renewed = {
  session_id: "session-id",
  expires_at: "2026-11-24T12:00:00.000Z",
  absolute_expires_at: "2026-12-01T12:00:00.000Z"
};
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("browser session renewal route", () => {
  it("renews with cookie/CSRF without overwriting a cookie from a concurrent sign-in or logout", async () => {
    const renewSessionByToken = vi.fn().mockResolvedValue(renewed);
    const app = createTokenApiServer({ webAuth: { renewSessionByToken } });
    try {
      const response = await app.inject({ method: "POST", url: path, headers, payload: {} });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(renewed);
      expect(renewSessionByToken).toHaveBeenCalledWith("session-secret", { now: expect.any(Date) });
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.headers["set-cookie"]).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it.each([
    ["missing cookie", { origin: headers.origin }, 401],
    ["missing CSRF", { cookie: headers.cookie, origin: headers.origin }, 403],
    ["missing Origin", { cookie: headers.cookie, "x-csrf-token": headers["x-csrf-token"] }, 403],
    ["foreign Origin", { ...headers, origin: "https://evil.example" }, 403],
    ["bearer with cookie", { ...headers, authorization: "Bearer dbundle_mem_example" }, 401]
  ])("rejects %s before renewal", async (_label, requestHeaders, status) => {
    const renewSessionByToken = vi.fn().mockResolvedValue(renewed);
    const app = createTokenApiServer({ webAuth: { renewSessionByToken } });
    try {
      const response = await app.inject({
        method: "POST",
        url: path,
        headers: requestHeaders,
        payload: {}
      });
      expect(response.statusCode).toBe(status);
      expect(renewSessionByToken).not.toHaveBeenCalled();
      expect(response.headers["set-cookie"]).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it.each([null, "unavailable", "rate limited"])("fails closed for %s", async (state) => {
    const renewSessionByToken = vi.fn().mockResolvedValue(null);
    const app = createTokenApiServer({
      webAuth: state === "unavailable" ? {} : { renewSessionByToken },
      ...(state === "rate limited"
        ? {
            authRateLimiter: {
              claimRequest: vi.fn().mockResolvedValue({ allowed: false, retry_after_ms: 60_000 })
            }
          }
        : {})
    });
    try {
      const response = await app.inject({ method: "POST", url: path, headers, payload: {} });
      expect(response.statusCode).toBe(state === null ? 401 : state === "unavailable" ? 503 : 429);
      expect(response.headers["set-cookie"]).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it("rejects client supplied expiry and documents the browser-only route", async () => {
    const renewSessionByToken = vi.fn().mockResolvedValue(renewed);
    const app = createTokenApiServer({ webAuth: { renewSessionByToken } });
    try {
      expect(
        (
          await app.inject({
            method: "POST",
            url: path,
            headers,
            payload: { expires_at: renewed.expires_at }
          })
        ).statusCode
      ).toBe(400);
      expect(renewSessionByToken).not.toHaveBeenCalled();
      expect(buildPublicOpenApiSpec()).toMatchObject({
        paths: { [path]: { post: { operationId: "renewBrowserSession" } } }
      });
    } finally {
      await app.close();
    }
  });

  it.each(["email", "github"])(
    "sets the absolute cookie deadline at %s sign-in while returning the earlier idle deadline",
    async (method) => {
      const session = {
        session_id: "ses_1",
        user_id: "usr_1",
        email: "owner@example.test",
        email_verified_at: "2026-11-01T12:00:00.000Z",
        organization_id: "org_1",
        role: "owner",
        created_at: "2026-11-01T12:00:00.000Z",
        expires_at: "2026-11-08T12:00:00.000Z",
        revoked_at: null
      };
      const login = {
        ok: true,
        session_token: "session-secret",
        session,
        created_user: false,
        redirect_url: "http://localhost:5291/dashboard",
        accepted_terms_at: null
      };
      const app = createTokenApiServer({
        projectManagement: mockedObject<NonNullable<ApiServerDependencies["projectManagement"]>>({
          listProjectsForOrganization: vi.fn().mockResolvedValue([])
        }),
        webAuth: {
          verifyEmailCode: vi.fn().mockResolvedValue(login),
          completeGithubAuth: vi.fn().mockResolvedValue(login)
        }
      });
      try {
        const response = await app.inject(
          method === "email"
            ? {
                method: "POST",
                url: "/v1/auth/verify-code",
                payload: { email: session.email, code: "123456" }
              }
            : {
                method: "GET",
                url: "/v1/auth/github/callback?code=test&state=test",
                headers: { cookie: "dbundle_github_oauth_state=test" }
              }
        );
        expect(response.statusCode).toBe(method === "email" ? 200 : 302);
        const cookie = String(response.headers["set-cookie"]);
        for (const part of [
          "HttpOnly",
          "Secure",
          "SameSite=Strict",
          "Expires=Tue, 01 Dec 2026 12:00:00 GMT"
        ])
          expect(cookie).toContain(part);
        if (method === "email") expect(response.json().session.expires_at).toBe(session.expires_at);
      } finally {
        await app.close();
      }
    }
  );
});
