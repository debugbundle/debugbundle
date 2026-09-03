import { ExternalLinkIcon, FlaskConicalIcon, SettingsIcon } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";

import { AuthLayout } from "../components/system/auth-layout.js";
import { OpenAiConnectionsSectionView } from "../components/system/openai-connections-section.js";
import { PageHeader } from "../components/system/page-header.js";
import { Badge } from "../components/ui/badge.js";
import { Button } from "../components/ui/button.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "../components/ui/card.js";
import { Field, FieldLabel } from "../components/ui/field.js";
import { Notice } from "../components/ui/notice.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "../components/ui/select.js";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs.js";
import type { OpenAiConnectionRecord, OpenAiProductScope } from "../lib/api-types.js";
import { OPENAI_PLUGIN_PREVIEW_ROUTE } from "../lib/openai-plugin-preview-gate.js";
import {
  OPENAI_PLUGIN_PREVIEW_STATES,
  OPENAI_PLUGIN_PREVIEW_VIEWPORTS,
  SYNTHETIC_OPENAI_CONNECTIONS,
  SYNTHETIC_OPENAI_INTERACTION,
  describeOpenAiPreviewScopes,
  getOpenAiPreviewScopes,
  parseOpenAiPreviewScopeMask,
  parseOpenAiPreviewState,
  parseOpenAiPreviewSurface,
  parseOpenAiPreviewViewport,
  type OpenAiConsentPreviewState,
  type OpenAiPluginPreviewState,
  type OpenAiPluginPreviewSurface,
  type OpenAiPluginPreviewViewport,
  type OpenAiReviewerPreviewState,
  type OpenAiSettingsPreviewState
} from "../lib/openai-plugin-previews.js";
import { OpenAiConsentSurface } from "./openai-consent-page.js";
import { OpenAiReviewerCredentialFormView } from "./openai-reviewer-page.js";

const STATE_LABELS: Record<OpenAiPluginPreviewState, string> = {
  default: "Default",
  loading: "Loading",
  expired: "Expired",
  unavailable: "Unavailable",
  retryable: "Retryable failure",
  "allow-processing": "Allow processing",
  "deny-processing": "Deny processing",
  error: "Credential error",
  "rate-limit": "Rate limited",
  empty: "Empty",
  active: "Active",
  revoked: "Revoked",
  confirmation: "Confirmation open"
};

function setPreviewSearchValue(
  searchParams: URLSearchParams,
  setSearchParams: ReturnType<typeof useSearchParams>[1],
  key: string,
  value: string
): void {
  const next = new URLSearchParams(searchParams);
  next.set(key, value);
  setSearchParams(next, { replace: true });
}

function EmbeddedConsentPreview({
  state,
  scopeMask
}: {
  state: OpenAiConsentPreviewState;
  scopeMask: number;
}): JSX.Element {
  const [selectedScopes, setSelectedScopes] = useState<OpenAiProductScope[]>(() =>
    getOpenAiPreviewScopes(scopeMask)
  );
  const [manualDecision, setManualDecision] = useState<"allow" | "deny" | null>(null);

  useEffect(() => {
    setSelectedScopes(getOpenAiPreviewScopes(scopeMask));
    setManualDecision(null);
  }, [scopeMask, state]);

  const errorMessage =
    state === "expired"
      ? "This authorization request is invalid or has expired. Return to ChatGPT or Codex and try again."
      : state === "unavailable"
        ? "This authorization request is unavailable right now. Return to ChatGPT or Codex and try again."
        : state === "retryable"
          ? "Could not save your decision. Your scope selection is preserved; try again."
          : null;
  const interaction =
    state === "loading" || state === "expired" || state === "unavailable"
      ? null
      : SYNTHETIC_OPENAI_INTERACTION;
  const submittingDecision =
    state === "allow-processing" ? "allow" : state === "deny-processing" ? "deny" : manualDecision;

  return (
    <OpenAiConsentSurface
      interaction={interaction}
      sessionAvailable
      selectedScopes={selectedScopes}
      submittingDecision={submittingDecision}
      errorMessage={errorMessage}
      loginContinuation="/__dev/openai-plugin"
      reviewerHref="/__dev/openai-plugin?embedded=1&surface=reviewer&state=default"
      onSelectedScopesChange={setSelectedScopes}
      onAllow={() => setManualDecision("allow")}
      onDeny={() => setManualDecision("deny")}
    />
  );
}

