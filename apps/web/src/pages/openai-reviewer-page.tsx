import { LoaderCircleIcon } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";

import { AuthLayout } from "../components/system/auth-layout.js";
import { Button } from "../components/ui/button.js";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "../components/ui/field.js";
import { Input } from "../components/ui/input.js";
import { Notice } from "../components/ui/notice.js";
import { ApiRequestError } from "../lib/api.js";
import {
  continueOpenAiAuthorization,
  submitOpenAiReviewerCredential
} from "../lib/openai-oauth-api.js";

const INTERACTION_ID_PATTERN = /^[A-Za-z0-9_-]{8,256}$/;

export function OpenAiReviewerPage(): JSX.Element {
  const [searchParams] = useSearchParams();
  const interactionId = searchParams.get("interaction") ?? "";

  return (
    <AuthLayout
      title="OpenAI review access"
      description="Use the credential supplied through the OpenAI review portal."
    >
      <OpenAiReviewerCredentialForm interactionId={interactionId} />
    </AuthLayout>
  );
}

export function OpenAiReviewerCredentialForm({
  interactionId
}: {
  interactionId: string;
}): JSX.Element {
  const [credential, setCredential] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    INTERACTION_ID_PATTERN.test(interactionId)
      ? null
      : "This review request is invalid. Return to the OpenAI review flow and try again."
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!INTERACTION_ID_PATTERN.test(interactionId) || credential.length < 32) {
      setErrorMessage(
        "Could not verify the review credential. Check the credential and try again."
      );
      setCredential("");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const continueUrl = await submitOpenAiReviewerCredential({ interactionId, credential });
      continueOpenAiAuthorization(continueUrl);
    } catch (error) {
      if (
        error instanceof ApiRequestError &&
        (error.code === "rate_limited" || error.code === "openai_reviewer_rate_limited")
      ) {
        const seconds = Math.max(1, Math.ceil((error.retryAfterMs ?? 1_000) / 1_000));
        setErrorMessage(`Too many attempts. Wait ${seconds} seconds and try again.`);
      } else {
        setErrorMessage(
          "Could not verify the review credential. Check the credential and try again."
        );
      }
    } finally {
      setCredential("");
      setIsSubmitting(false);
    }
  }

  return (
    <OpenAiReviewerCredentialFormView
      credential={credential}
      isSubmitting={isSubmitting}
      isInteractionValid={INTERACTION_ID_PATTERN.test(interactionId)}
      errorMessage={errorMessage}
      onCredentialChange={(value) => {
        setCredential(value);
        setErrorMessage(null);
      }}
      onSubmit={(event) => void handleSubmit(event)}
    />
  );
}

export interface OpenAiReviewerCredentialFormViewProps {
  credential: string;
  isSubmitting: boolean;
  isInteractionValid: boolean;
  errorMessage: string | null;
  onCredentialChange: (credential: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function OpenAiReviewerCredentialFormView({
  credential,
  isSubmitting,
  isInteractionValid,
  errorMessage,
  onCredentialChange,
  onSubmit
}: OpenAiReviewerCredentialFormViewProps): JSX.Element {
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (errorMessage !== null) {
      errorRef.current?.focus();
    }
  }, [errorMessage]);

  return (
    <form className="space-y-6" onSubmit={onSubmit}>
      <Notice title="Synthetic review data only">
        This review-only path expires automatically and opens a fixed project containing
        deterministic synthetic data. It never opens a customer organization.
      </Notice>

      {errorMessage === null ? null : (
        <div ref={errorRef} tabIndex={-1}>
          <Notice tone="destructive">{errorMessage}</Notice>
        </div>
      )}

      <FieldGroup>
        <Field data-invalid={errorMessage !== null || undefined}>
          <FieldLabel htmlFor="openai-review-credential">Review credential</FieldLabel>
          <Input
            id="openai-review-credential"
            type="password"
            value={credential}
            disabled={isSubmitting || !isInteractionValid}
            autoComplete="new-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={errorMessage !== null || undefined}
            onChange={(event) => onCredentialChange(event.currentTarget.value)}
          />
          <FieldDescription>
            The credential is submitted once in the request body and is never stored in this
            browser.
          </FieldDescription>
        </Field>
        <Button type="submit" className="w-full" disabled={isSubmitting || !isInteractionValid}>
          {isSubmitting ? <LoaderCircleIcon className="animate-spin" aria-hidden="true" /> : null}
          Continue to synthetic review project
        </Button>
      </FieldGroup>
    </form>
  );
}
