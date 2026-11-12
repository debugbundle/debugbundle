import { hasBusinessEntitlement } from "../../../../../packages/shared-types/src/tier-capabilities.js";
import {
  CreditCardIcon,
  BarChart3Icon,
  FolderKanbanIcon,
  FileTextIcon,
  HeartPulseIcon,
  HomeIcon,
  KeySquareIcon,
  SparklesIcon,
  SirenIcon
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useId } from "react";

import type { SessionRecord } from "../../lib/api.js";
import { BrandLockup } from "./brand-lockup.js";
import { NavUser } from "./nav-user.js";
import { SidebarSetupProgress } from "./sidebar-setup-progress.js";
import { useDashboardSetup } from "./dashboard-setup-context.js";
import { OrganizationSwitcher } from "./organization-switcher.js";
import { useWorkspaceHealthAlert } from "./workspace-health-alert-context.js";
import { Badge } from "../ui/badge.js";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar
} from "../ui/sidebar.js";

const navMain = [
  { to: "/dashboard", label: "Dashboard", icon: HomeIcon },
  { to: "/incidents", label: "Incidents", icon: SirenIcon },
  { to: "/improvements", label: "Improvements", icon: SparklesIcon },
  { to: "/health-status", label: "Health Status", icon: HeartPulseIcon },
  { to: "/projects", label: "Projects", icon: FolderKanbanIcon },
  { to: "/analytics/workspace", label: "Analytics", icon: BarChart3Icon },
  { to: "/reports", label: "Reports", icon: FileTextIcon },
  { to: "/billing", label: "Billing", icon: CreditCardIcon },
  { to: "/access-tokens", label: "Access tokens", icon: KeySquareIcon }
] as const;
const healthAlertLabel = "A health check is currently down";

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  session: SessionRecord;
  onSignOut: () => Promise<void>;
}

export function AppSidebar({ session, onSignOut, ...props }: AppSidebarProps): JSX.Element {
  const location = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  const setup = useDashboardSetup();
  const healthAlert = useWorkspaceHealthAlert();
  const healthAlertId = useId();

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:!p-1.5 group-data-[collapsible=icon]:!p-1.5"
            >
              <BrandLockup
                href="/dashboard"
                imageClassName="size-5"
                labelClassName="text-base font-semibold"
              />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <OrganizationSwitcher />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-2">
              {navMain.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    asChild
                    isActive={
                      location.pathname === item.to || location.pathname.startsWith(item.to + "/")
                    }
                    tooltip={
                      item.to === "/health-status" && healthAlert?.down
                        ? "Health Status — a health check is currently down"
                        : item.label
                    }
                    className={
                      item.to === "/health-status" && healthAlert?.down ? "pr-10" : undefined
                    }
                  >
                    <NavLink
                      to={item.to}
                      aria-describedby={
                        item.to === "/health-status" && healthAlert?.down
                          ? healthAlertId
                          : undefined
                      }
                      onClick={() => {
                        if (isMobile) {
                          setOpenMobile(false);
                        }
                      }}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </NavLink>
                  </SidebarMenuButton>
                  {item.to === "/health-status" && healthAlert?.down === true ? (
                    <SidebarMenuBadge
                      id={healthAlertId}
                      role="status"
                      aria-label={healthAlertLabel}
                    >
                      <span className="sr-only">{healthAlertLabel}</span>
                      <Badge variant="destructive" className="size-5 p-0" aria-hidden="true">
                        !
                      </Badge>
                    </SidebarMenuBadge>
                  ) : null}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="gap-4">
        <SidebarSetupProgress />
        <NavUser
          email={session.email}
          role={session.role}
          avatarUrl={session.avatar_url}
          onSignOut={onSignOut}
          onOpenSetup={setup?.openGuide}
          canManagePeople={
            hasBusinessEntitlement(session.organization_plan, session.self_hosted) &&
            (session.role === "owner" || session.role === "admin")
          }
        />
      </SidebarFooter>
    </Sidebar>
  );
}