function EmbeddedReviewerPreview({ state }: { state: OpenAiReviewerPreviewState }): JSX.Element {
  const [credential, setCredential] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setCredential("");
    setIsSubmitting(false);
  }, [state]);

  const errorMessage =
    state === "error"
      ? "Could not verify the review credential. Check the credential and try again."
      : state === "rate-limit"
        ? "Too many attempts. Wait 30 seconds and try again."
        : null;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setCredential("");
    setIsSubmitting(true);
  }

  return (
    <AuthLayout
      title="OpenAI review access"
      description="Use the credential supplied through the OpenAI review portal."
    >
      <OpenAiReviewerCredentialFormView
        credential={credential}
        isSubmitting={isSubmitting}
        isInteractionValid
        errorMessage={errorMessage}
        onCredentialChange={setCredential}
        onSubmit={handleSubmit}
      />
    </AuthLayout>
  );
}

function connectionFixturesForState(state: OpenAiSettingsPreviewState): OpenAiConnectionRecord[] {
  if (state === "empty") {
    return [];
  }
  if (state === "expired") {
    return [SYNTHETIC_OPENAI_CONNECTIONS.expired];
  }
  if (state === "revoked") {
    return [SYNTHETIC_OPENAI_CONNECTIONS.revoked];
  }
  return [SYNTHETIC_OPENAI_CONNECTIONS.active];
}

function EmbeddedSettingsPreview({ state }: { state: OpenAiSettingsPreviewState }): JSX.Element {
  const [connections, setConnections] = useState<OpenAiConnectionRecord[]>(() =>
    connectionFixturesForState(state)
  );
  const [revokingGrantId, setRevokingGrantId] = useState<string | null>(null);

  useEffect(() => {
    setConnections(connectionFixturesForState(state));
    setRevokingGrantId(null);
  }, [state]);

  function handleRevoke(connection: OpenAiConnectionRecord): Promise<void> {
    setRevokingGrantId(connection.grant_id);
    setConnections([
      {
        ...connection,
        revoked_at: "2026-09-02T09:00:00.000Z",
        status: "revoked"
      }
    ]);
    setRevokingGrantId(null);
    return Promise.resolve();
  }

  return (
    <div className="min-h-svh bg-background">
      <header className="flex h-12 items-center gap-3 border-b px-4 sm:px-6">
        <SettingsIcon className="size-4" aria-hidden="true" />
        <h1 className="text-sm font-medium">Settings</h1>
      </header>
      <main className="space-y-8 p-4 sm:p-6">
        <PageHeader description="Review your active sign-in methods, account verification state, and account lifecycle controls." />
        <OpenAiConnectionsSectionView
          connections={connections}
          loadError={false}
          revokingGrantId={revokingGrantId}
          {...(state === "confirmation"
            ? { confirmationGrantId: SYNTHETIC_OPENAI_CONNECTIONS.active.grant_id }
            : {})}
          onRevoke={handleRevoke}
        />
      </main>
    </div>
  );
}

function EmbeddedPreview({
  surface,
  state,
  scopeMask
}: {
  surface: OpenAiPluginPreviewSurface;
  state: OpenAiPluginPreviewState;
  scopeMask: number;
}): JSX.Element {
  if (surface === "reviewer") {
    return <EmbeddedReviewerPreview state={state as OpenAiReviewerPreviewState} />;
  }
  if (surface === "settings") {
    return <EmbeddedSettingsPreview state={state as OpenAiSettingsPreviewState} />;
  }
  return (
    <EmbeddedConsentPreview state={state as OpenAiConsentPreviewState} scopeMask={scopeMask} />
  );
}

function buildFrameSource(input: {
  surface: OpenAiPluginPreviewSurface;
  state: OpenAiPluginPreviewState;
  viewport: OpenAiPluginPreviewViewport;
  scopeMask: number;
}): string {
  const params = new URLSearchParams({
    embedded: "1",
    surface: input.surface,
    state: input.state,
    viewport: input.viewport,
    scope_set: input.scopeMask.toString()
  });
  return `${OPENAI_PLUGIN_PREVIEW_ROUTE}?${params.toString()}`;
}

