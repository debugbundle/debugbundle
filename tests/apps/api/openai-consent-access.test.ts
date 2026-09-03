import type { IncomingMessage, ServerResponse } from "node:http";

import { describe, expect, it, vi } from "vitest";

import {
  createOpenAiConsentAuthorization,
  type OpenAiConsentSession
} from "../../../apps/api/src/openai-consent-access.js";

const PRODUCT_SCOPES = [
  "debugbundle:projects:read",
  "debugbundle:incidents:read",
  "debugbundle:artifacts:read",
  "debugbundle:improvements:read",
  "debugbundle:analytics:read",
  "debugbundle:health:read"
];

function interaction(prompt: "login" | "consent"): Record<string, unknown> {
  return {
    uid: "interaction_123",
    prompt: { name: prompt, details: {} },
    params: {
      client_id: "https://chatgpt.com/oauth/client.json",
      redirect_uri: "https://chatgpt.com/connector_platform_oauth_redirect",
      resource: "https://mcp.debugbundle.com",
      response_type: "code",
      code_challenge_method: "S256",
      code_challenge: "a".repeat(43),
      scope: ["openid", "email", ...PRODUCT_SCOPES].join(" ")
    },
    ...(prompt === "consent" ? { session: { accountId: "user_123" } } : {})
  };
}

function session(overrides: Partial<OpenAiConsentSession> = {}): OpenAiConsentSession {
  return {
    userId: "user_123",
    organizationId: "org_123",
    emailVerified: true,
    ...overrides
  };
}

function createFixture(prompt: "login" | "consent" = "login") {
  const addOIDCScope = vi.fn();
  const addResourceScope = vi.fn();
  const save = vi.fn(async () => "provider_grant_123");
  const interactionResult = vi.fn(async () => "https://api.debugbundle.com/oauth/authorize/resume");
  const provider = {
    interactionDetails: vi.fn(async () => interaction(prompt)),
    interactionResult,
    Grant: class {
      addOIDCScope = addOIDCScope;
      addResourceScope = addResourceScope;
      save = save;
    }
  };
  const oauthStore = {
    createGrant: vi.fn(async () => "grant_123"),
    revokeGrant: vi.fn(async () => undefined),
    revokeGrantByProviderId: vi.fn(async () => false)
  };
  const authorization = createOpenAiConsentAuthorization({
    provider: provider as never,
    oauthStore,
    resolveOrganizationName: vi.fn(async () => "Acme Engineering")
  });

  return { authorization, provider, oauthStore, addOIDCScope, addResourceScope };
}

describe("OpenAI browser consent authorization", () => {
  it("describes only server-authoritative client, organization, identity, and requested scopes", async () => {
    const fixture = createFixture();

    await expect(
      fixture.authorization.describe({
        request: {} as IncomingMessage,
        response: {} as ServerResponse,
        session: session()
      })
    ).resolves.toEqual({
      interaction_id: "interaction_123",
      client_name: "ChatGPT and Codex",
      publisher: "OpenAI",
      organization_name: "Acme Engineering",
      identity_scopes: ["openid", "email"],
      product_scopes: PRODUCT_SCOPES,
      reviewer_access_available: false
    });
  });

  it("finishes login and scoped consent in one explicit allow decision", async () => {
    const fixture = createFixture("login");

    await expect(
      fixture.authorization.complete({
        interactionId: "interaction_123",
        request: {} as IncomingMessage,
        response: {} as ServerResponse,
        session: session(),
        decision: "allow",
        productScopes: ["debugbundle:projects:read", "debugbundle:incidents:read"],
        now: new Date("2026-08-30T12:00:00.000Z")
      })
    ).resolves.toEqual({
      continueUrl: "https://api.debugbundle.com/oauth/authorize/resume"
    });

    expect(fixture.addOIDCScope).toHaveBeenCalledWith("openid email");
    expect(fixture.addResourceScope).toHaveBeenCalledWith(
      "https://mcp.debugbundle.com",
      "debugbundle:projects:read debugbundle:incidents:read"
    );
    expect(fixture.oauthStore.createGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        providerGrantId: "provider_grant_123",
        userId: "user_123",
        organizationId: "org_123",
        scopes: ["openid", "email", "debugbundle:projects:read", "debugbundle:incidents:read"]
      })
    );
    expect(fixture.provider.interactionResult).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      {
        login: { accountId: "user_123" },
        consent: { grantId: "provider_grant_123" }
      },
      { mergeWithLastSubmission: false }
    );
  });

  it("denies without creating a grant and rejects unrequested or unallowlisted scopes", async () => {
    const fixture = createFixture("consent");

    await fixture.authorization.complete({
      interactionId: "interaction_123",
      request: {} as IncomingMessage,
      response: {} as ServerResponse,
      session: session(),
      decision: "deny",
      productScopes: []
    });
    expect(fixture.oauthStore.createGrant).not.toHaveBeenCalled();
    expect(fixture.provider.interactionResult).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      {
        error: "access_denied",
        error_description: "End-User denied the authorization request"
      },
      { mergeWithLastSubmission: false }
    );

    await expect(
      fixture.authorization.complete({
        interactionId: "interaction_123",
        request: {} as IncomingMessage,
        response: {} as ServerResponse,
        session: session(),
        decision: "allow",
        productScopes: ["debugbundle:admin"]
      })
    ).rejects.toThrow("openai_consent_scopes_invalid");
  });

  it("fails closed for an unverified or mismatched browser session", async () => {
    const fixture = createFixture("consent");

    await expect(
      fixture.authorization.describe({
        request: {} as IncomingMessage,
        response: {} as ServerResponse,
        session: session({ emailVerified: false })
      })
    ).rejects.toThrow("openai_consent_session_invalid");

    await expect(
      fixture.authorization.complete({
        interactionId: "interaction_123",
        request: {} as IncomingMessage,
        response: {} as ServerResponse,
        session: session({ userId: "other_user" }),
        decision: "allow",
        productScopes: PRODUCT_SCOPES
      })
    ).rejects.toThrow("openai_consent_session_mismatch");
  });

  it("binds every allow or deny decision to the interaction in the request path", async () => {
    const fixture = createFixture("login");

    await expect(
      fixture.authorization.complete({
        interactionId: "different_interaction",
        request: {} as IncomingMessage,
        response: {} as ServerResponse,
        session: session(),
        decision: "allow",
        productScopes: PRODUCT_SCOPES
      })
    ).rejects.toThrow("openai_authorization_interaction_invalid");
    expect(fixture.oauthStore.createGrant).not.toHaveBeenCalled();
    expect(fixture.provider.interactionResult).not.toHaveBeenCalled();
  });
});
