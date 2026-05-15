import { MailCheckIcon, PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";

import { CalloutCard } from "../components/system/callout-card.js";
import { DialogFormContent } from "../components/system/dialog-form-content.js";
import { PageHeader } from "../components/system/page-header.js";
import type { ProjectContext } from "../components/system/project-layout.js";
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
import { Dialog, DialogTrigger } from "../components/ui/dialog.js";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../components/ui/empty.js";
import { Field, FieldGroup, FieldLabel } from "../components/ui/field.js";
import { Input } from "../components/ui/input.js";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table.js";
import { showErrorToast, showSuccessToast } from "../lib/notify.js";
import { getProjectEffectiveRole } from "../lib/project-access.js";
import {
  cancelProjectInvite,
  inviteProjectMember,
  listProjectInvites,
  listProjectMembers,
  removeProjectMember,
  updateProjectMemberRole,
  type ProjectInviteRecord,
  type ProjectMemberRecord
} from "../lib/project-sharing-api.js";
import { useSession } from "../lib/session.js";

export function ProjectMembersPage(): JSX.Element {
  const { project, projectId } = useOutletContext<ProjectContext>();
  const { session, setSession } = useSession();
  const [members, setMembers] = useState<ProjectMemberRecord[] | null>(null);
  const [invites, setInvites] = useState<ProjectInviteRecord[] | null>(null);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");

  const effectiveRole = getProjectEffectiveRole(project);
  const canManage = effectiveRole === "owner" || effectiveRole === "admin";
  const canInvite = canManage && project.organization_plan === "team";

  useEffect(() => {
    let isCancelled = false;

    void (async () => {
      try {
        const [nextMembers, nextInvites] = await Promise.all([listProjectMembers(projectId), listProjectInvites(projectId)]);
        if (!isCancelled) {
          setMembers(nextMembers);
          setInvites(nextInvites);
        }
      } catch (error) {
        if (error instanceof Error && error.message === "invalid_session") {
          setSession(null);
          return;
        }

        throw error;
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [projectId, setSession]);

  async function handleInvite(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    try {
      const created = await inviteProjectMember(projectId, { email: inviteEmail, role: inviteRole });
      setInvites((current) => [...(current ?? []), created]);
      setInviteEmail("");
      setInviteRole("member");
      setIsInviteOpen(false);
      showSuccessToast("Invite sent successfully.");
    } catch (error) {
      if (error instanceof Error && error.message === "upgrade_required") {
        showErrorToast("Project sharing requires Team.");
        return;
      }

      showErrorToast("Could not send invite.");
    }
  }

  async function handleRoleChange(userId: string, role: "admin" | "member"): Promise<void> {
    try {
      const updated = await updateProjectMemberRole(projectId, userId, role);
      setMembers((current) => (current ?? []).map((member) => (member.user_id === userId ? updated : member)));
      showSuccessToast("Access updated successfully.");
    } catch (error) {
      if (error instanceof Error && error.message === "owner_role_change_not_allowed") {
        showErrorToast("Owner access cannot be changed here.");
        return;
      }

      showErrorToast("Could not update access.");
    }
  }

  async function handleRemoveMember(userId: string): Promise<void> {
    try {
      await removeProjectMember(projectId, userId);
      setMembers((current) => (current ?? []).filter((member) => member.user_id !== userId));
      showSuccessToast("Access removed successfully.");
    } catch (error) {
      if (error instanceof Error && error.message === "owner_removal_not_allowed") {
        showErrorToast("Owner access cannot be removed here.");
        return;
      }

      showErrorToast("Could not remove access.");
    }
  }

  async function handleCancelInvite(inviteId: string): Promise<void> {
    try {
      await cancelProjectInvite(projectId, inviteId);
      setInvites((current) => (current ?? []).filter((invite) => invite.invite_id !== inviteId));
      showSuccessToast("Invite cancelled successfully.");
    } catch {
      showErrorToast("Could not cancel invite.");
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        description="Manage who can access this project and review pending invites."
        actions={
          canInvite ? (
            <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
              <DialogTrigger asChild>
                <Button type="button">
                  <PlusIcon data-icon="inline-start" />
                  Invite collaborator
                </Button>
              </DialogTrigger>
              <DialogFormContent
                title="Invite collaborator"
                description="Invite someone to this project."
                footer={<Button type="submit">Send invite</Button>}
                onSubmit={(event) => void handleInvite(event)}
              >
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="project-invite-email">Email address</FieldLabel>
                    <Input
                      id="project-invite-email"
                      type="email"
                      value={inviteEmail}
                      onChange={(event) => setInviteEmail(event.currentTarget.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel id="project-invite-role-label" htmlFor="project-invite-role">Role</FieldLabel>
                    <Select
                      value={inviteRole}
                      onValueChange={(value) => setInviteRole(value as "admin" | "member")}
                    >
                      <SelectTrigger id="project-invite-role" aria-labelledby="project-invite-role-label project-invite-role" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        <SelectGroup>
                          <SelectItem value="member">Member</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                </FieldGroup>
              </DialogFormContent>
            </Dialog>
          ) : undefined
        }
      />

      {!canManage ? (
        <CalloutCard
          eyebrow="Read-only"
          title="You can view project access"
          description="Only project owners and admins can change sharing settings."
          tone="warning"
        />
      ) : null}

      {canManage && project.organization_plan !== "team" ? (
        <CalloutCard
          eyebrow="Team plan"
          title="Project sharing requires Team"
          description="Upgrade to Team to invite collaborators to this project."
          tone="warning"
        />
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>People with access</CardTitle>
            <CardDescription>Project owners and collaborators who can open this project.</CardDescription>
          </CardHeader>
          <CardContent>
            {members === null ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : members.length === 0 ? (
              <p className="text-sm text-muted-foreground">No members found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Added</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member) => {
                    const isOwner = member.membership_type === "owner";
                    const isSelf = member.user_id === session?.user_id;
                    const canEditRole = canManage && !isOwner && !isSelf;
                    const canRemove = canManage && !isOwner && !isSelf;

                    return (
                      <TableRow key={member.user_id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-3">
                            <UserAvatar email={member.email} avatarUrl={member.avatar_url} size="sm" />
                            <span>{member.email}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {canEditRole ? (
                            <Select
                              value={member.role}
                              onValueChange={(value) => void handleRoleChange(member.user_id, value as "admin" | "member")}
                            >
                              <SelectTrigger aria-label={`role for ${member.email}`} className="min-w-28" size="sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent position="popper">
                                <SelectGroup>
                                  <SelectItem value="member">member</SelectItem>
                                  <SelectItem value="admin">admin</SelectItem>
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                          ) : (
                            member.role
                          )}
                        </TableCell>
                        <TableCell>{formatDate(member.created_at)}</TableCell>
                        <TableCell className="text-right">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button type="button" variant="ghost" size="sm" disabled={!canRemove}>
                                Remove
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remove access</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This removes {member.email} from this project immediately.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => void handleRemoveMember(member.user_id)}>
                                  Remove access
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pending invites</CardTitle>
            <CardDescription>Invitations waiting to be accepted.</CardDescription>
          </CardHeader>
          <CardContent>
            {invites === null ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : invites.length === 0 ? (
              <Empty className="min-h-[9rem] justify-center border border-dashed border-border/80 bg-background/50">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <MailCheckIcon />
                  </EmptyMedia>
                  <EmptyTitle>No pending invites right now</EmptyTitle>
                  <EmptyDescription>Outstanding invitations will appear here until they are accepted or cancelled.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invites.map((invite) => (
                    <TableRow key={invite.invite_id}>
                      <TableCell className="font-medium">{invite.email}</TableCell>
                      <TableCell>{invite.role}</TableCell>
                      <TableCell>{formatDate(invite.expires_at)}</TableCell>
                      <TableCell className="text-right">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button type="button" variant="ghost" size="sm" disabled={!canManage}>
                              Cancel
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Cancel invite</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will revoke the pending invitation for {invite.email}.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Keep invite</AlertDialogCancel>
                              <AlertDialogAction onClick={() => void handleCancelInvite(invite.invite_id)}>
                                Cancel invite
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}