export function OpenAiPluginPreviewPage(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const surface = parseOpenAiPreviewSurface(searchParams.get("surface"));
  const state = parseOpenAiPreviewState(surface, searchParams.get("state"));
  const viewport = parseOpenAiPreviewViewport(searchParams.get("viewport"));
  const scopeMask = parseOpenAiPreviewScopeMask(searchParams.get("scope_set"));
  const isEmbedded = searchParams.get("embedded") === "1";
  const viewportConfig = OPENAI_PLUGIN_PREVIEW_VIEWPORTS.find(
    (candidate) => candidate.id === viewport
  )!;
  const frameSource = useMemo(
    () => buildFrameSource({ surface, state, viewport, scopeMask }),
    [scopeMask, state, surface, viewport]
  );

  if (isEmbedded) {
    return <EmbeddedPreview surface={surface} state={state} scopeMask={scopeMask} />;
  }

  return (
    <main className="min-h-svh bg-muted/20 p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="rounded-lg border bg-background p-2.5">
                <FlaskConicalIcon className="size-5" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight">OpenAI plugin preview</h1>
                  <Badge variant="secondary">Development only</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Inspect deterministic consent, reviewer, and Settings states without OAuth or
                  customer data.
                </p>
              </div>
            </div>
            <Button asChild variant="outline" size="sm">
              <a href={frameSource} target="_blank" rel="noreferrer">
                Open current preview
                <ExternalLinkIcon aria-hidden="true" />
              </a>
            </Button>
          </div>
          <Notice title="Synthetic browser-only fixtures" tone="info">
            Actions update only this iframe. They do not call OAuth, create grants, submit reviewer
            credentials, revoke connections, or relax canonical-host checks.
          </Notice>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Preview controls</CardTitle>
            <CardDescription>
              Each selection is reflected in the URL so a specific review state can be reopened.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Field>
              <FieldLabel>Surface</FieldLabel>
              <Tabs
                value={surface}
                onValueChange={(value) => {
                  const nextSurface = parseOpenAiPreviewSurface(value);
                  const next = new URLSearchParams(searchParams);
                  next.set("surface", nextSurface);
                  next.set("state", OPENAI_PLUGIN_PREVIEW_STATES[nextSurface][0]);
                  setSearchParams(next, { replace: true });
                }}
              >
                <TabsList className="w-full sm:w-fit">
                  <TabsTrigger value="consent">Consent</TabsTrigger>
                  <TabsTrigger value="reviewer">Reviewer</TabsTrigger>
                  <TabsTrigger value="settings">Settings</TabsTrigger>
                </TabsList>
              </Tabs>
            </Field>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="openai-preview-state">State</FieldLabel>
                <Select
                  value={state}
                  onValueChange={(value) =>
                    setPreviewSearchValue(searchParams, setSearchParams, "state", value)
                  }
                >
                  <SelectTrigger id="openai-preview-state" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPENAI_PLUGIN_PREVIEW_STATES[surface].map((candidate) => (
                      <SelectItem key={candidate} value={candidate}>
                        {STATE_LABELS[candidate]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              {surface === "consent" ? (
                <Field>
                  <FieldLabel htmlFor="openai-preview-scope-set">Scope selection</FieldLabel>
                  <Select
                    value={scopeMask.toString()}
                    onValueChange={(value) =>
                      setPreviewSearchValue(searchParams, setSearchParams, "scope_set", value)
                    }
                  >
                    <SelectTrigger id="openai-preview-scope-set" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 64 }, (_, mask) => (
                        <SelectItem key={mask} value={mask.toString()}>
                          {mask + 1}/64 - {describeOpenAiPreviewScopes(mask)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              ) : null}

              <Field>
                <FieldLabel>Viewport</FieldLabel>
                <Tabs
                  value={viewport}
                  onValueChange={(value) =>
                    setPreviewSearchValue(searchParams, setSearchParams, "viewport", value)
                  }
                >
                  <TabsList className="w-full">
                    {OPENAI_PLUGIN_PREVIEW_VIEWPORTS.map((candidate) => (
                      <TabsTrigger key={candidate.id} value={candidate.id}>
                        {candidate.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </Field>
            </div>
          </CardContent>
        </Card>

        <div className="overflow-auto rounded-xl border bg-muted/40 p-3 sm:p-5">
          <iframe
            key={frameSource}
            title={`${surface} ${state} ${viewport} preview`}
            src={frameSource}
            className="mx-auto block max-w-none rounded-lg border bg-background shadow-sm"
            style={{ width: viewportConfig.width, height: viewportConfig.height }}
          />
        </div>
      </div>
    </main>
  );
}
