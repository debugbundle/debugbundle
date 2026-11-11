import { MetadataSeparator } from "./metadata-separator.js";
import { ListChecksIcon, XIcon } from "lucide-react";
import { useDashboardSetup } from "./dashboard-setup-context.js";
import {
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar
} from "../ui/sidebar.js";

export function SidebarSetupProgress(): JSX.Element | null {
  const setup = useDashboardSetup();
  const { isMobile, setOpenMobile } = useSidebar();
  if (setup === null || setup.sidebarHidden || (!setup.loading && setup.progress.ready))
    return null;
  const count = `${setup.progress.completed} of ${setup.progress.total}`;
  function openGuide(): void {
    if (isMobile) setOpenMobile(false);
    // Let the mobile navigation release its focus trap before opening the guide.
    window.setTimeout(() => setup?.openGuide(), 0);
  }
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          data-dashboard-setup-trigger
          size="default"
          className="h-10 border border-sidebar-border bg-sidebar-accent/50 group-has-data-[sidebar=menu-action]/menu-item:pr-10 group-data-[collapsible=icon]:justify-center"
          tooltip="Setup guide"
          disabled={setup.loading}
          onClick={openGuide}
          aria-label={setup.loading ? "Checking setup…" : `Setup guide, ${count} complete`}
        >
          <ListChecksIcon />
          <div className="flex min-w-0 flex-1 items-center group-data-[collapsible=icon]:hidden">
            <span className="truncate">
              {setup.loading ? (
                "Checking setup…"
              ) : (
                <>
                  Setup guide
                  <MetadataSeparator />
                  <span className="text-muted-foreground">{count}</span>
                </>
              )}
            </span>
          </div>
        </SidebarMenuButton>
        <SidebarMenuAction
          className="top-1/2 right-2 -translate-y-1/2 peer-data-[size=default]/menu-button:top-1/2"
          aria-label="Dismiss setup reminder"
          title="Dismiss setup reminder"
          onClick={setup.dismissReminder}
        >
          <XIcon />
        </SidebarMenuAction>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
