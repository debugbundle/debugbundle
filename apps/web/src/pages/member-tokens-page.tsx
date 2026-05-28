import { KeySquareIcon, PlusIcon } from "lucide-react";
import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

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
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../components/ui/empty.js";
import { Field, FieldDescription, FieldLabel } from "../components/ui/field.js";
import { Input } from "../components/ui/input.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table.js";
import {
  createMemberToken,
  listMemberTokens,
  revokeMemberToken,
  type CreatedMemberToken,
  type MemberTokenRecord
} from "../lib/api.js";
import { showErrorToast, showSuccessToast } from "../lib/notify.js";
import { useSession } from "../lib/session.js";

export function MemberTokensPage(): JSX.Element {
  const { session } = useSession();
  const [tokens, setTokens] = useState<MemberTokenRecord[] | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [createdToken, setCreatedToken] = useState<CreatedMemberToken | null>(null);

  useEffect(() => {
    if (session === null) {
      return;
    }

    void (async () => {
      const nextTokens = await listMemberTokens();
      setTokens(nextTokens);
    })();
  }, [session]);

  if (session === null) {
    return <Navigate replace to="/login" />;
  }

  const isVerified = session.email_verified_at !== null;
  const canCreate = isVerified || (tokens !== null && tokens.length > 0);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    try {
      const created = await createMemberToken({ label });
      setCreatedToken(created);
      setTokens((current) => {
        const next = current ?? [];
        return [...next, { ...created, plaintext: undefined }];
      });
      setLabel("");
      setIsCreateOpen(false);
      showSuccessToast("Member token created successfully.");
    } catch {
      showErrorToast("Could not create member token.");
    }
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
    <div className="space-y-8">
      <PageHeader
        description="Issue member-scoped credentials for CLI and MCP access. Plaintext token material is shown once and should move straight into a secret manager."
        actions={
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button type="button" disabled={!canCreate}>
                <PlusIcon data-icon="inline-start" />
                Create member token
              </Button>
            </DialogTrigger>
            <DialogFormContent
              title="Create token"
              description="Create a member token for CLI or MCP automation."
              footer={<Button type="submit">Create token</Button>}
              onSubmit={(event) => void handleCreate(event)}
            >
              <Field>
                <FieldLabel htmlFor="member-token-label">Token label</FieldLabel>
                <Input
                  id="member-token-label"
                  value={label}
                  onChange={(event) => setLabel(event.currentTarget.value)}
                />
                <FieldDescription>
                  Use a label that identifies the automation client or environment.
                </FieldDescription>
              </Field>
            </DialogFormContent>
          </Dialog>
        }
      />

      {!canCreate ? (
        <CalloutCard
          eyebrow="Verification required"
          title="Token issuance paused"
          description="Complete email sign-in again to verify this address before creating your first member token."
          tone="warning"
        />
      ) : null}

      {createdToken?.plaintext === undefined ? null : <PlaintextTokenReveal value={createdToken.plaintext} />}

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
                    Issue a member token when you need CLI or MCP access outside the signed-in browser workspace.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button type="button" onClick={() => setIsCreateOpen(true)} disabled={!canCreate}>
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
                    <TableHead>Last used</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resolvedTokens.map((token) => (
                    <TableRow key={token.token_id}>
                      <TableCell className="font-medium">{token.label}</TableCell>
                      <TableCell>{formatDate(token.created_at)}</TableCell>
                      <TableCell>{token.last_used_at === null ? "Never" : formatDate(token.last_used_at)}</TableCell>
                      <TableCell className="text-right">
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
                                This will immediately invalidate the token for CLI and MCP authentication.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => void handleRevoke(token.token_id)}>
                                Revoke token
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
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
