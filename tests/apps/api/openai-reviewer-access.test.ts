import { PassThrough } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";

import type Provider from "oidc-provider";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { hashPassword } from "../../../packages/auth/src/index.js";
import { createOpenAiReviewerAuthorization } from "../../../apps/api/src/openai-reviewer-access.js";

const CREDENTIAL = "reviewer-credential-with-at-least-thirty-two-characters";
const REVIEWER_USER_ID = "11111111-1111-4111-8111-111111111111";
const REVIEWER_ORGANIZATION_ID = "22222222-2222-4222-8222-222222222222";
let credentialHash: string;

beforeAll(async () => {
  credentialHash = await hashPassword(CREDENTIAL);
});

function interaction(prompt: "login" | "consent"): Record<string, unknown> {
  return {
    uid: "reviewer-interaction",
    prompt: { name: prompt, details: {} },
    params: {
      client_id: "https://chatgpt.com/oauth/client.json",
      redirect_uri: "https://chatgpt.com/connector_platform_oauth_redirect",
      resource: "https://mcp.debugbundle.com",
      response_type: "code",
      scope:
        "openid email debugbundle:projects:read debugbundle:incidents:read debugbundle:artifacts:read debugbundle:improvements:read debugbundle:analytics:read debugbundle:health:read",
      code_challenge: "a".repeat(43),
      code_challenge_method: "S256"
    },
    session: { accountId: REVIEWER_USER_ID }
  };
}

function createProvider(prompt: "login" | "consent") {
  const interactionResult = vi.fn(async () => "https://api.debugbundle.com/oauth/authorize/resume");
  const grantSave = vi.fn(async () => "provider-grant-id");
  class Grant {
    addOIDCScope = vi.fn();
    addResourceScope = vi.fn();
    save = grantSave;
  }
  return {
    provider: {
      Grant,
      interactionDetails: vi.fn(async () => interaction(prompt)),
      interactionResult
    } as unknown as Provider,
    interactionResult,
    grantSave
  };
}

function transport(): { request: IncomingMessage; response: ServerResponse } {
  return {
    request: new PassThrough() as unknown as IncomingMessage,
    response: new PassThrough() as unknown as ServerResponse
  };
}

describe("OpenAI synthetic reviewer authorization", () => {
  it("establishes the fixed reviewer login and synthetic grant in one credential submission", async () => {
    const provider = createProvider("login");
    const boundary = {
      assertSyntheticBoundary: vi.fn(async () => undefined),
      audit: vi.fn(async () => undefined)
    };
    const authorization = createOpenAiReviewerAuthorization({
      provider: provider.provider,
      oauthStore: { createGrant: vi.fn(async () => "domain-grant-id"), revokeGrant: vi.fn() },
      boundary,
      credentialHash,
      expiresAt: "2027-08-30T00:00:00.000Z",
      userId: REVIEWER_USER_ID,
      organizationId: REVIEWER_ORGANIZATION_ID
    });

    await authorization.complete({
      interactionId: "reviewer-interaction",
      credential: CREDENTIAL,
      ...transport()
    });

    expect(boundary.assertSyntheticBoundary).toHaveBeenCalledOnce();
    expect(provider.interactionResult).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      {
        login: { accountId: REVIEWER_USER_ID },
        consent: { grantId: "provider-grant-id" }
      },
      { mergeWithLastSubmission: false }
    );
  });

  it("creates the exact eight-scope synthetic grant and backing revocable record", async () => {
    const provider = createProvider("consent");
    const createGrant = vi.fn(async () => "domain-grant-id");
    const authorization = createOpenAiReviewerAuthorization({
      provider: provider.provider,
      oauthStore: { createGrant, revokeGrant: vi.fn() },
      boundary: {
        assertSyntheticBoundary: vi.fn(async () => undefined),
        audit: vi.fn(async () => undefined)
      },
      credentialHash,
      expiresAt: "2027-08-30T00:00:00.000Z",
      userId: REVIEWER_USER_ID,
      organizationId: REVIEWER_ORGANIZATION_ID
    });

    await authorization.complete({
      interactionId: "reviewer-interaction",
      credential: CREDENTIAL,
      now: new Date("2026-08-30T00:00:00.000Z"),
      ...transport()
    });

    expect(createGrant).toHaveBeenCalledWith({
      providerGrantId: "provider-grant-id",
      userId: REVIEWER_USER_ID,
      organizationId: REVIEWER_ORGANIZATION_ID,
      clientId: "https://chatgpt.com/oauth/client.json",
      resource: "https://mcp.debugbundle.com",
      scopes: [
        "openid",
        "email",
        "debugbundle:projects:read",
        "debugbundle:incidents:read",
        "debugbundle:artifacts:read",
        "debugbundle:improvements:read",
        "debugbundle:analytics:read",
        "debugbundle:health:read"
      ],
      consentedAt: "2026-08-30T00:00:00.000Z",
      expiresAt: "2026-09-29T00:00:00.000Z"
    });
    expect(provider.interactionResult).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { consent: { grantId: "provider-grant-id" } },
      { mergeWithLastSubmission: true }
    );
  });

  it("fails closed for invalid, expired, or boundary-breaking reviewer access", async () => {
    const provider = createProvider("login");
    const boundary = {
      assertSyntheticBoundary: vi.fn(async () => {
        throw new Error("reviewer can see another project");
      }),
      audit: vi.fn(async () => undefined)
    };
    const authorization = createOpenAiReviewerAuthorization({
      provider: provider.provider,
      oauthStore: { createGrant: vi.fn(), revokeGrant: vi.fn() },
      boundary,
      credentialHash,
      expiresAt: "2027-08-30T00:00:00.000Z",
      userId: REVIEWER_USER_ID,
      organizationId: REVIEWER_ORGANIZATION_ID
    });

    await expect(
      authorization.complete({
        interactionId: "reviewer-interaction",
        credential: "x".repeat(40),
        ...transport()
      })
    ).rejects.toThrow("openai_reviewer_access_denied");
    await expect(
      authorization.complete({
        interactionId: "reviewer-interaction",
        credential: CREDENTIAL,
        ...transport()
      })
    ).rejects.toThrow("reviewer can see another project");
    expect(provider.interactionResult).not.toHaveBeenCalled();
  });

  it("binds reviewer credentials to the interaction in the request path", async () => {
    const provider = createProvider("login");
    const authorization = createOpenAiReviewerAuthorization({
      provider: provider.provider,
      oauthStore: { createGrant: vi.fn(), revokeGrant: vi.fn() },
      boundary: {
        assertSyntheticBoundary: vi.fn(async () => undefined),
        audit: vi.fn(async () => undefined)
      },
      credentialHash,
      expiresAt: "2027-08-30T00:00:00.000Z",
      userId: REVIEWER_USER_ID,
      organizationId: REVIEWER_ORGANIZATION_ID
    });

    await expect(
      authorization.complete({
        interactionId: "different-interaction",
        credential: CREDENTIAL,
        ...transport()
      })
    ).rejects.toThrow("openai_reviewer_access_denied");
    expect(provider.interactionResult).not.toHaveBeenCalled();
  });
});
