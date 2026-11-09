import { PendingButton } from "../components/system/pending-button.js";
import { usePendingAction } from "../lib/use-pending-action.js";
import { KeySquareIcon, PlusIcon } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  MemberTokenScopeDeclarationSchema,
  type MemberTokenScopeDeclaration
} from "../../../../packages/shared-types/src/index.js";
import { MemberTokenScopeFields } from "../components/system/member-token-scope-fields.js";

import { CalloutCard } from "../components/system/callout-card.js";
import { DialogFormContent } from "../components/system/dialog-form-content.js";
import { PageHeader } from "../components/system/page-header.js";
import { PlaintextTokenReveal } from "../components/system/plaintext-token-reveal.js";
import { ResourceListState } from "../components/system/resource-list-state.js";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "../components/ui/alert-dialog.js";
import { Button } from "../components/ui/button.js";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.js";
import { Dialog, DialogTrigger } from "../components/ui/dialog.js";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "../components/ui/empty.js";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel
} from "../components/ui/field.js";
import { Input } from "../components/ui/input.js";
import { Skeleton } from "../components/ui/skeleton.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "../components/ui/table.js";
import {
  createMemberToken,
  listMemberTokens,
  listProjects,
  revokeMemberToken,
  type CreatedMemberToken,
  type MemberTokenRecord,
  type ProjectRecord
} from "../lib/api.js";
import { showErrorToast, showSuccessToast } from "../lib/notify.js";
import { useSession } from "../lib/session.js";

