import { afterEach, describe, expect, it, vi } from "vitest";

import { createApiServer } from "../../../apps/api/src/server.js";
import { buildCsrfToken, SESSION_COOKIE_NAME } from "../../../packages/auth/src/index.js";
import type { ApiServerDependencies } from "../../helpers/api-tokens.js";
import { mockedObject } from "../../helpers/vitest.js";

const sessionToken = "session-secret";
const sessionHeaders = {
  cookie: `${SESSION_COOKIE_NAME}=${sessionToken}`,
  "x-csrf-token": buildCsrfToken(sessionToken)
};

function createRateLimitedServer(
  overrides: Pick<ApiServerDependencies, "webAuth" | "accountManagement" | "objectStoreWriter">
) {
  vi.stubEnv("SELFHOST_MODE", "false");
  type AuthRateLimiter = NonNullable<ApiServerDependencies["authRateLimiter"]>;
  const claimRequest = vi.fn<AuthRateLimiter["claimRequest"]>(async ({ limit }) => ({
    allowed: false,
    limit,
    remaining: 0,
    retry_after_ms: 1500
  }));
  const app = createApiServer({
    ingestionPersistence: { persistAndEnqueue: vi.fn() },
    ingestionMetadata: { resolveProjectByTokenHash: vi.fn() },
    memberAuth: { resolveMemberByTokenHash: vi.fn() },
    authRateLimiter: mockedObject<AuthRateLimiter>({ claimRequest }),
    tokenManagement: mockedObject<ApiServerDependencies["tokenManagement"]>({}),
    incidentRetrieval: mockedObject<ApiServerDependencies["incidentRetrieval"]>({}),
    objectStoreReader: { getObject: vi.fn() },
    webhookDelivery: {
      listDeliveriesForWebhookInOrganization: vi.fn(),
      retryDeliveryForOrganization: vi.fn()
    },
    ...overrides
  });
  return { app, claimRequest };
}

describe("account and auth mutation rate limits", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("limits Gravatar imports by user before fetching or storing an avatar", async () => {
    const fetchAvatar = vi
      .fn()
      .mockResolvedValue(
        new Response("avatar-image", { headers: { "Content-Type": "image/png" } })
      );
    vi.stubGlobal("fetch", fetchAvatar);
    const putObject = vi.fn();
    const saveUserAvatar = vi.fn().mockResolvedValue(null);
    const { app, claimRequest } = createRateLimitedServer({
      webAuth: mockedObject<NonNullable<ApiServerDependencies["webAuth"]>>({
        resolveSessionByToken: vi.fn().mockResolvedValue({
          user_id: "usr_123",
          email: "avatar@example.test"
        })
      }),
      accountManagement: mockedObject<NonNullable<ApiServerDependencies["accountManagement"]>>({
        saveUserAvatar
      }),
      objectStoreWriter: { putObject }
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/v1/account/avatar/import-gravatar",
        headers: sessionHeaders
      });

      expect(response.statusCode).toBe(429);
      expect(response.json()).toEqual({ error: "rate_limited" });
      expect(response.headers["retry-after"]).toBe("2");
      expect(claimRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          bucket: "management-write",
          subject: "account-avatar-import:usr_123",
          limit: 30
        })
      );
      expect(fetchAvatar).not.toHaveBeenCalled();
      expect(putObject).not.toHaveBeenCalled();
      expect(saveUserAvatar).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("uses the shared auth IP limit before processing a project invite", async () => {
    const acceptInviteForSession = vi.fn().mockResolvedValue({ ok: false, error: "invalid_token" });
    const { app, claimRequest } = createRateLimitedServer({
      webAuth: mockedObject<NonNullable<ApiServerDependencies["webAuth"]>>({
        acceptInviteForSession
      })
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/v1/auth/project-invite/accept",
        remoteAddress: "192.0.2.10",
        headers: sessionHeaders,
        payload: { token: "dbundle_invite_fixture" }
      });

      expect(response.statusCode).toBe(429);
      expect(response.json()).toEqual({ error: "rate_limited" });
      expect(response.headers["retry-after"]).toBe("2");
      expect(claimRequest).toHaveBeenCalledWith({
        ip: "192.0.2.10",
        bucket: "auth",
        limit: 10,
        now: expect.any(String)
      });
      expect(acceptInviteForSession).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
