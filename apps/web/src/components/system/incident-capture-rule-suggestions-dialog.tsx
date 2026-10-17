import { ExternalLinkIcon, LoaderCircleIcon, ShieldAlertIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import {
  createCaptureRuleFromIncidentSuggestion,
  suggestCaptureRulesFromIncident,
  type CaptureRuleSuggestion,
  type CaptureRuleSuggestionsResponse
} from "../../lib/capture-rules-api.js";
import { showErrorToast, showSuccessToast } from "../../lib/notify.js";
import { formatCaptureRuleMatcher } from "../../lib/capture-rule-copy.js";
import { Checkbox } from "../ui/checkbox.js";
import { Field, FieldLabel } from "../ui/field.js";
import { CalloutCard } from "./callout-card.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "../ui/card.js";
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
  const [reviewed, setReviewed] = useState<Record<string, boolean>>({});
  const requestVersion = useRef(0);

  useEffect(() => {
    const version = ++requestVersion.current;
    setIsCreatingSuggestionId(null);
    if (!open) {
      setSuggestionState({ status: "idle" });
      return;
    }

    let isActive = true;
    setReviewed({});
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
      if (requestVersion.current === version) requestVersion.current++;
    };
  }, [incidentId, open]);

  async function handleCreateSuggestion(suggestion: CaptureRuleSuggestion): Promise<void> {
    const version = requestVersion.current;
    setIsCreatingSuggestionId(suggestion.suggestion_id);

    try {
      const rule = await createCaptureRuleFromIncidentSuggestion(incidentId, {
        suggestion_id: suggestion.suggestion_id
      });
      if (requestVersion.current !== version) return;
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
                        rule: { ...candidate.rule, matcher: rule.matcher },
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
      if (requestVersion.current === version)
        showErrorToast("Could not create capture rule from this suggestion.");
    } finally {
      if (requestVersion.current === version) setIsCreatingSuggestionId(null);
    }
  }

  const readyResponse = suggestionState.status === "ready" ? suggestionState.response : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogFormContent
        title="Reduce noise"
        description="Choose how future matching events are captured. Review the exact scope; existing incidents and artifacts remain available."
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
            The incident bundle is still being generated. Capture rule suggestions will be available
            once that bundle is ready.
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
              <EmptyDescription>
                There is not enough retained evidence to prepare a scoped rule. You can review
                manual rules in project settings.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Keep useful evidence as context, or stop capturing future matches. Nothing changes
              until you create a rule. Sampling and rule changes are available in project settings.
            </p>
            {readyResponse.access_mode === "preview" ? (
              <CalloutCard
                eyebrow="Preview"
                title="Review suggestions"
                description="You can review these suggestions. A project owner or admin can create a rule."
                tone="neutral"
              />
            ) : null}
            {readyResponse.suggestions.map((suggestion) => {
              const isCreated = suggestion.created_rule_id !== null;
              const isCreating = isCreatingSuggestionId === suggestion.suggestion_id;

              return (
                <Card key={suggestion.suggestion_id}>
                  <CardHeader>
                    <CardTitle>{suggestion.label}</CardTitle>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={getActionVariant(suggestion.recommended_action)}>
                        {getActionLabel(suggestion.recommended_action)}
                      </Badge>
                      {isCreated ? (
                        <Badge
                          variant={
                            suggestion.created_rule_enabled === false ? "outline" : "success"
                          }
                        >
                          {suggestion.created_rule_enabled === false
                            ? "Rule paused"
                            : "Rule exists"}
                        </Badge>
                      ) : null}
                    </div>
                    <CardDescription>{suggestion.reason}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    <p className="text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
                      <span className="font-medium">Matches only: </span>
                      {formatCaptureRuleMatcher(suggestion.rule.matcher)}
                    </p>
                    {suggestion.requires_confirmation &&
                    !isCreated &&
                    readyResponse.access_mode !== "preview" ? (
                      <Field orientation="horizontal">
                        <Checkbox
                          id={`review-${suggestion.suggestion_id}`}
                          checked={reviewed[suggestion.suggestion_id] === true}
                          onCheckedChange={(checked) =>
                            setReviewed((current) => ({
                              ...current,
                              [suggestion.suggestion_id]: checked === true
                            }))
                          }
                        />
                        <FieldLabel htmlFor={`review-${suggestion.suggestion_id}`}>
                          I reviewed this scope and want to{" "}
                          {suggestion.recommended_action === "drop"
                            ? "discard"
                            : "change capture for"}{" "}
                          future matching events.
                        </FieldLabel>
                      </Field>
                    ) : null}
                  </CardContent>
                  <CardFooter className="justify-end">
                    <Button
                      type="button"
                      variant={suggestion.recommended_action === "drop" ? "destructive" : "outline"}
                      disabled={
                        isCreatingSuggestionId !== null ||
                        isCreated ||
                        readyResponse.access_mode === "preview" ||
                        (suggestion.requires_confirmation &&
                          reviewed[suggestion.suggestion_id] !== true)
                      }
                      onClick={() => void handleCreateSuggestion(suggestion)}
                    >
                      {isCreating
                        ? "Creating..."
                        : isCreated
                          ? "Rule exists"
                          : getActionLabel(suggestion.recommended_action)}
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </DialogFormContent>
    </Dialog>
  );
}

function getActionLabel(action: CaptureRuleSuggestion["recommended_action"]): string {
  return action === "demote"
    ? "Keep as context"
    : action === "drop"
      ? "Stop capturing"
      : "Sample events";
}

function getActionVariant(
  action: CaptureRuleSuggestion["recommended_action"]
): "secondary" | "warning" | "destructive" {
  switch (action) {
    case "demote":
      return "secondary";
    case "sample":
      return "warning";
    case "drop":
      return "destructive";
  }
}
