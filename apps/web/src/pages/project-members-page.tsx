import { ResourceEmptyState } from "../components/system/resource-empty-state.js";
import { PendingButton } from "../components/system/pending-button.js";
import { usePendingAction } from "../lib/use-pending-action.js";
import { LogOutIcon, MailCheckIcon, PlusIcon, Trash2Icon, UsersIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";

import { CalloutCard } from "../components/system/callout-card.js";
import { DialogFormContent } from "../components/system/dialog-form-content.js";
import { PageHeader } from "../components/system/page-header.js";
import { PlanUpgradeCallout } from "../components/system/plan-upgrade-callout.js";
import type { ProjectContext } from "../components/system/project-layout.js";
import { UserAvatar } from "../components/system/user-avatar.js";
import { TableActionButton } from "../components/system/table-action-button.js";
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "../components/ui/card.js";
import { Dialog, DialogTrigger } from "../components/ui/dialog.js";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "../components/ui/empty.js";
import { Field, FieldGroup, FieldLabel } from "../components/ui/field.js";
import { Input } from "../components/ui/input.js";
import { ToggleGroup, ToggleGroupItem } from "../components/ui/toggle-group.js";
import { Skeleton } from "../components/ui/skeleton.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "../components/ui/table.js";
import { showErrorToast, showSuccessToast } from "../lib/notify.js";
import { getProjectEffectiveRole } from "../lib/project-access.js";
import {
  cancelProjectInvite,
  inviteProjectMember,
  leaveProjectMembership,
  listProjectInvites,
  listProjectMembers,
  removeProjectMember,
  updateProjectMemberRole,
  type ProjectInviteRecord,
  type ProjectMemberRecord
} from "../lib/project-sharing-api.js";
import { useSession } from "../lib/session.js";
import { cn } from "../lib/utils.js";

const roleLabels: Record<ProjectMemberRecord["role"], string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer"
};

