import { ExternalLinkIcon, LoaderCircleIcon, ShieldAlertIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  createCaptureRuleFromIncidentSuggestion,
  suggestCaptureRulesFromIncident,
  type CaptureRuleSuggestion,
  type CaptureRuleSuggestionsResponse
} from "../../lib/capture-rules-api.js";
import { showErrorToast, showSuccessToast } from "../../lib/notify.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import { Card, CardContent } from "../ui/card.js";
import { Dialog } from "../ui/dialog.js";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../ui/empty.js";
import { DialogFormContent } from "./dialog-form-content.js";

interface IncidentCaptureRuleSuggestionsDialogProps {
  incidentId: string;
  projectId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type SuggestionState =
  | { status: "idle" | "loading" }
  | { status: "ready"; response: CaptureRuleSuggestionsResponse }
  | { status: "error" };

export function IncidentCaptureRuleSuggestionsDialog({
  incidentId,
  projectId,
  open,
  onOpenChange
}: IncidentCaptureRuleSuggestionsDialogProps): JSX.Element {
  const [suggestionState, setSuggestionState] = useState<SuggestionState>({ status: "idle" });
  const [isCreatingSuggestionId, setIsCreatingSuggestionId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSuggestionState({ status: "idle" });
      setIsCreatingSuggestionId(null);
      return;
    }

    let isActive = true;
    setSuggestionState({ status: "loading" });

    void (async () => {
      try {
        const response = await suggestCaptureRulesFromIncident(incidentId);
        if (!isActive) {
          return;
        }

        setSuggestionState({ status: "ready", response });
      } catch {
        if (isActive) {
          setSuggestionState({ status: "error" });
        }
      }
    })();

    return () => {
      isActive = false;
    };
  }, [incidentId, open]);

  async function handleCreateSuggestion(suggestion: CaptureRuleSuggestion): Promise<void> {
    setIsCreatingSuggestionId(suggestion.suggestion_id);

    try {
      const rule = await createCaptureRuleFromIncidentSuggestion(incidentId, {
        suggestion_id: suggestion.suggestion_id
      });
      setSuggestionState((current) =>
        current.status !== "ready"
          ? current
          : {
              ...current,
              response: {
                ...current.response,
                suggestions: current.response.suggestions.map((candidate) =>
                  candidate.suggestion_id === suggestion.suggestion_id
                    ? {
                        ...candidate,
                        created_rule_id: rule.id,
                        created_rule_enabled: rule.enabled
                      }
                    : candidate
                )
              }
            }
      );
      showSuccessToast("Capture rule created successfully.");
    } catch {
      showErrorToast("Could not create capture rule from this suggestion.");
    } finally {
      setIsCreatingSuggestionId(null);
    }
  }

  const readyResponse = suggestionState.status === "ready" ? suggestionState.response : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogFormContent
        title="Capture rule suggestions"
        description="Use this incident to create a targeted demote, sample, or drop rule for future matching browser noise."
        size="xl"
        onSubmit={(event) => {
          event.preventDefault();
        }}
        footer={
          <>
            {projectId === undefined ? null : (
              <Button asChild type="button" variant="outline">
                <Link to={`/projects/${projectId}/settings`}>
                  <ExternalLinkIcon data-icon="inline-start" />
                  Manage project rules
                </Link>
              </Button>
            )}
            <Button type="button" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </>
        }
      >
        {suggestionState.status === "loading" || suggestionState.status === "idle" ? (
          <Card>
            <CardContent className="py-8">
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <LoaderCircleIcon className="size-4 animate-spin" />
                Loading suggestions...
              </div>
            </CardContent>
          </Card>
        ) : suggestionState.status === "error" ? (
          <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">
            Could not load capture rule suggestions for this incident.
          </div>
        ) : readyResponse?.bundle_status === "pending" ? (
          <div className="rounded-lg border border-border/80 bg-background/60 p-4 text-sm text-muted-foreground">
            The incident bundle is still being generated. Capture rule suggestions will be available once that bundle is ready.
          </div>
        ) : readyResponse?.bundle_status === "failed" ? (
          <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">
            Capture rule suggestions are unavailable for this incident right now.
          </div>
        ) : readyResponse === null || readyResponse.suggestions.length === 0 ? (
          <Empty className="min-h-[12rem] justify-center border border-dashed border-border/80 bg-background/50">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ShieldAlertIcon />
              </EmptyMedia>
              <EmptyTitle>No suggestions available</EmptyTitle>
              <EmptyDescription>This incident does not currently have a safe structured capture-rule suggestion.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="space-y-4">
            {readyResponse.suggestions.map((suggestion) => {
              const isCreated = suggestion.created_rule_id !== null;
              const isCreating = isCreatingSuggestionId === suggestion.suggestion_id;

              return (
                <div key={suggestion.suggestion_id} className="rounded-xl border border-border/80 bg-background/60 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-medium text-foreground">{suggestion.label}</h4>
                        <Badge variant={getActionVariant(suggestion.recommended_action)}>
                          {suggestion.recommended_action}
                        </Badge>
                        <Badge variant="outline">{suggestion.confidence}</Badge>
                        {suggestion.requires_confirmation ? <Badge variant="warning">review carefully</Badge> : null}
                        {isCreated ? (
                          <Badge variant={suggestion.created_rule_enabled === false ? "outline" : "success"}>
                            {suggestion.created_rule_enabled === false ? "exists disabled" : "rule exists"}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{suggestion.reason}</p>
                      <p className="text-xs leading-5 text-muted-foreground">
                        {formatSuggestionPreview(suggestion)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        type="button"
                        variant={suggestion.recommended_action === "drop" ? "destructive" : "outline"}
                        disabled={isCreating || isCreated}
                        onClick={() => void handleCreateSuggestion(suggestion)}
                      >
                        {isCreating ? "Creating..." : isCreated ? "Rule exists" : "Create rule"}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogFormContent>
    </Dialog>
  );
}

function getActionVariant(action: CaptureRuleSuggestion["recommended_action"]): "secondary" | "warning" | "destructive" {
  switch (action) {
    case "demote":
      return "secondary";
    case "sample":
      return "warning";
    case "drop":
      return "destructive";
  }
}

function formatSuggestionPreview(suggestion: CaptureRuleSuggestion): string {
  const matcher = suggestion.rule.matcher;
  const parts: string[] = [];

  if (matcher.event_types?.length) {
    parts.push(`events ${matcher.event_types.join(", ")}`);
  }
  if (matcher.browser_event_kind !== undefined) {
    parts.push(`browser ${matcher.browser_event_kind}`);
  }
  if (matcher.resource_url?.host !== undefined) {
    parts.push(`resource ${matcher.resource_url.host}`);
  }
  if (matcher.request_url?.path_equals !== undefined) {
    parts.push(`request ${matcher.request_url.path_equals}`);
  }
  if (matcher.status_codes?.length) {
    parts.push(`status ${matcher.status_codes.join(", ")}`);
  }

  return parts.length === 0 ? "Creates a targeted rule for this incident fingerprint." : parts.join(" • ");
}
