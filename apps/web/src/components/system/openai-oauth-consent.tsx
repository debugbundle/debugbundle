import { LoaderCircleIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import type { OpenAiConsentInteractionRecord, OpenAiProductScope } from "../../lib/api-types.js";
import { Button } from "../ui/button.js";
import { Checkbox } from "../ui/checkbox.js";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet
} from "../ui/field.js";
import { Notice } from "../ui/notice.js";
import { AuthLayout } from "./auth-layout.js";

const SCOPE_COPY: Record<OpenAiProductScope, { label: string; description: string }> = {
  "debugbundle:projects:read": {
    label: "See projects available in this organization",
    description: "Project names, identifiers, environments, and service summaries."
  },
  "debugbundle:incidents:read": {
    label: "Read incident summaries and structured context",
    description: "Incident metadata, status, fingerprints, and bounded context."
  },
  "debugbundle:artifacts:read": {
    label: "Read existing redacted bundles and reproductions",
    description: "Previously generated artifacts only; raw logs are excluded."
  },
  "debugbundle:improvements:read": {
    label: "Read improvement opportunities and existing evidence",
    description: "Existing improvement records and their bounded evidence."
  },
  "debugbundle:analytics:read": {
    label: "Read aggregate product analytics",
    description:
      "Visits, routes, devices, referrers, actions, funnels, journey patterns, and incident impact; individual journeys are excluded."
  },
  "debugbundle:health:read": {
    label: "Read endpoint checks and bounded health results",
    description: "Sanitized check targets, status, latency, and recent outcomes."
  }
};

export function OAuthInteractionLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <AuthLayout
      title="Connect DebugBundle to ChatGPT and Codex"
      description="Review the verified identity and read-only DebugBundle access requested by OpenAI."
      contentClassName="max-w-xl"
    >
      {children}
    </AuthLayout>
  );
}

export function OAuthClientSummary({
  interaction
}: {
  interaction: OpenAiConsentInteractionRecord;
}): JSX.Element {
  return (
    <dl className="grid gap-3 rounded-lg border bg-background/70 p-4 text-sm sm:grid-cols-2">
      <div>
        <dt className="text-muted-foreground">Requesting client</dt>
        <dd className="font-medium">{interaction.client_name}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Publisher</dt>
        <dd className="font-medium">{interaction.publisher}</dd>
      </div>
      <div className="sm:col-span-2">
        <dt className="text-muted-foreground">DebugBundle organization</dt>
        <dd className="font-medium">{interaction.organization_name}</dd>
      </div>
    </dl>
  );
}

export function OAuthScopeList({
  requestedScopes,
  selectedScopes,
  disabled,
  onChange
}: {
  requestedScopes: OpenAiProductScope[];
  selectedScopes: OpenAiProductScope[];
  disabled: boolean;
  onChange: (scopes: OpenAiProductScope[]) => void;
}): JSX.Element {
  return (
    <FieldSet>
      <FieldLegend>Choose read-only product access</FieldLegend>
      <FieldDescription>
        Identity scopes <code>openid</code> and <code>email</code> are required. You can remove any
        product scope.
      </FieldDescription>
      <FieldGroup data-slot="checkbox-group">
        {requestedScopes.map((scope) => {
          const copy = SCOPE_COPY[scope];
          const checked = selectedScopes.includes(scope);
          return (
            <Field key={scope} orientation="horizontal">
              <Checkbox
                id={`openai-scope-${scope}`}
                checked={checked}
                disabled={disabled}
                onCheckedChange={(nextChecked) => {
                  onChange(
                    nextChecked === true
                      ? [...selectedScopes, scope]
                      : selectedScopes.filter((value) => value !== scope)
                  );
                }}
              />
              <FieldContent>
                <FieldLabel htmlFor={`openai-scope-${scope}`}>{copy.label}</FieldLabel>
                <FieldDescription>{copy.description}</FieldDescription>
              </FieldContent>
            </Field>
          );
        })}
      </FieldGroup>
    </FieldSet>
  );
}

export function OAuthDataTransferNotice(): JSX.Element {
  return (
    <>
      <Notice title="Read-only connection">
        This connection cannot change, resolve, delete, send, or reconfigure anything in
        DebugBundle.
      </Notice>
      <Notice title="Data sent to OpenAI">
        Selected tools may return incident summaries, existing redacted artifacts and reproductions,
        improvements, aggregate product analytics, and bounded endpoint-health evidence. Raw logs,
        individual journey samples, and custom analytics dimensions are excluded.
      </Notice>
    </>
  );
}

export function OAuthConsentActions({
  submittingDecision,
  onAllow,
  onDeny
}: {
  submittingDecision: "allow" | "deny" | null;
  onAllow: () => void;
  onDeny: () => void;
}): JSX.Element {
  const isSubmitting = submittingDecision !== null;

  return (
    <FieldGroup>
      <Field
        role="group"
        aria-label="Authorization decision"
        className="gap-2 sm:flex-row-reverse sm:items-center sm:justify-start"
      >
        <Button
          type="button"
          className="w-full sm:w-auto"
          disabled={isSubmitting}
          onClick={onAllow}
        >
          {submittingDecision === "allow" ? (
            <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
          ) : null}
          {submittingDecision === "allow" ? "Allowing access..." : "Allow access"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full sm:w-auto"
          disabled={isSubmitting}
          onClick={onDeny}
        >
          {submittingDecision === "deny" ? (
            <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
          ) : null}
          {submittingDecision === "deny" ? "Denying access..." : "Deny"}
        </Button>
      </Field>
      <FieldDescription className="text-center">
        You can revoke this connection later from{" "}
        <Link to="/settings#openai-connections">Settings</Link>.
      </FieldDescription>
    </FieldGroup>
  );
}