export function ProjectMembersPage(): JSX.Element {
  const { project, projectId } = useOutletContext<ProjectContext>();
  const { session, setSession } = useSession();
  const { pending: isInviting, run: runInvite } = usePendingAction();
  const navigate = useNavigate();
  const [members, setMembers] = useState<ProjectMemberRecord[] | null>(null);
  const [invites, setInvites] = useState<ProjectInviteRecord[] | null>(null);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member" | "viewer">("member");

  const effectiveRole = getProjectEffectiveRole(project);
  const canManage = effectiveRole === "owner" || effectiveRole === "admin";
  const sharingAvailable =
    project.organization_plan === "team" || project.organization_plan === "business";
  const canInvite = canManage && sharingAvailable;

  useEffect(() => {
    let isCancelled = false;

    void (async () => {
      try {
        const [nextMembers, nextInvites] = await Promise.all([
          listProjectMembers(projectId),
          canManage ? listProjectInvites(projectId) : Promise.resolve([])
        ]);
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
  }, [canManage, projectId, setSession]);

  async function handleInvite(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    await runInvite(async () => {
      try {
        const created = await inviteProjectMember(projectId, {
          email: inviteEmail,
          role: inviteRole
        });
        setInvites((current) => [...(current ?? []), created]);
        setInviteEmail("");
        setInviteRole("member");
        setIsInviteOpen(false);
        showSuccessToast("Invite sent successfully.");
      } catch (error) {
        if (error instanceof Error && error.message === "upgrade_required") {
          showErrorToast("Upgrade to Team or Business to invite collaborators.");
          return;
        }

        showErrorToast("Could not send invite.");
      }
    });
  }

  async function handleRoleChange(
    userId: string,
    role: "admin" | "member" | "viewer"
  ): Promise<void> {
    try {
      const updated = await updateProjectMemberRole(projectId, userId, role);
      setMembers((current) =>
        (current ?? []).map((member) => (member.user_id === userId ? updated : member))
      );
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

  async function handleLeaveProject(): Promise<void> {
    try {
      await leaveProjectMembership(projectId);
      showSuccessToast("You left the project.");
      void navigate("/projects");
    } catch (error) {
      if (error instanceof Error && error.message === "owner_leave_not_allowed") {
        showErrorToast("Owners cannot leave their own project.");
        return;
      }

      showErrorToast("Could not leave the project.");
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        className="items-end lg:justify-end"
        actions={
          canInvite ? (
            <Dialog
              open={isInviteOpen}
              onOpenChange={(next) => {
                if (!isInviting) setIsInviteOpen(next);
              }}
            >
              <DialogTrigger asChild>
                <Button type="button">
                  <PlusIcon data-icon="inline-start" />
                  Invite collaborator
                </Button>
              </DialogTrigger>
              <DialogFormContent
                title="Invite collaborator"
                busy={isInviting}
                description="Invite someone to this project."
                footer={
                  <PendingButton type="submit" pending={isInviting} pendingLabel="Sending…">
                    Send invite
                  </PendingButton>
                }
                onSubmit={(event) => void handleInvite(event)}
              >
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="project-invite-email">Email address</FieldLabel>
                    <Input
                      disabled={isInviting}
                      id="project-invite-email"
                      type="email"
                      value={inviteEmail}
                      onChange={(event) => setInviteEmail(event.currentTarget.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel id="project-invite-role-label" htmlFor="project-invite-role">
                      Role
                    </FieldLabel>
                    <ToggleGroup
                      type="single"
                      variant="outline"
                      id="project-invite-role"
                      aria-labelledby="project-invite-role-label"
                      disabled={isInviting}
                      value={inviteRole}
                      onValueChange={(value) => {
                        if (value === "admin" || value === "member" || value === "viewer")
                          setInviteRole(value);
                      }}
                    >
                      <ToggleGroupItem value="viewer">Viewer</ToggleGroupItem>
                      <ToggleGroupItem value="member">Member</ToggleGroupItem>
                      <ToggleGroupItem value="admin">Admin</ToggleGroupItem>
                    </ToggleGroup>
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
          title="You can review project access"
          description="Owners and admins manage sharing. Collaborators can still leave a project from their own row."
          tone="warning"
        />
      ) : null}

      {canManage && !sharingAvailable ? (
        <PlanUpgradeCallout
          eyebrow="Team or Business"
          title="Upgrade to share this project"
          description="Project sharing is available on Team and Business. Upgrade before inviting collaborators or managing shared access from this project."
        />
      ) : null}

      <div className={cn("grid gap-4", canManage && "xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]")}>
        <Card>
          <CardHeader>
            <CardTitle>People with access</CardTitle>
            <CardDescription>
              Direct project roles. Inherited organisation access is managed in People; removing a
              direct role does not remove an inherited grant.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {members === null ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : members.length === 0 ? (
              <ResourceEmptyState
                icon={UsersIcon}
                title="No direct project members"
                description="Direct project roles appear here. People may still have inherited workspace access."
              />
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
                    const canLeave = isSelf && !isOwner;

                    return (
                      <TableRow key={member.user_id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-3">
                            <UserAvatar
                              email={member.email}
                              avatarUrl={member.avatar_url}
                              size="sm"
                            />
                            <span>{member.email}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {canEditRole ? (
                            <ToggleGroup
                              type="single"
                              variant="outline"
                              size="sm"
                              aria-label={`role for ${member.email}`}
                              value={member.role}
                              onValueChange={(value) => {
                                if (value === "admin" || value === "member" || value === "viewer")
                                  void handleRoleChange(member.user_id, value);
                              }}
                            >
                              <ToggleGroupItem value="viewer">Viewer</ToggleGroupItem>
                              <ToggleGroupItem value="member">Member</ToggleGroupItem>
                              <ToggleGroupItem value="admin">Admin</ToggleGroupItem>
                            </ToggleGroup>
                          ) : (
                            roleLabels[member.role]
                          )}
                        </TableCell>
                        <TableCell>{formatDate(member.created_at)}</TableCell>
                        <TableCell className="text-right">
                          {canRemove ? (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <TableActionButton label="Remove access" icon={Trash2Icon} />
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
                                  <AlertDialogAction
                                    onClick={() => void handleRemoveMember(member.user_id)}
                                  >
                                    Remove access
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          ) : canLeave ? (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <TableActionButton label="Leave project" icon={LogOutIcon} />
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Leave project</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    You will lose access to {project.name} immediately.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Stay on project</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => void handleLeaveProject()}>
                                    Leave project
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          ) : (
                            <span
                              className="text-muted-foreground"
                              aria-label="No action available"
                            >
                              —
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {canManage ? (
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
                    <EmptyDescription>
                      Outstanding invitations will appear here until they are accepted or cancelled.
                    </EmptyDescription>
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
                        <TableCell>{roleLabels[invite.role]}</TableCell>
                        <TableCell>{formatDate(invite.expires_at)}</TableCell>
                        <TableCell className="text-right">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <TableActionButton label="Cancel invite" icon={XIcon} />
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
                                <AlertDialogAction
                                  onClick={() => void handleCancelInvite(invite.invite_id)}
                                >
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
        ) : null}
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
