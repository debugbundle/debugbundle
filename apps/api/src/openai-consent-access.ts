import type { IncomingMessage, ServerResponse } from "node:http";

import type Provider from "oidc-provider";

import {
  OPENAI_CIMD_CLIENT_ID,
  OPENAI_MCP_RESOURCE,
  OPENAI_OIDC_SCOPES,
  OPENAI_REFRESH_TOKEN_TTL_SECONDS
} from "../../../packages/auth/src/index.js";
import type { OpenAiOAuthStore } from "../../../packages/storage/src/index.js";
import {
  parseOpenAiAuthorizationInteraction,
  requireOpenAiAuthorizationContinueUrl
} from "./openai-authorization-interaction.js";

export interface OpenAiConsentSession {
  userId: string;
  organizationId: string;
  emailVerified: boolean;
}

export interface OpenAiConsentInteraction {
  interaction_id: string;
  client_name: "ChatGPT and Codex";
  publisher: "OpenAI";
  organization_name: string | null;
  identity_scopes: ["openid", "email"];
  product_scopes: string[];
  reviewer_access_available: boolean;
  authentication_required?: true;
}

export interface OpenAiConsentAuthorization {
  describe(input: {
    request: IncomingMessage;
    response: ServerResponse;
    session?: OpenAiConsentSession;
  }): Promise<OpenAiConsentInteraction>;
  complete(input: {
    interactionId: string;
    request: IncomingMessage;
    response: ServerResponse;
    session?: OpenAiConsentSession;
    decision: "allow" | "deny";
    productScopes: string[];
    now?: Date;
  }): Promise<{ continueUrl: string }>;
}

function validateSession(
  session: OpenAiConsentSession | undefined,
  interaction: ReturnType<typeof parseOpenAiAuthorizationInteraction>
): asserts session is OpenAiConsentSession {
  if (session === undefined || !session.emailVerified) {
    throw new Error("openai_consent_session_invalid");
  }
  if (
    interaction.sessionAccountId !== undefined &&
    interaction.sessionAccountId !== session.userId
  ) {
    throw new Error("openai_consent_session_mismatch");
  }
}

function selectedProductScopes(requested: string[], selected: string[]): string[] {
  const selectedSet = new Set(selected);
  if (
    selectedSet.size !== selected.length ||
    selected.some((scope) => !requested.includes(scope))
  ) {
    throw new Error("openai_consent_scopes_invalid");
  }
  return requested.filter((scope) => selectedSet.has(scope));
}

export function createOpenAiConsentAuthorization(input: {
  provider: Provider;
  oauthStore: Pick<OpenAiOAuthStore, "createGrant" | "revokeGrant" | "revokeGrantByProviderId">;
  resolveOrganizationName(request: {
    userId: string;
    organizationId: string;
  }): Promise<string | undefined>;
  reviewerAccessAvailable?: boolean;
}): OpenAiConsentAuthorization {
  async function readInteraction(
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<ReturnType<typeof parseOpenAiAuthorizationInteraction>> {
    const details = await input.provider.interactionDetails(request, response);
    return parseOpenAiAuthorizationInteraction(details);
  }

  return {
    async describe(requestInput) {
      const interaction = await readInteraction(requestInput.request, requestInput.response);
      if (requestInput.session === undefined) {
        return {
          interaction_id: interaction.uid,
          client_name: "ChatGPT and Codex",
          publisher: "OpenAI",
          organization_name: null,
          identity_scopes: [...OPENAI_OIDC_SCOPES],
          product_scopes: interaction.productScopes,
          reviewer_access_available: input.reviewerAccessAvailable === true,
          authentication_required: true
        };
      }

      validateSession(requestInput.session, interaction);
      const organizationName = await input.resolveOrganizationName({
        userId: requestInput.session.userId,
        organizationId: requestInput.session.organizationId
      });
      if (organizationName === undefined) {
        throw new Error("openai_consent_organization_unavailable");
      }

      return {
        interaction_id: interaction.uid,
        client_name: "ChatGPT and Codex",
        publisher: "OpenAI",
        organization_name: organizationName,
        identity_scopes: [...OPENAI_OIDC_SCOPES],
        product_scopes: interaction.productScopes,
        reviewer_access_available: input.reviewerAccessAvailable === true
      };
    },

    async complete(requestInput) {
      const interaction = await readInteraction(requestInput.request, requestInput.response);
      if (interaction.uid !== requestInput.interactionId) {
        throw new Error("openai_authorization_interaction_invalid");
      }
      if (requestInput.decision === "deny") {
        const continueUrl = await input.provider.interactionResult(
          requestInput.request,
          requestInput.response,
          {
            error: "access_denied",
            error_description: "End-User denied the authorization request"
          },
          { mergeWithLastSubmission: false }
        );
        return { continueUrl: requireOpenAiAuthorizationContinueUrl(continueUrl) };
      }

      validateSession(requestInput.session, interaction);
      const organizationName = await input.resolveOrganizationName({
        userId: requestInput.session.userId,
        organizationId: requestInput.session.organizationId
      });
      if (organizationName === undefined) {
        throw new Error("openai_consent_organization_unavailable");
      }
      const scopes = selectedProductScopes(interaction.productScopes, requestInput.productScopes);
      if (interaction.providerGrantId !== undefined) {
        await input.oauthStore.revokeGrantByProviderId(interaction.providerGrantId, "user_revoked");
      }

      const now = requestInput.now ?? new Date();
      const providerGrant = new input.provider.Grant({
        accountId: requestInput.session.userId,
        clientId: OPENAI_CIMD_CLIENT_ID
      });
      providerGrant.addOIDCScope(OPENAI_OIDC_SCOPES.join(" "));
      if (scopes.length > 0) {
        providerGrant.addResourceScope(OPENAI_MCP_RESOURCE, scopes.join(" "));
      }
      const providerGrantId = await providerGrant.save();
      const grantId = await input.oauthStore.createGrant({
        providerGrantId,
        userId: requestInput.session.userId,
        organizationId: requestInput.session.organizationId,
        clientId: OPENAI_CIMD_CLIENT_ID,
        resource: OPENAI_MCP_RESOURCE,
        scopes: [...OPENAI_OIDC_SCOPES, ...scopes],
        consentedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + OPENAI_REFRESH_TOKEN_TTL_SECONDS * 1_000).toISOString()
      });

      try {
        const continueUrl = await input.provider.interactionResult(
          requestInput.request,
          requestInput.response,
          {
            ...(interaction.promptName === "login"
              ? { login: { accountId: requestInput.session.userId } }
              : {}),
            consent: { grantId: providerGrantId }
          },
          { mergeWithLastSubmission: interaction.promptName === "consent" }
        );
        return { continueUrl: requireOpenAiAuthorizationContinueUrl(continueUrl) };
      } catch (error) {
        await input.oauthStore.revokeGrant(grantId, "operator_revoked");
        throw error;
      }
    }
  };
}
