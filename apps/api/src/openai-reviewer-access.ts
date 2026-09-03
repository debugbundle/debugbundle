import type { IncomingMessage, ServerResponse } from "node:http";

import type Provider from "oidc-provider";

import {
  OPENAI_CIMD_CLIENT_ID,
  OPENAI_HOSTED_MCP_SCOPES,
  OPENAI_MCP_RESOURCE,
  OPENAI_OIDC_SCOPES,
  OPENAI_REFRESH_TOKEN_TTL_SECONDS,
  verifyPassword
} from "../../../packages/auth/src/index.js";
import type { OpenAiOAuthStore } from "../../../packages/storage/src/index.js";
import {
  parseOpenAiAuthorizationInteraction,
  requireOpenAiAuthorizationContinueUrl
} from "./openai-authorization-interaction.js";

export interface OpenAiReviewerBoundary {
  assertSyntheticBoundary(): Promise<void>;
  audit(input: {
    action: "credential_success" | "credential_failure" | "grant" | "expiry";
    status: "success" | "failure";
  }): Promise<void>;
}

export interface OpenAiReviewerAuthorization {
  complete(input: {
    interactionId: string;
    credential: string;
    request: IncomingMessage;
    response: ServerResponse;
    now?: Date;
  }): Promise<{ continueUrl: string }>;
}

export function createOpenAiReviewerAuthorization(input: {
  provider: Provider;
  oauthStore: Pick<OpenAiOAuthStore, "createGrant" | "revokeGrant">;
  boundary: OpenAiReviewerBoundary;
  credentialHash: string;
  expiresAt: string;
  userId: string;
  organizationId: string;
}): OpenAiReviewerAuthorization {
  return {
    async complete(requestInput) {
      const now = requestInput.now ?? new Date();
      if (new Date(input.expiresAt).getTime() <= now.getTime()) {
        await input.boundary.audit({ action: "expiry", status: "failure" });
        throw new Error("openai_reviewer_access_denied");
      }
      const credentialValid = await verifyPassword(requestInput.credential, input.credentialHash);
      if (!credentialValid) {
        await input.boundary.audit({ action: "credential_failure", status: "failure" });
        throw new Error("openai_reviewer_access_denied");
      }

      await input.boundary.assertSyntheticBoundary();
      const details = await input.provider.interactionDetails(
        requestInput.request,
        requestInput.response
      );
      const interaction = parseOpenAiAuthorizationInteraction(details);
      if (interaction.uid !== requestInput.interactionId) {
        throw new Error("openai_reviewer_access_denied");
      }
      if (
        interaction.sessionAccountId !== undefined &&
        interaction.sessionAccountId !== input.userId
      ) {
        throw new Error("openai_reviewer_access_denied");
      }
      await input.boundary.audit({ action: "credential_success", status: "success" });
      const grant = new input.provider.Grant({
        accountId: input.userId,
        clientId: OPENAI_CIMD_CLIENT_ID
      });
      grant.addOIDCScope(OPENAI_OIDC_SCOPES.join(" "));
      grant.addResourceScope(OPENAI_MCP_RESOURCE, OPENAI_HOSTED_MCP_SCOPES.join(" "));
      const providerGrantId = await grant.save();
      const grantId = await input.oauthStore.createGrant({
        providerGrantId,
        userId: input.userId,
        organizationId: input.organizationId,
        clientId: OPENAI_CIMD_CLIENT_ID,
        resource: OPENAI_MCP_RESOURCE,
        scopes: [...OPENAI_OIDC_SCOPES, ...OPENAI_HOSTED_MCP_SCOPES],
        consentedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + OPENAI_REFRESH_TOKEN_TTL_SECONDS * 1_000).toISOString()
      });
      await input.boundary.audit({ action: "grant", status: "success" });
      try {
        const continueUrl = await input.provider.interactionResult(
          requestInput.request,
          requestInput.response,
          {
            ...(interaction.promptName === "login" ? { login: { accountId: input.userId } } : {}),
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
