import { FolderIcon, KeyRoundIcon, MailCheckIcon, PlusIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { CalloutCard } from "../components/system/callout-card.js";
import { DialogFormContent } from "../components/system/dialog-form-content.js";
import { PageHeader } from "../components/system/page-header.js";
import { PlaintextTokenReveal } from "../components/system/plaintext-token-reveal.js";
import { ProjectResourceEmptyState } from "../components/system/project-resource-empty-state.js";
import type { ProjectContext } from "../components/system/project-layout.js";
import { ResourceListState } from "../components/system/resource-list-state.js";
import { SortableTableHead, toggleSort, type SortState } from "../components/system/sortable-table-head.js";
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
import { Badge } from "../components/ui/badge.js";
import { Button } from "../components/ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card.js";
import { Dialog, DialogTrigger } from "../components/ui/dialog.js";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../components/ui/empty.js";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "../components/ui/field.js";
import { Input } from "../components/ui/input.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table.js";
import {
  cancelOrganizationInvite,
  createProject,
  createProjectToken,
  isInvalidSessionError,
  inviteOrganizationMember,
  listOrganizationInvites,
  listOrganizationMembers,
  listProjects,
  listProjectTokens,
  removeOrganizationMember,
  revokeProjectToken,
  updateOrganizationMemberRole,
  type CreatedProjectToken,
  type OrganizationInviteRecord,
  type OrganizationMemberRecord,
  type ProjectRecord,
  type ProjectTokenRecord
} from "../lib/api.js";
import { showErrorToast, showSuccessToast } from "../lib/notify.js";
import { CUSTOM_PROJECT_ENVIRONMENT_VALUE, PROJECT_ENVIRONMENT_OPTIONS, slugifyProjectName } from "../lib/project-form.js";
import { useSession } from "../lib/session.js";

export { BillingPage } from "./billing-page.js";

export function ProjectsPage(): JSX.Element {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectRecord[] | null>(null);
  const [sort, setSort] = useState<SortState<ProjectSortField>>({
    field: "name",
    direction: "asc"
  });
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);
  const [environmentDefault, setEnvironmentDefault] = useState("production");
  const [customEnvironmentDefault, setCustomEnvironmentDefault] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const nextProjects = await listProjects();
        setProjects(nextProjects);
      } catch (error) {
        if (isInvalidSessionError(error)) {
          return;
        }

        throw error;
      }
    })();
  }, []);

  const sortedProjects = useMemo(() => sortProjects(projects, sort), [projects, sort]);
  const selectedProjectEnvironment = PROJECT_ENVIRONMENT_OPTIONS.some((option) => option.value === environmentDefault)
    ? environmentDefault
    : CUSTOM_PROJECT_ENVIRONMENT_VALUE;

  async function handleCreateProject(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    try {
      const created = await createProject({
        name,
        slug,
        environment_default: environmentDefault
      });
      setProjects((current) => [...(current ?? []), created]);
      setName("");
      setSlug("");
      setIsSlugManuallyEdited(false);
      setEnvironmentDefault("production");
      setCustomEnvironmentDefault("");
      setIsCreateOpen(false);
      void navigate(`/projects/${created.project_id}`);
    } catch {
      showErrorToast("Could not create project.");
    }
  }

  function handleProjectNameChange(value: string): void {
    setName(value);

    if (isSlugManuallyEdited) {
      return;
    }

    setSlug(slugifyProjectName(value));
  }

  function handleProjectSlugChange(value: string): void {
    setSlug(value);
    setIsSlugManuallyEdited(value !== slugifyProjectName(name));
  }

  function handleProjectEnvironmentChange(value: string): void {
    if (value === CUSTOM_PROJECT_ENVIRONMENT_VALUE) {
      setEnvironmentDefault(customEnvironmentDefault);
      return;
    }

    setEnvironmentDefault(value);
  }

  function handleCustomProjectEnvironmentChange(value: string): void {
    setCustomEnvironmentDefault(value);
    setEnvironmentDefault(value);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        description="Create and manage projects in this workspace."
        actions={
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button type="button">
                <PlusIcon data-icon="inline-start" />
                Create project
              </Button>
            </DialogTrigger>
            <DialogFormContent
              title="Create project"
              description="Add a new project in this workspace."
              size="lg"
              footer={<Button type="submit">Create project</Button>}
              onSubmit={(event) => void handleCreateProject(event)}
            >
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="project-name">Project name</FieldLabel>
                    <Input id="project-name" value={name} onChange={(event) => handleProjectNameChange(event.currentTarget.value)} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="project-slug">Project slug</FieldLabel>
                    <Input
                      id="project-slug"
                      value={slug}
                      onChange={(event) => handleProjectSlugChange(event.currentTarget.value)}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="project-environment-default">Default environment</FieldLabel>
                    <FieldDescription>Used as the initial environment in setup snippets and project defaults. You can change it later.</FieldDescription>
                    <select
                      id="project-environment-default"
                      className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      value={selectedProjectEnvironment}
                      onChange={(event) => handleProjectEnvironmentChange(event.currentTarget.value)}
                    >
                      {PROJECT_ENVIRONMENT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {selectedProjectEnvironment !== CUSTOM_PROJECT_ENVIRONMENT_VALUE ? null : (
                      <Input
                        id="project-environment-default-custom"
                        aria-label="Custom environment"
                        value={customEnvironmentDefault}
                        onChange={(event) => handleCustomProjectEnvironmentChange(event.currentTarget.value)}
                        placeholder="preview"
                        required
                      />
                    )}
                  </Field>
                </FieldGroup>
            </DialogFormContent>
          </Dialog>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Project inventory</CardTitle>
        </CardHeader>
        <CardContent>
          <ResourceListState
            items={projects}
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
                    <FolderIcon />
                  </EmptyMedia>
                  <EmptyTitle>No projects yet</EmptyTitle>
                  <EmptyDescription>
                    You haven't created any projects yet. Get started by creating your first project.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button type="button" onClick={() => setIsCreateOpen(true)}>
                    <PlusIcon data-icon="inline-start" />
                    Create project
                  </Button>
                </EmptyContent>
              </Empty>
            }
          >
            {() => (
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead label="Name" field="name" sort={sort} onSortChange={(field) => setSort((current) => toggleSort(current, field))} />
                    <SortableTableHead label="Slug" field="slug" sort={sort} onSortChange={(field) => setSort((current) => toggleSort(current, field))} />
                    <SortableTableHead label="Environment" field="environment_default" sort={sort} onSortChange={(field) => setSort((current) => toggleSort(current, field))} />
                    <SortableTableHead label="Bundle Requests" field="monthly_bundle_requests" sort={sort} onSortChange={(field) => setSort((current) => toggleSort(current, field))} />
                    <SortableTableHead label="Ingested Events" field="monthly_raw_ingested_events" sort={sort} onSortChange={(field) => setSort((current) => toggleSort(current, field))} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedProjects.map((project) => (
                    <TableRow
                      key={project.project_id}
                      className="cursor-pointer"
                      onClick={() => {
                        void navigate(`/projects/${project.project_id}`);
                      }}
                    >
                      <TableCell className="font-medium">{project.name}</TableCell>
                      <TableCell>{project.slug}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{project.environment_default}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{project.metrics.monthly_bundle_requests.toLocaleString()}</TableCell>
                      <TableCell className="text-muted-foreground">{project.metrics.monthly_raw_ingested_events.toLocaleString()}</TableCell>
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

export function ProjectTokensPage(): JSX.Element {
  const { projectId } = useOutletContext<ProjectContext>();
  const [tokens, setTokens] = useState<ProjectTokenRecord[] | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [createdToken, setCreatedToken] = useState<CreatedProjectToken | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const nextTokens = await listProjectTokens(projectId);
        setTokens(nextTokens);
      } catch (error) {
        if (isInvalidSessionError(error)) {
          return;
        }

        throw error;
      }
    })();
  }, [projectId]);

  const resolvedProjectId = projectId;

  async function handleCreateToken(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    try {
      const created = await createProjectToken(resolvedProjectId, { label });
      setCreatedToken(created);
      setTokens((current) => [...(current ?? []), { ...created, plaintext: undefined }]);
      setLabel("");
      setIsCreateOpen(false);
      showSuccessToast("Project token created successfully.");
    } catch {
      showErrorToast("Could not create project token.");
    }
  }

  async function handleRevokeToken(tokenId: string): Promise<void> {
    try {
      await revokeProjectToken(resolvedProjectId, tokenId);
      setTokens((current) => (current ?? []).filter((token) => token.token_id !== tokenId));
      showSuccessToast("Project token revoked successfully.");
    } catch {
      showErrorToast("Could not revoke project token.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div />
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button type="button">
              <PlusIcon data-icon="inline-start" />
              Create project token
            </Button>
          </DialogTrigger>
            <DialogFormContent
              title="Create token"
              description="Create a project token for SDK ingestion."
              footer={<Button type="submit">Create token</Button>}
              onSubmit={(event) => void handleCreateToken(event)}
            >
                <Field>
                  <FieldLabel htmlFor="project-token-label">Token label</FieldLabel>
                  <Input id="project-token-label" value={label} onChange={(event) => setLabel(event.currentTarget.value)} />
                </Field>
            </DialogFormContent>
          </Dialog>
      </div>

      {createdToken?.plaintext === undefined ? null : <PlaintextTokenReveal value={createdToken.plaintext} />}

      <Card>
        <CardHeader>
          <CardTitle>Issued project tokens</CardTitle>
          <CardDescription>Project-scoped credentials for SDK ingestion and environment-specific install flows.</CardDescription>
        </CardHeader>
        <CardContent>
          {tokens === null ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : tokens.length === 0 ? (
            <ProjectResourceEmptyState
              icon={KeyRoundIcon}
              title="No project tokens yet"
              description="Create an ingestion token when you are ready to connect an SDK or environment-specific deploy flow to this project."
              actionLabel="Create project token"
              onAction={() => setIsCreateOpen(true)}
            />
          ) : (
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
                {tokens.map((token) => (
                  <TableRow key={token.token_id}>
                    <TableCell className="font-medium">{token.label}</TableCell>
                    <TableCell>{formatDate(token.created_at)}</TableCell>
                    <TableCell>{token.last_used_at === null ? "Never" : formatDate(token.last_used_at)}</TableCell>
                    <TableCell className="text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button type="button" variant="ghost" size="sm">Revoke</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Revoke project token</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will stop SDK ingestion for any deployment still using the token.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => void handleRevokeToken(token.token_id)}>Revoke token</AlertDialogAction>
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
  );
}

export function OrganizationMembersPage(): JSX.Element {
  const { session } = useSession();
  const [members, setMembers] = useState<OrganizationMemberRecord[] | null>(null);
  const [invites, setInvites] = useState<OrganizationInviteRecord[] | null>(null);
  const [isForbidden, setIsForbidden] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"owner" | "member">("member");

  useEffect(() => {
    void (async () => {
      try {
        const [nextMembers, nextInvites] = await Promise.all([listOrganizationMembers(), listOrganizationInvites()]);
        setMembers(nextMembers);
        setInvites(nextInvites);
      } catch (error) {
        if (error instanceof Error && error.message === "forbidden") {
          setIsForbidden(true);
          return;
        }

        if (isInvalidSessionError(error)) {
          return;
        }

        throw error;
      }
    })();
  }, []);

  async function handleInvite(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    try {
      const created = await inviteOrganizationMember({ email: inviteEmail, role: inviteRole });
      setInvites((current) => [...(current ?? []), created]);
      setInviteEmail("");
      setInviteRole("member");
      setIsInviteOpen(false);
      showSuccessToast("Invitation sent successfully.");
    } catch {
      showErrorToast("Could not send invite.");
    }
  }

  async function handleRoleChange(userId: string, newRole: "owner" | "member"): Promise<void> {
    try {
      const updated = await updateOrganizationMemberRole(userId, newRole);
      setMembers((current) => (current ?? []).map((m) => (m.user_id === userId ? updated : m)));
      showSuccessToast("Member role updated successfully.");
    } catch {
      showErrorToast("Could not update member role.");
    }
  }

  async function handleRemoveMember(userId: string): Promise<void> {
    try {
      await removeOrganizationMember(userId);
      setMembers((current) => (current ?? []).filter((m) => m.user_id !== userId));
      showSuccessToast("Member removed successfully.");
    } catch {
      showErrorToast("Could not remove member.");
    }
  }

  async function handleCancelInvite(inviteId: string): Promise<void> {
    try {
      await cancelOrganizationInvite(inviteId);
      setInvites((current) => (current ?? []).filter((i) => i.invite_id !== inviteId));
      showSuccessToast("Invite cancelled successfully.");
    } catch {
      showErrorToast("Could not cancel invite.");
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        description="Manage members and pending invites for this organization."
        actions={
          !isForbidden ? (
            <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
              <DialogTrigger asChild>
                <Button type="button">
                  <PlusIcon data-icon="inline-start" />
                  Invite member
                </Button>
              </DialogTrigger>
              <DialogFormContent
                title="Invite member"
                description="Invite someone to this organization."
                footer={<Button type="submit">Send invite</Button>}
                onSubmit={(event) => void handleInvite(event)}
              >
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="invite-email">Email address</FieldLabel>
                      <Input id="invite-email" type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.currentTarget.value)} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="invite-role">Role</FieldLabel>
                      <select
                        id="invite-role"
                        className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        value={inviteRole}
                        onChange={(event) => setInviteRole(event.currentTarget.value as "owner" | "member")}
                      >
                        <option value="member">Member</option>
                        <option value="owner">Owner</option>
                      </select>
                    </Field>
                  </FieldGroup>
              </DialogFormContent>
            </Dialog>
          ) : undefined
        }
      />

      {isForbidden ? (
        <CalloutCard
          eyebrow="Owner scope"
          title="Owner permissions are required to manage members"
          description="Only owners can manage members. Signed-in members can still use project and token routes."
          tone="warning"
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Members</CardTitle>
              <CardDescription>Current members and roles.</CardDescription>
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
                      const isSelf = member.user_id === session?.user_id;
                      return (
                        <TableRow key={member.user_id}>
                          <TableCell className="font-medium">{member.email}</TableCell>
                          <TableCell>
                            <select
                              aria-label={`role for ${member.email}`}
                              className="rounded border border-border bg-background px-2 py-1 text-sm"
                              value={member.role}
                              disabled={isSelf}
                              onChange={(event) => void handleRoleChange(member.user_id, event.currentTarget.value as "owner" | "member")}
                            >
                              <option value="owner">owner</option>
                              <option value="member">member</option>
                            </select>
                          </TableCell>
                          <TableCell>{formatDate(member.created_at)}</TableCell>
                          <TableCell className="text-right">
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button type="button" variant="ghost" size="sm" disabled={isSelf}>Remove</Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Remove member</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This removes {member.email} from the organization immediately.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => void handleRemoveMember(member.user_id)}>Remove member</AlertDialogAction>
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
                              <Button type="button" variant="ghost" size="sm">Cancel</Button>
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
                                <AlertDialogAction onClick={() => void handleCancelInvite(invite.invite_id)}>Cancel invite</AlertDialogAction>
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
      )}
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

type ProjectSortField = "name" | "slug" | "environment_default" | "monthly_bundle_requests" | "monthly_raw_ingested_events";

export function sortProjects(projects: ProjectRecord[] | null, sort: SortState<ProjectSortField>): ProjectRecord[] {
  if (projects === null) {
    return [];
  }

  const sorted = [...projects].sort((left, right) => {
    switch (sort.field) {
      case "name":
        return left.name.localeCompare(right.name);
      case "slug":
        return left.slug.localeCompare(right.slug);
      case "environment_default":
        return left.environment_default.localeCompare(right.environment_default);
      case "monthly_bundle_requests":
        return left.metrics.monthly_bundle_requests - right.metrics.monthly_bundle_requests;
      case "monthly_raw_ingested_events":
        return left.metrics.monthly_raw_ingested_events - right.metrics.monthly_raw_ingested_events;
      default:
        return 0;
    }
  });

  return sort.direction === "asc" ? sorted : sorted.reverse();
}
