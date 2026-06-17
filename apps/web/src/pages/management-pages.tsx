import { FolderIcon, KeyRoundIcon, PlusIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { CreateProjectDialog } from "../components/system/create-project-dialog.js";
import { PageHeader } from "../components/system/page-header.js";
import { PlaintextTokenReveal } from "../components/system/plaintext-token-reveal.js";
import { ProjectNameWithAccessIndicator } from "../components/system/project-name-with-access-indicator.js";
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
import { Textarea } from "../components/ui/textarea.js";
import { DialogFormContent } from "../components/system/dialog-form-content.js";
import {
  createProjectToken,
  isInvalidSessionError,
  listProjects,
  listProjectTokens,
  revokeProjectToken,
  type CreatedProjectToken,
  type ProjectRecord,
  type ProjectTokenRecord
} from "../lib/api.js";
import { showErrorToast, showSuccessToast } from "../lib/notify.js";
import { getProjectEffectiveRole } from "../lib/project-access.js";

export { BillingPage } from "./billing-page.js";

export function ProjectsPage(): JSX.Element {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectRecord[] | null>(null);
  const [sort, setSort] = useState<SortState<ProjectSortField>>({
    field: "name",
    direction: "asc"
  });
  const [isCreateOpen, setIsCreateOpen] = useState(false);

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

  return (
    <div className="space-y-8">
      <PageHeader
        description="Create and manage projects in this workspace."
        actions={
          <CreateProjectDialog
            open={isCreateOpen}
            onOpenChange={setIsCreateOpen}
            onCreated={(created) => {
              setProjects((current) => [...(current ?? []), created]);
            }}
            trigger={
              <Button type="button">
                <PlusIcon data-icon="inline-start" />
                Create project
              </Button>
            }
          />
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
                      <TableCell className="font-medium">
                        <ProjectNameWithAccessIndicator project={project} showColorTag />
                      </TableCell>
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
  const { projectId, project } = useOutletContext<ProjectContext>();
  const [tokens, setTokens] = useState<ProjectTokenRecord[] | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [allowedOriginsInput, setAllowedOriginsInput] = useState("");
  const [createdToken, setCreatedToken] = useState<CreatedProjectToken | null>(null);
  const effectiveRole = getProjectEffectiveRole(project);
  const canManageProjectTokens = effectiveRole === "owner" || effectiveRole === "admin";

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
      const allowedOrigins = parseAllowedOriginsInput(allowedOriginsInput);
      const created = await createProjectToken(resolvedProjectId, {
        label,
        ...(allowedOrigins.length === 0 ? {} : { allowed_origins: allowedOrigins })
      });
      setCreatedToken(created);
      setTokens((current) => [...(current ?? []), { ...created, plaintext: undefined }]);
      setLabel("");
      setAllowedOriginsInput("");
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
        {canManageProjectTokens ? (
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
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="project-token-label">Token label</FieldLabel>
                      <Input id="project-token-label" value={label} onChange={(event) => setLabel(event.currentTarget.value)} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="project-token-allowed-origins">Allowed browser origins for static-site tokens</FieldLabel>
                      <FieldDescription>
                        Leave empty for server-side SDKs and relay tokens.
                      </FieldDescription>
                      <Textarea
                        id="project-token-allowed-origins"
                        value={allowedOriginsInput}
                        onChange={(event) => setAllowedOriginsInput(event.currentTarget.value)}
                        placeholder={"https://www.example.com\nhttps://preview.example.com"}
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                      />
                    </Field>
                  </FieldGroup>
              </DialogFormContent>
            </Dialog>
        ) : null}
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
              description={
                canManageProjectTokens
                  ? "Create an ingestion token when you are ready to connect an SDK or environment-specific deploy flow to this project."
                  : "Project tokens are managed by project owners and admins."
              }
              {...(canManageProjectTokens
                ? {
                    actionLabel: "Create project token",
                    onAction: () => setIsCreateOpen(true)
                  }
                : {})}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last used</TableHead>
                    {canManageProjectTokens ? <TableHead className="text-right">Action</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens.map((token) => (
                  <TableRow key={token.token_id}>
                    <TableCell>
                      <div className="font-medium">{token.label}</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {formatProjectTokenAllowedOrigins(token.allowed_origins)}
                      </div>
                    </TableCell>
                    <TableCell>{formatDate(token.created_at)}</TableCell>
                    <TableCell>{token.last_used_at === null ? "Never" : formatDate(token.last_used_at)}</TableCell>
                    {canManageProjectTokens ? (
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
                    ) : null}
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

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

function parseAllowedOriginsInput(value: string): string[] {
  return value
    .split(/[\n,]+/)
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function formatProjectTokenAllowedOrigins(allowedOrigins: string[]): string {
  if (allowedOrigins.length === 0) {
    return "Browser origins: unrestricted";
  }

  return `Browser origins: ${allowedOrigins.join(", ")}`;
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
