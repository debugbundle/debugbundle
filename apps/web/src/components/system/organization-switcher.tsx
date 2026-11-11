import { MetadataSeparator } from "./metadata-separator.js";
import { useEffect, useState } from "react";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { OrganizationSummary } from "../../../../../packages/shared-types/src/index.js";
import { organizationApi } from "../../lib/organization-api.js";
import { useSession } from "../../lib/session.js";
import { usePendingAction } from "../../lib/use-pending-action.js";
import { showErrorToast } from "../../lib/notify.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from "../ui/dropdown-menu.js";
import { SidebarMenu, SidebarMenuItem, SidebarMenuButton } from "../ui/sidebar.js";

export function OrganizationSwitcher(): JSX.Element | null {
  const { session, refreshSession, setSession } = useSession();
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const [open, setOpen] = useState(false);
  const { pending, run } = usePendingAction();
  const navigate = useNavigate();
  const currentId = session?.organization_id;
  useEffect(() => {
    let active = true;
    setFailed(false);
    void organizationApi
      .list()
      .then((value) => {
        if (active) setOrganizations(value);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [currentId, revision, session?.user_id]);
  useEffect(() => {
    const refresh = (): void => setRevision((value) => value + 1);
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  if (session === null || organizations.length < 2) return null;
  const current = organizations.find((organization) => organization.organization_id === currentId);
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (next) setRevision((value) => value + 1);
          }}
        >
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              disabled={pending}
              aria-label={`Workspace: ${current?.name ?? "current workspace"}, ${session.role}`}
            >
              <span className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                <span className="truncate">{current?.name ?? "Workspace"}</span>
                <span className="truncate text-xs text-muted-foreground">{session.role}</span>
              </span>
              <ChevronsUpDownIcon />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
          >
            <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
            <DropdownMenuGroup>
              {organizations.map((organization) => (
                <DropdownMenuItem
                  key={organization.organization_id}
                  disabled={pending}
                  onSelect={() => {
                    if (organization.organization_id === currentId) return;
                    setOpen(false);
                    void run(async () => {
                      try {
                        await organizationApi.switch(organization.organization_id);
                      } catch {
                        showErrorToast(
                          "Could not switch workspace. Your current workspace is still selected."
                        );
                        return;
                      }
                      try {
                        const next = await refreshSession();
                        if (next?.organization_id !== organization.organization_id)
                          throw new Error("workspace_not_refreshed");
                        void navigate("/projects", { replace: true });
                      } catch {
                        // The server may already have switched context. Clear the old UI
                        // instead of presenting cached billing/management data as current.
                        setSession(null);
                        void navigate("/login", { replace: true });
                        showErrorToast("Workspace changed. Sign in again to refresh your session.");
                      }
                    });
                  }}
                >
                  <span className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                    <span className="truncate">{organization.name}</span>
                    <span className="text-xs text-muted-foreground">{organization.role}</span>
                  </span>
                  {organization.organization_id === currentId ? (
                    <CheckIcon aria-label="Current workspace" />
                  ) : null}
                </DropdownMenuItem>
              ))}
              {failed ? (
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    setRevision((value) => value + 1);
                  }}
                >
                  Could not load workspaces
                  <MetadataSeparator />
                  retry
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
