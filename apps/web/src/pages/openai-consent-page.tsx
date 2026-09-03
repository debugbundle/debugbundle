import { LoaderCircleIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import {
  OAuthClientSummary,
  OAuthConsentActions,
  OAuthDataTransferNotice,
  OAuthInteractionLayout,
  OAuthScopeList
} from "../components/system/openai-oauth-consent.js";
import { Button } from "../components/ui/button.js";
import { Notice } from "../components/ui/notice.js";
import { ApiRequestError } from "../lib/api.js";
import type { OpenAiConsentInteractionRecord, OpenAiProductScope } from "../lib/api-types.js";
import {
  continueOpenAiAuthorization,
  getOpenAiConsentInteraction,
  submitOpenAiConsent
} from "../lib/openai-oauth-api.js";
import { useSession } from "../lib/session.js";

const INTERACTION_ID_PATTERN = /^[A-Za-z0-9_-]{8,256}$/;

export interface OpenAiConsentSurfaceProps {
  interaction: OpenAiConsentInteractionRecord | null;
  sessionAvailable: boolean;
  selectedScopes: OpenAiProductScope[];
  submittingDecision: "allow" | "deny" | null;
  errorMessage: string | null;
  loginContinuation: string;
  reviewerHref: string;
  onSelectedScopesChange: (scopes: OpenAiProductScope[]) => void;
  onAllow: () => void;
  onDeny: () => void;
}

function interactionErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError && error.status === 403) {
    return "This organization is no longer available for this authorization request.";
  }
  if (error instanceof ApiRequestError && error.status === 400) {
    return "This authorization request is invalid or has expired. Return to ChatGPT or Codex and try again.";
  }
  return "This authorization request is unavailable right now. Return to ChatGPT or Codex and try again.";
}

export function OpenAiConsentPage(): JSX.Element {
  const { session } = useSession();
  const [searchParams] = useSearchParams();
  const interactionId = searchParams.get("interaction") ?? "";
  const validInteractionId = INTERACTION_ID_PATTERN.test(interactionId);
  const [interaction, setInteraction] = useState<OpenAiConsentInteractionRecord | null>(null);
  const [selectedScopes, setSelectedScopes] = useState<OpenAiProductScope[]>([]);
  const [submittingDecision, setSubmittingDecision] = useState<"allow" | "deny" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!validInteractionId) {
      setErrorMessage(
        "This authorization request is invalid. Return to ChatGPT or Codex and try again."
      );
      return;
    }

    let cancelled = false;
    void getOpenAiConsentInteraction(interactionId)
      .then((value) => {
        if (cancelled) {
          return;
        }
        setInteraction(value);
        setSelectedScopes(value.product_scopes);
        setErrorMessage(null);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setErrorMessage(interactionErrorMessage(error));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [interactionId, validInteractionId]);

  const loginContinuation = useMemo(
    () => `/oauth/consent?interaction=${encodeURIComponent(interactionId)}`,
    [interactionId]
  );

  async function submitDecision(decision: "allow" | "deny"): Promise<void> {
    if (interaction === null || submittingDecision !== null) {
      return;
    }
    setSubmittingDecision(decision);
    setErrorMessage(null);
    try {
      const continueUrl = await submitOpenAiConsent({
        interactionId,
        decision,
        productScopes: decision === "allow" ? selectedScopes : []
      });
      continueOpenAiAuthorization(continueUrl);
    } catch (error) {
      setErrorMessage(interactionErrorMessage(error));
    } finally {
      setSubmittingDecision(null);
    }
  }

  return (
    <OpenAiConsentSurface
      interaction={interaction}
      sessionAvailable={session !== null}
      selectedScopes={selectedScopes}
      submittingDecision={submittingDecision}
      errorMessage={errorMessage}
      loginContinuation={loginContinuation}
      reviewerHref={`/oauth/reviewer?interaction=${encodeURIComponent(interactionId)}`}
      onSelectedScopesChange={setSelectedScopes}
      onAllow={() => void submitDecision("allow")}
      onDeny={() => void submitDecision("deny")}
    />
  );
}

export function OpenAiConsentSurface({
  interaction,
  sessionAvailable,
  selectedScopes,
  submittingDecision,
  errorMessage,
  loginContinuation,
  reviewerHref,
  onSelectedScopesChange,
  onAllow,
  onDeny
}: OpenAiConsentSurfaceProps): JSX.Element {
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (errorMessage !== null) {
      errorRef.current?.focus();
    }
  }, [errorMessage]);

  return (
    <OAuthInteractionLayout>
      <div className="space-y-6">
        {errorMessage === null ? null : (
          <div ref={errorRef} tabIndex={-1}>
            <Notice tone="destructive" title="Authorization unavailable">
              {errorMessage}
            </Notice>
          </div>
        )}

        {interaction === null && errorMessage === null ? (
          <div
            className="flex items-center justify-center gap-3 py-8 text-sm text-muted-foreground"
            role="status"
          >
            <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
            Loading authorization request
          </div>
        ) : null}

        {interaction?.authentication_required === true ||
        (interaction !== null && !sessionAvailable) ? (
          <div className="space-y-4">
            <Notice title="Sign in required">
              Sign in with your verified DebugBundle account to choose an organization and review
              access.
            </Notice>
            <Button asChild className="w-full">
              <Link to={`/login?next=${encodeURIComponent(loginContinuation)}`}>
                Sign in to continue
              </Link>
            </Button>
            {interaction.reviewer_access_available ? (
              <Button asChild variant="ghost" className="w-full">
                <Link to={reviewerHref}>Continue with OpenAI review access</Link>
              </Button>
            ) : null}
          </div>
        ) : null}

        {interaction !== null &&
        interaction.authentication_required !== true &&
        sessionAvailable ? (
          <>
            <OAuthClientSummary interaction={interaction} />

            <Notice title="Verified identity">
              Share your verified email only so ChatGPT or Codex can apply managed-workspace domain
              restrictions. Your email is not included in MCP access tokens or tool results.
            </Notice>

            <OAuthScopeList
              requestedScopes={interaction.product_scopes}
              selectedScopes={selectedScopes}
              disabled={submittingDecision !== null}
              onChange={onSelectedScopesChange}
            />

            {selectedScopes.length === 0 ? (
              <Notice title="Identity only">
                No DebugBundle project data will be available to ChatGPT or Codex.
              </Notice>
            ) : null}

            <OAuthDataTransferNotice />
            <OAuthConsentActions
              submittingDecision={submittingDecision}
              onAllow={onAllow}
              onDeny={onDeny}
            />
          </>
        ) : null}
      </div>
    </OAuthInteractionLayout>
  );
}
