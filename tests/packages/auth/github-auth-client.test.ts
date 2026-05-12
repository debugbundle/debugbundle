import { describe, expect, it, vi } from "vitest";

import { createGitHubOAuthClient } from "../../../packages/auth/src/github-auth-client.js";

function createClient(fetchImplementation: typeof fetch) {
  return createGitHubOAuthClient({
    clientId: "github-client-id",
    clientSecret: "github-client-secret",
    callbackUrl: "https://api.debugbundle.test/v1/auth/github/callback",
    fetchImplementation,
  });
}

describe("github auth client", () => {
  it("exchanges an oauth code and normalizes the returned direct email", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "gho_123" }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 42, email: "OWEN@EXAMPLE.COM" }), { status: 200 })
      );

    const client = createClient(fetchMock);

    await expect(client.exchangeCodeForIdentity({ code: "oauth-code" })).resolves.toEqual({
      github_user_id: "42",
      email: "owen@example.com",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://github.com/login/oauth/access_token",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          client_id: "github-client-id",
          client_secret: "github-client-secret",
          code: "oauth-code",
          redirect_uri: "https://api.debugbundle.test/v1/auth/github/callback",
        }),
      })
    );
  });

  it("returns null when oauth exchange fails before identity resolution", async () => {
    const failedTokenClient = createClient(vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 500 })));
    const missingTokenClient = createClient(
      vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ not_access_token: true }), { status: 200 }))
    );

    await expect(failedTokenClient.exchangeCodeForIdentity({ code: "oauth-code" })).resolves.toBeNull();
    await expect(missingTokenClient.exchangeCodeForIdentity({ code: "oauth-code" })).resolves.toBeNull();
  });

  it.each([
    [
      "rejects invalid access tokens",
      [new Response("{}", { status: 401 })],
      { ok: false, error: "token_invalid" },
    ],
    [
      "rejects user payloads without a github id",
      [new Response(JSON.stringify({ email: "owen@example.com" }), { status: 200 })],
      { ok: false, error: "token_invalid" },
    ],
    [
      "rejects missing email lookups when the emails endpoint fails",
      [
        new Response(JSON.stringify({ id: 42, email: null }), { status: 200 }),
        new Response("{}", { status: 503 }),
      ],
      { ok: false, error: "email_unavailable" },
    ],
    [
      "rejects identities without a verified primary email",
      [
        new Response(JSON.stringify({ id: 42, email: null }), { status: 200 }),
        new Response(JSON.stringify([{ email: "owen@example.com", primary: false, verified: true }]), { status: 200 }),
      ],
      { ok: false, error: "email_unavailable" },
    ],
  ])("%s", async (_label, responses, expected) => {
    const fetchMock = vi.fn<typeof fetch>();
    for (const response of responses) {
      fetchMock.mockResolvedValueOnce(response);
    }

    const client = createClient(fetchMock);

    await expect(client.resolveIdentityFromAccessToken({ access_token: "gho_123" })).resolves.toEqual(expected);
  });

  it("falls back to the verified primary email endpoint when the user profile omits email", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 42, email: null }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            { email: "not-primary@example.com", primary: false, verified: true },
            { email: "OWEN@EXAMPLE.COM", primary: true, verified: true },
          ]),
          { status: 200 }
        )
      );

    const client = createClient(fetchMock);

    await expect(client.resolveIdentityFromAccessToken({ access_token: "gho_123" })).resolves.toEqual({
      ok: true,
      identity: {
        github_user_id: "42",
        email: "owen@example.com",
      },
    });
  });

  it("starts device authorization and maps provider failures", async () => {
    const successClient = createClient(
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            device_code: "device-code",
            user_code: "ABCD-EFGH",
            verification_uri: "https://github.com/login/device",
            expires_in: 900,
            interval: 5,
          }),
          { status: 200 }
        )
      )
    );
    const disabledClient = createClient(
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ error: "device_flow_disabled" }), { status: 400 })
      )
    );
    const malformedClient = createClient(
      vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ device_code: "missing-fields" }), { status: 200 }))
    );

    await expect(successClient.beginDeviceAuthorization({ scope: "read:user" })).resolves.toEqual({
      ok: true,
      device_code: "device-code",
      user_code: "ABCD-EFGH",
      verification_uri: "https://github.com/login/device",
      expires_in: 900,
      interval: 5,
    });
    await expect(disabledClient.beginDeviceAuthorization({})).resolves.toEqual({
      ok: false,
      error: "device_flow_disabled",
    });
    await expect(malformedClient.beginDeviceAuthorization({})).resolves.toEqual({
      ok: false,
      error: "provider_error",
    });

    const invalidJsonClient = createClient(
      vi.fn<typeof fetch>().mockResolvedValue({ ok: false, json: () => Promise.reject(new Error("bad_json")) } as Response)
    );
    await expect(invalidJsonClient.beginDeviceAuthorization({})).resolves.toEqual({
      ok: false,
      error: "provider_error",
    });
  });

  it("polls device authorization across pending, approval, and terminal provider states", async () => {
    const approvedFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "gho_123" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 42, email: "owen@example.com" }), { status: 200 }));
    const approvedClient = createClient(approvedFetch);

    await expect(approvedClient.pollDeviceAuthorization({ device_code: "device-code", interval_seconds: 7 })).resolves.toEqual({
      status: "approved",
      identity: {
        github_user_id: "42",
        email: "owen@example.com",
      },
    });

    const emailUnavailableClient = createClient(
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "gho_123" }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ id: 42, email: null }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
    );
    await expect(emailUnavailableClient.pollDeviceAuthorization({ device_code: "device-code", interval_seconds: 7 })).resolves.toEqual({
      status: "email_unavailable",
    });

    const pendingClient = createClient(
      vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: "authorization_pending" }), { status: 200 }))
    );
    await expect(pendingClient.pollDeviceAuthorization({ device_code: "device-code", interval_seconds: 7 })).resolves.toEqual({
      status: "pending",
      interval_seconds: 7,
    });

    const slowClient = createClient(
      vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: "slow_down", interval: 11 }), { status: 200 }))
    );
    await expect(slowClient.pollDeviceAuthorization({ device_code: "device-code", interval_seconds: 7 })).resolves.toEqual({
      status: "pending",
      interval_seconds: 11,
    });

    const deniedClient = createClient(
      vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: "access_denied" }), { status: 200 }))
    );
    await expect(deniedClient.pollDeviceAuthorization({ device_code: "device-code", interval_seconds: 7 })).resolves.toEqual({
      status: "denied",
    });

    const expiredClient = createClient(
      vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: "token_expired" }), { status: 200 }))
    );
    await expect(expiredClient.pollDeviceAuthorization({ device_code: "device-code", interval_seconds: 7 })).resolves.toEqual({
      status: "expired",
    });

    const unknownClient = createClient(
      vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: "unknown_error" }), { status: 500 }))
    );
    await expect(unknownClient.pollDeviceAuthorization({ device_code: "device-code", interval_seconds: 7 })).resolves.toEqual({
      status: "provider_error",
    });

    const invalidJsonClient = createClient(
      vi.fn<typeof fetch>().mockResolvedValue({ ok: true, json: () => Promise.reject(new Error("bad_json")) } as Response)
    );
    await expect(invalidJsonClient.pollDeviceAuthorization({ device_code: "device-code", interval_seconds: 7 })).resolves.toEqual({
      status: "provider_error",
    });

    const invalidTokenClient = createClient(
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "gho_123" }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ email: "owen@example.com" }), { status: 200 }))
    );
    await expect(invalidTokenClient.pollDeviceAuthorization({ device_code: "device-code", interval_seconds: 7 })).resolves.toEqual({
      status: "provider_error",
    });
  });
});