export function MemberTokensPage(): JSX.Element {
  const { session } = useSession();
  const { pending: isCreating, run: runCreate } = usePendingAction();
  const [tokens, setTokens] = useState<MemberTokenRecord[] | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [replacementFor, setReplacementFor] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [createdToken, setCreatedToken] = useState<CreatedMemberToken | null>(null);
  const [scope, setScope] = useState<MemberTokenScopeDeclaration>({
    mode: "projects",
    project_ids: [],
    permissions: ["project:read"]
  });
  const [expiryDays, setExpiryDays] = useState(90);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [projectLoadError, setProjectLoadError] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const contextKey = `${session?.user_id}:${session?.organization_id}`;
  const currentContext = useRef(contextKey);
  currentContext.current = contextKey;

  useEffect(() => {
    if (session === null) {
      return;
    }

    let active = true;
    setTokens(null);
    setProjects([]);
    setLoadError(false);
    setProjectLoadError(false);
    setCreatedToken(null);
    setIsCreateOpen(false);
    setReplacementFor(null);
    void Promise.allSettled([listMemberTokens(true), listProjects()]).then(
      ([tokenResult, projectResult]) => {
        if (!active) return;
        if (tokenResult.status === "fulfilled") setTokens(tokenResult.value);
        else setLoadError(true);
        if (projectResult.status === "fulfilled") setProjects(projectResult.value);
        else setProjectLoadError(true);
      }
    );
    return () => {
      active = false;
    };
  }, [contextKey, revision]);

  if (session === null) {
    return <Navigate replace to="/login" />;
  }

  const isVerified = session.email_verified_at !== null;
  const canCreate = isVerified;

  function openCreation(replacementTokenLabel: string | null = null): void {
    setReplacementFor(replacementTokenLabel);
    setLabel(replacementTokenLabel === null ? "" : `${replacementTokenLabel} replacement`);
    setScope({ mode: "projects", project_ids: [], permissions: ["project:read"] });
    setExpiryDays(90);
    setFormError(null);
    setIsCreateOpen(true);
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const parsed = MemberTokenScopeDeclarationSchema.safeParse(scope);
    if (
      !parsed.success ||
      label.trim().length === 0 ||
      !Number.isInteger(expiryDays) ||
      expiryDays < 1 ||
      expiryDays > 365
    ) {
      setFormError(
        "Enter a label, choose at least one project or the current organisation, and set an expiry from 1 to 365 days."
      );
      return;
    }
    const issuedContext = contextKey;
    await runCreate(async () => {
      try {
        setFormError(null);
        const created = await createMemberToken({
          label: label.trim(),
          scope: parsed.data,
          expires_at: new Date(Date.now() + expiryDays * 86_400_000).toISOString()
        });
        if (currentContext.current !== issuedContext) return;
        setCreatedToken(created);
        setTokens((current) => {
          const next = current ?? [];
          return [...next, { ...created, plaintext: undefined }];
        });
        setLabel("");
        setIsCreateOpen(false);
        setReplacementFor(null);
        showSuccessToast("Member token created successfully.");
      } catch {
        if (currentContext.current === issuedContext)
          setFormError(
            "Could not create this token. Check your current access and try again; your choices have been kept."
          );
      }
    });
  }

  async function handleRevoke(tokenId: string): Promise<void> {
    try {
      await revokeMemberToken(tokenId);
      setTokens((current) => (current ?? []).filter((token) => token.token_id !== tokenId));
      showSuccessToast("Member token revoked successfully.");
    } catch {
      showErrorToast("Could not revoke member token.");
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        description="Issue member-scoped credentials for CLI and MCP access. Plaintext token material is shown once and should move straight into a secret manager."
        actions={
          <Dialog
            open={isCreateOpen}
            onOpenChange={(next) => {
              if (!isCreating) {
                if (next) openCreation();
                else {
                  setIsCreateOpen(false);
                  setReplacementFor(null);
                }
              }
            }}
          >
            <DialogTrigger asChild>
              <Button type="button" disabled={!canCreate}>
                <PlusIcon data-icon="inline-start" />
                Create member token
              </Button>
            </DialogTrigger>
            <DialogFormContent
              title={replacementFor === null ? "Create token" : "Create replacement token"}
              busy={isCreating}
              description={
                replacementFor === null
                  ? "Choose the projects and operations this automation needs. The secret will be shown once."
                  : "Choose the projects and permissions for the replacement. Your existing token stays active until you revoke it. Update your CLI or MCP connection first."
              }
              footer={
                <PendingButton type="submit" pending={isCreating} pendingLabel="Creating…">
                  Create token
                </PendingButton>
              }
              onSubmit={(event) => void handleCreate(event)}
            >
              <FieldGroup>
                <Field data-invalid={formError !== null || undefined}>
                  <FieldLabel htmlFor="member-token-label">Token label</FieldLabel>
                  <Input
                    disabled={isCreating}
                    id="member-token-label"
                    value={label}
                    required
                    maxLength={120}
                    aria-invalid={formError !== null || undefined}
                    onChange={(event) => setLabel(event.currentTarget.value)}
                  />
                  <FieldDescription>
                    Use a label that identifies the automation client or environment.
                  </FieldDescription>
                </Field>
                <MemberTokenScopeFields
                  value={scope}
                  onChange={setScope}
                  projects={projects}
                  organizationId={session.organization_id}
                  canAdministerOrganization={session.role === "owner" || session.role === "admin"}
                  disabled={isCreating}
                />
                {projectLoadError && scope.mode === "projects" ? (
                  <FieldDescription>
                    Project choices could not be loaded. Close this dialog and retry the list.
                  </FieldDescription>
                ) : null}
                <Field>
                  <FieldLabel htmlFor="member-token-expiry">Expires in days</FieldLabel>
                  <Input
                    id="member-token-expiry"
                    type="number"
                    min={1}
                    max={365}
                    required
                    value={expiryDays}
                    disabled={isCreating}
                    onChange={(event) => setExpiryDays(event.currentTarget.valueAsNumber)}
                  />
                  <FieldDescription>
                    Default 90 days, maximum 365. Access stops sooner if your role or membership is
                    revoked.
                  </FieldDescription>
                </Field>
                <FieldDescription>
                  {scope.mode === "projects"
                    ? `${scope.project_ids.length} selected projects`
                    : "Current and future authorised projects in this organisation"}{" "}
                  · {scope.permissions.join(", ")} · {expiryDays} days. Restricted tokens cannot
                  issue other credentials or manage billing.
                </FieldDescription>
                {formError === null ? null : <FieldError>{formError}</FieldError>}
              </FieldGroup>
            </DialogFormContent>
          </Dialog>
        }
      />

      {!canCreate ? (
        <CalloutCard
          eyebrow="Verification required"
          title="Token issuance paused"
          description="Complete email sign-in again to verify this address before creating a scoped member token."
          tone="warning"
        />
      ) : null}

      {loadError || projectLoadError ? (
        <CalloutCard
          eyebrow="Could not load"
          title="Some token controls are unavailable"
          description="Retry to load the current tokens and accessible projects."
          tone="warning"
        >
          <Button variant="outline" onClick={() => setRevision((value) => value + 1)}>
            Retry
          </Button>
        </CalloutCard>
      ) : null}

      {createdToken?.plaintext === undefined ? null : (
        <PlaintextTokenReveal value={createdToken.plaintext} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Issued tokens</CardTitle>
        </CardHeader>
        <CardContent>
          <ResourceListState
            items={tokens}
            loading={
              <div className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            }
            empty={
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <KeySquareIcon />
                  </EmptyMedia>
                  <EmptyTitle>No member tokens yet</EmptyTitle>
                  <EmptyDescription>
                    Issue a member token when you need CLI or MCP access outside the signed-in
                    browser workspace.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button type="button" onClick={() => openCreation()} disabled={!canCreate}>
                    <PlusIcon data-icon="inline-start" />
                    Create member token
                  </Button>
                </EmptyContent>
              </Empty>
            }
          >
            {(resolvedTokens) => (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Label</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Access / expiry</TableHead>
                    <TableHead>Last used</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resolvedTokens.map((token) => (
                    <TableRow key={token.token_id}>
                      <TableCell className="font-medium">{token.label}</TableCell>
                      <TableCell>{formatDate(token.created_at)}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span>
                            {token.scope === undefined
                              ? "Legacy broad access"
                              : token.scope.mode === "projects"
                                ? `${token.scope.projects.length} selected projects`
                                : "Named organisation"}
                          </span>
                          <span>{token.scope?.permissions.join(", ")}</span>
                          <span>
                            {token.expires_at === null
                              ? "No expiry"
                              : `Expires ${formatDate(token.expires_at)}`}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {token.last_used_at === null ? "Never" : formatDate(token.last_used_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {token.scope === undefined ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={!canCreate}
                              onClick={() => openCreation(token.label)}
                            >
                              Create replacement
                            </Button>
                          ) : null}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button type="button" variant="ghost" size="sm">
                                Revoke
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Revoke member token</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will immediately invalidate the token for CLI and MCP
                                  authentication.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => void handleRevoke(token.token_id)}
                                >
                                  Revoke token
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </ResourceListState>
        </CardContent>
      </Card>
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}
