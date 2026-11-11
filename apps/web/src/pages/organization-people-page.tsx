import { MetadataSeparator } from "../components/system/metadata-separator.js";
import { PencilIcon, PlusIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { ResourceEmptyState } from "../components/system/resource-empty-state.js";
import { hasBusinessEntitlement } from "../../../../packages/shared-types/src/tier-capabilities.js";
import { useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import type {
  OrganizationInvite,
  OrganizationPerson
} from "../../../../packages/shared-types/src/index.js";
import type { PendingOwnershipTransfer } from "../../../../packages/organization-client/src/index.js";
import { CalloutCard } from "../components/system/callout-card.js";
import { OrganizationPersonEditor } from "../components/system/organization-person-editor.js";
import { OrganizationPendingInvites } from "../components/system/organization-pending-invites.js";
import { OrganizationOwnershipCard } from "../components/system/organization-ownership-card.js";
import { PageHeader } from "../components/system/page-header.js";
import { PendingButton } from "../components/system/pending-button.js";
import { TableActionButton } from "../components/system/table-action-button.js";
import { Button } from "../components/ui/button.js";
import { Badge } from "../components/ui/badge.js";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.js";
import { FieldError } from "../components/ui/field.js";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../components/ui/input-group.js";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "../components/ui/alert-dialog.js";
import { listProjects, type ProjectRecord } from "../lib/api.js";
import { organizationApi } from "../lib/organization-api.js";
import { usePendingAction } from "../lib/use-pending-action.js";
import { useSession } from "../lib/session.js";

export function OrganizationPeoplePage(): JSX.Element {
  const { session } = useSession();
  const org = session?.organization_id;
  const allowed =
    session !== null &&
    hasBusinessEntitlement(session?.organization_plan, session?.self_hosted) &&
    (session.role === "owner" || session.role === "admin");
  const [people, setPeople] = useState<OrganizationPerson[] | null>(null);
  const [invites, setInvites] = useState<OrganizationInvite[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [transfer, setTransfer] = useState<PendingOwnershipTransfer | null>(null);
  const [editor, setEditor] = useState<OrganizationPerson | "invite" | null>(null);
  const [removal, setRemoval] = useState<OrganizationPerson | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [pendingInvite, setPendingInvite] = useState<{
    inviteId: string;
    kind: "resend" | "cancel";
  } | null>(null);
  const { pending, run } = usePendingAction();
  const generation = useRef(0);
  const reload = (): void => setRevision((value) => value + 1);
  useEffect(() => {
    const request = ++generation.current;
    if (!allowed || org === undefined) return;
    setLoadError(false);
    void Promise.all([
      organizationApi.people(org),
      organizationApi.invites(org),
      listProjects(),
      session.role === "owner" ? organizationApi.transfer(org) : Promise.resolve(null)
    ])
      .then(([nextPeople, nextInvites, nextProjects, nextTransfer]) => {
        if (generation.current !== request) return;
        setPeople(nextPeople);
        setInvites(nextInvites);
        setProjects(nextProjects.filter((project) => project.organization_id === org));
        setTransfer(nextTransfer);
      })
      .catch(() => {
        if (generation.current === request) setLoadError(true);
      });
    return () => {
      generation.current++;
    };
  }, [allowed, org, session?.role, revision]);
  if (session === null) return <Navigate replace to="/login" />;
  if (!allowed)
    return (
      <CalloutCard
        eyebrow="People"
        title="Organisation management"
        description="Business Owner or Admin access is required to manage people."
        tone="neutral"
      />
    );

  const matches = (people ?? []).filter((person) =>
    person.email.toLowerCase().includes(query.trim().toLowerCase())
  );
  const currentPage = Math.min(page, Math.max(0, Math.ceil(matches.length / 25) - 1));
  function change(
    action: () => Promise<unknown>,
    success?: () => void,
    invitation: typeof pendingInvite = null
  ): void {
    void run(async () => {
      setError(null);
      setPendingInvite(invitation);
      try {
        await action();
        success?.();
        reload();
      } catch {
        setError("Could not complete the change. Check your current access and try again.");
      } finally {
        setPendingInvite(null);
      }
    });
  }
  function canEdit(person: OrganizationPerson): boolean {
    return (
      person.role !== "owner" &&
      (session?.role === "owner" || (person.role !== "admin" && person.grants_paused_at === null))
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="Manage organisation access and direct collaborators together. The account supports up to 1,000 unique people, including the Owner and pending invitations."
        actions={
          <Button disabled={people === null || loadError} onClick={() => setEditor("invite")}>
            <PlusIcon data-icon="inline-start" />
            Invite person
          </Button>
        }
      />
      {loadError ? (
        <CalloutCard
          eyebrow="Could not load"
          title="Current access could not be refreshed"
          description="Retry before changing access; any previous list may be out of date."
          tone="warning"
        >
          <Button variant="outline" onClick={reload}>
            Retry
          </Button>
        </CalloutCard>
      ) : null}
      {error !== null && removal === null ? (
        <CalloutCard
          eyebrow="Change failed"
          title="Please try again"
          description={error}
          tone="warning"
        />
      ) : null}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="shrink-0">People ({people?.length ?? "…"})</CardTitle>
          <InputGroup className="w-64 max-w-full">
            <InputGroupInput
              id="organization-people-search"
              type="search"
              aria-label="Search a person"
              placeholder="Search a person..."
              value={query}
              onChange={(event) => {
                setQuery(event.currentTarget.value);
                setPage(0);
              }}
            />
            <InputGroupAddon align="inline-end">
              <SearchIcon aria-hidden="true" />
            </InputGroupAddon>
          </InputGroup>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {people === null ? (
            <Skeleton className="h-24 w-full" />
          ) : matches.length === 0 ? (
            <ResourceEmptyState
              icon={SearchIcon}
              title="No matching people"
              description="Try a different email address."
            />
          ) : (
            <Table>
              <TableHeader className="hidden md:table-header-group">
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead>Access sources</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matches.slice(currentPage * 25, currentPage * 25 + 25).map((person) => (
                  <TableRow key={person.user_id} className="grid gap-2 p-4 md:table-row md:p-0">
                    <TableCell className="break-all">{person.email}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span>
                          {person.role === null ? (
                            "Direct collaborator"
                          ) : person.role === "owner" ? (
                            "Owner"
                          ) : person.role === "admin" ? (
                            <>
                              Admin
                              <MetadataSeparator />
                              all current and future projects
                            </>
                          ) : (
                            <>
                              Member
                              <MetadataSeparator />
                              {person.project_access === "all"
                                ? `${person.default_project_role} on current and future projects`
                                : "selected projects"}
                            </>
                          )}
                        </span>
                        <span>
                          {person.direct_project_count} direct project{" "}
                          {person.direct_project_count === 1 ? "role" : "roles"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={person.suspended_at !== null ? "warning" : "outline"}>
                        {person.suspended_at !== null
                          ? "Suspended"
                          : person.grants_paused_at !== null
                            ? "Inherited access paused"
                            : "Active"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        {canEdit(person) ? (
                          <>
                            <TableActionButton
                              label="Edit access"
                              icon={PencilIcon}
                              aria-label={`Edit ${person.email}`}
                              disabled={pending || loadError}
                              onClick={() => setEditor(person)}
                            />
                            <TableActionButton
                              label="Remove access"
                              icon={Trash2Icon}
                              aria-label={`Remove ${person.email}`}
                              disabled={pending || loadError}
                              onClick={() => {
                                setError(null);
                                setRemoval(person);
                              }}
                            />
                          </>
                        ) : (
                          <span>
                            {person.role === "owner"
                              ? "Owner"
                              : person.grants_paused_at !== null
                                ? "Owner review required"
                                : "Owner manages Admins"}
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {matches.length > 25 ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                variant="outline"
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                Previous people
              </Button>
              <span>
                Page {currentPage + 1} of {Math.ceil(matches.length / 25)}
              </span>
              <Button
                variant="outline"
                disabled={(currentPage + 1) * 25 >= matches.length}
                onClick={() => setPage(currentPage + 1)}
              >
                Next people
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
      <OrganizationPendingInvites
        invites={invites}
        canManageAdmin={session.role === "owner"}
        pending={pending}
        pendingAction={pendingInvite}
        onResend={(id) =>
          change(() => organizationApi.resend(session.organization_id, id), undefined, {
            inviteId: id,
            kind: "resend"
          })
        }
        onCancel={(id) =>
          change(() => organizationApi.cancelInvite(session.organization_id, id), undefined, {
            inviteId: id,
            kind: "cancel"
          })
        }
      />
      {session.role === "owner" && people !== null ? (
        <OrganizationOwnershipCard
          organizationId={session.organization_id}
          people={people}
          transfer={transfer}
          verified={session.email_verified_at !== null}
          onSaved={reload}
        />
      ) : null}
      {editor === null ? null : (
        <OrganizationPersonEditor
          organizationId={session.organization_id}
          person={editor === "invite" ? null : editor}
          projects={projects}
          canAppointAdmin={session.role === "owner"}
          onClose={() => setEditor(null)}
          onSaved={reload}
        />
      )}
      <AlertDialog
        open={removal !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setRemoval(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove organisation access?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove {removal?.email} from this organisation and all its direct projects. Pending
              invitations addressed to or issued by them and organisation credentials are revoked.
              Their identity and other organisations are retained.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error === null ? null : <FieldError>{error}</FieldError>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Keep access</AlertDialogCancel>
            <AlertDialogAction asChild>
              <PendingButton
                variant="destructive"
                pending={pending}
                pendingLabel="Removing…"
                onClick={(event) => {
                  event.preventDefault();
                  if (removal !== null)
                    change(
                      () => organizationApi.remove(session.organization_id, removal.user_id),
                      () => setRemoval(null)
                    );
                }}
              >
                Remove access
              </PendingButton>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
