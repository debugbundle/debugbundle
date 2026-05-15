import { DownloadIcon, KeySquareIcon, ShieldAlertIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { CalloutCard } from "../components/system/callout-card.js";
import { PageHeader } from "../components/system/page-header.js";
import { UserAvatar } from "../components/system/user-avatar.js";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card.js";
import { Field, FieldLabel } from "../components/ui/field.js";
import { Input } from "../components/ui/input.js";
import { deleteAccount, exportAccountData, importAccountAvatarFromGravatar } from "../lib/api.js";
import { showErrorToast, showSuccessToast } from "../lib/notify.js";
import { useSession } from "../lib/session.js";

export function SettingsPage(): JSX.Element {
  const { session, setSession } = useSession();
  const navigate = useNavigate();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteConfirmationEmail, setDeleteConfirmationEmail] = useState("");
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImportingAvatar, setIsImportingAvatar] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!isDeleteDialogOpen) {
      setDeleteConfirmationEmail("");
      setDeleteErrorMessage(null);
    }
  }, [isDeleteDialogOpen]);

  if (session === null) {
    return <Navigate replace to="/login" />;
  }

  const canManageOrganizationAccount = session.role === "owner";
  const hasEmailCredential = session.auth_methods.email;
  const hasGithubCredential = session.auth_methods.github;
  const deletionConfirmationMatched = deleteConfirmationEmail.trim().toLowerCase() === session.email.toLowerCase();

  async function handleExportAccountData(): Promise<void> {
    if (!canManageOrganizationAccount) {
      return;
    }

    setIsExporting(true);

    try {
      const { blob, filename } = await exportAccountData();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
      showSuccessToast("Account export downloaded successfully.");
    } catch {
      showErrorToast("Could not download account export.");
    } finally {
      setIsExporting(false);
    }
  }

  async function handleDeleteAccount(): Promise<void> {
    if (!deletionConfirmationMatched) {
      setDeleteErrorMessage("Enter your email address exactly to confirm deletion.");
      return;
    }

    setIsDeleting(true);
    setDeleteErrorMessage(null);

    try {
      const email = session?.email;
      if (email === undefined) {
        return;
      }

      await deleteAccount({ email });
      setSession(null);
      setIsDeleteDialogOpen(false);
      showSuccessToast("Account deleted successfully.");
      void navigate("/login", { replace: true });
    } catch (error) {
      if (error instanceof Error && error.message === "other_owned_organizations_exist") {
        setDeleteErrorMessage("Transfer or delete the other workspaces you own before deleting this account.");
      } else {
        setDeleteErrorMessage("Could not delete this account.");
      }
      showErrorToast("Could not delete this account.");
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleImportGravatarAvatar(): Promise<void> {
    if (session === null) {
      return;
    }

    setIsImportingAvatar(true);

    try {
      const avatar = await importAccountAvatarFromGravatar();
      setSession({
        ...session,
        avatar_url: avatar.avatar_url
      });
      showSuccessToast("Avatar imported successfully.");
    } catch (error) {
      if (error instanceof Error && error.message === "gravatar_not_found") {
        showErrorToast("No Gravatar image was found for this email.");
      } else {
        showErrorToast("Could not import avatar.");
      }
    } finally {
      setIsImportingAvatar(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader description="Review your active sign-in methods, account verification state, and account lifecycle controls." />
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
              <CardDescription>Session-backed account details for this workspace.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
              <DetailBlock label="Email" value={session.email} />
              <DetailBlock label="Workspace" value={session.organization_id} />
              <DetailBlock label="Role" value={session.role} />
              <DetailBlock label="Session" value={session.session_id} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Avatar</CardTitle>
              <CardDescription>GitHub avatars sync automatically when available. Gravatar import is always explicit.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <UserAvatar email={session.email} avatarUrl={session.avatar_url} size="lg" />
                <div className="space-y-1 text-sm">
                  <p className="font-medium text-foreground">{session.avatar_url === null ? "Initials fallback active" : "Cached profile avatar active"}</p>
                  <p className="text-muted-foreground">Imports are fetched server-side and cached in DebugBundle storage.</p>
                </div>
              </div>
              <Button type="button" variant="outline" onClick={() => void handleImportGravatarAvatar()} disabled={isImportingAvatar}>
                {isImportingAvatar ? "Importing..." : "Import from Gravatar"}
              </Button>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Verification status</CardTitle>
                <CardDescription>Email verification gates first token issuance.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {session.email_verified_at === null ? (
                  <CalloutCard
                    eyebrow="Pending"
                    title="Verification required"
                    description="Verify your email before creating your first member token."
                    tone="warning"
                  />
                ) : (
                  <CalloutCard
                    eyebrow="Ready"
                    title="Verified"
                    description="This account can issue member tokens for CLI and MCP access."
                    tone="neutral"
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Sign-in methods</CardTitle>
                <CardDescription>Browser sign-in options currently attached to this member identity.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <DetailBlock label="Email code" value={hasEmailCredential ? "Enabled" : "Unavailable"} />
                <DetailBlock label="GitHub OAuth" value={hasGithubCredential ? "Enabled" : "Not connected"} />
                {hasEmailCredential ? (
                  <p className="text-muted-foreground">Email sign-in uses a one-time code and completes account verification as part of the same flow.</p>
                ) : (
                  <p className="text-muted-foreground">This account currently relies on GitHub only. Request an email code from the login screen if email access should be enabled.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Email access</CardTitle>
              <CardDescription>Browser sessions are issued through explicit one-time email codes.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border/80 bg-background/70 p-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2 font-medium text-foreground">
                  <KeySquareIcon className="size-4" />
                  One-time code sign-in
                </div>
                <p className="mt-2 leading-6">Each browser sign-in requires a fresh email code. There is no reusable browser password to rotate or recover.</p>
              </div>
              <div className="rounded-lg border border-border/80 bg-background/70 p-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2 font-medium text-foreground">
                  <KeySquareIcon className="size-4" />
                  Recovery path
                </div>
                <p className="mt-2 leading-6">If a session remains unverified, sign out and request a new email code from the login screen to finish verification with a fresh browser session.</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Account data export</CardTitle>
              <CardDescription>Download the retained data tied to this account.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border/80 bg-background/70 p-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2 font-medium text-foreground">
                  <DownloadIcon className="size-4" />
                  Export retained data
                </div>
                <p className="mt-2 leading-6">Exports retained account data, including members, projects, tokens, incidents, and debugging artifacts, as a JSON attachment.</p>
              </div>
              {!canManageOrganizationAccount ? (
                <p className="text-sm text-muted-foreground">Only owners can export or delete this account.</p>
              ) : null}
              <Button type="button" variant="outline" onClick={() => void handleExportAccountData()} disabled={!canManageOrganizationAccount || isExporting}>
                <DownloadIcon data-icon="inline-start" />
                {isExporting ? "Preparing export..." : "Download export"}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-destructive/25 bg-destructive/5">
            <CardHeader>
              <CardTitle>Delete account</CardTitle>
              <CardDescription>Irreversible removal of this account and its retained debugging data.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-destructive/25 bg-background/70 p-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2 font-medium text-foreground">
                  <ShieldAlertIcon className="size-4" />
                  Destructive operation
                </div>
                <p className="mt-2 leading-6">Deleting this account removes its members, projects, incidents, tokens, and retained debugging artifacts. This cannot be undone.</p>
              </div>
              {!canManageOrganizationAccount ? (
                <p className="text-sm text-muted-foreground">Only owners can delete this account.</p>
              ) : null}
              <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="destructive" disabled={!canManageOrganizationAccount || isDeleting}>
                    <Trash2Icon data-icon="inline-start" />
                    Delete account
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete account</AlertDialogTitle>
                    <AlertDialogDescription>
                      Type your email address to confirm permanent deletion of this account and all retained project data.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="space-y-3">
                    <Field>
                      <FieldLabel htmlFor="delete-account-confirmation-email">Confirm email address</FieldLabel>
                      <Input
                        id="delete-account-confirmation-email"
                        value={deleteConfirmationEmail}
                        onChange={(event) => setDeleteConfirmationEmail(event.currentTarget.value)}
                        placeholder={session.email}
                        autoComplete="off"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        disabled={isDeleting}
                      />
                    </Field>
                    {deleteErrorMessage === null ? null : <p className="text-sm text-destructive">{deleteErrorMessage}</p>}
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={() => void handleDeleteAccount()} disabled={isDeleting || !deletionConfirmationMatched}>
                      {isDeleting ? "Deleting..." : "Delete account"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        </div>
      </div>

    </div>
  );
}

function DetailBlock({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium break-all">{value}</p>
    </div>
  );
}
