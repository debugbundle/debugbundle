import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import type { GitHubDispatchRuleRecord } from "../../lib/api.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";

export function GitHubRulesPanel({
  rules,
  canCreate,
  deletingRuleId,
  canEdit,
  canDelete,
  onCreate,
  onEdit,
  onDelete
}: {
  rules: GitHubDispatchRuleRecord[];
  canCreate: boolean;
  deletingRuleId: string | null;
  canEdit: (rule: GitHubDispatchRuleRecord) => boolean;
  canDelete: (rule: GitHubDispatchRuleRecord) => boolean;
  onCreate: () => void;
  onEdit: (rule: GitHubDispatchRuleRecord) => void;
  onDelete: (id: string) => void;
}): JSX.Element {
  return (
    <div className="rounded-lg border border-border/80 bg-background/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">Dispatch rules</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Rules currently attached to this project repository.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{rules.length}</Badge>
          {!canCreate ? null : (
            <Button type="button" size="sm" variant="outline" onClick={() => onCreate()}>
              <PlusIcon data-icon="inline-start" />
              Create rule
            </Button>
          )}
        </div>
      </div>
      {rules.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No GitHub dispatch rules are configured yet.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {rules.map((rule) => (
            <div
              key={rule.rule_id}
              className="rounded-md border border-border/80 bg-background px-3 py-3"
            >
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="min-w-0 text-sm font-medium text-foreground [overflow-wrap:anywhere]">
                  {rule.name}
                </p>
                <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                  <Badge variant={rule.enabled ? "success" : "secondary"}>
                    {rule.enabled ? "enabled" : "disabled"}
                  </Badge>
                  {canEdit(rule) ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Edit rule ${rule.name}`}
                      onClick={() => onEdit(rule)}
                    >
                      <PencilIcon data-icon="inline-start" />
                      Edit rule
                    </Button>
                  ) : null}
                  {canDelete(rule) ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={deletingRuleId === rule.rule_id}
                      aria-label={`Delete rule ${rule.name}`}
                      onClick={() => onDelete(rule.rule_id)}
                    >
                      <Trash2Icon data-icon="inline-start" />
                      {deletingRuleId === rule.rule_id ? "Deleting..." : "Delete rule"}
                    </Button>
                  ) : null}
                </div>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{rule.event_types.join(", ")}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
