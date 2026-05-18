import {
  CreditCardIcon,
  FolderKanbanIcon,
  HomeIcon,
  KeySquareIcon,
  SparklesIcon,
  SirenIcon,
  UsersRoundIcon
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";

import type { SessionRecord } from "../../lib/api.js";
import { BrandLockup } from "./brand-lockup.js";
import { NavUser } from "./nav-user.js";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from "../ui/sidebar.js";

const navMain = [
  { to: "/dashboard", label: "Dashboard", icon: HomeIcon },
  { to: "/incidents", label: "Incidents", icon: SirenIcon },
  { to: "/improvements", label: "Improvements", icon: SparklesIcon },
  { to: "/projects", label: "Projects", icon: FolderKanbanIcon },
  { to: "/billing", label: "Billing", icon: CreditCardIcon },
  { to: "/member-tokens", label: "Member tokens", icon: KeySquareIcon }
] as const;

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  session: SessionRecord;
  onSignOut: () => Promise<void>;
}

export function AppSidebar({ session, onSignOut, ...props }: AppSidebarProps): JSX.Element {
  const location = useLocation();
  const navigationItems =
    session.organization_plan === "team"
      ? [...navMain.slice(0, 3), { to: "/organization", label: "Organization", icon: UsersRoundIcon }, ...navMain.slice(3)]
      : navMain;

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:!p-1.5 group-data-[collapsible=icon]:!p-1.5">
              <BrandLockup href="/dashboard" imageClassName="size-5" labelClassName="text-base font-semibold" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-2">
              {navigationItems.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === item.to || location.pathname.startsWith(item.to + "/")}
                    tooltip={item.label}
                  >
                    <NavLink to={item.to}>
                      <item.icon />
                      <span>{item.label}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <NavUser
          email={session.email}
          role={session.role}
          avatarUrl={session.avatar_url}
          onSignOut={onSignOut}
        />
      </SidebarFooter>
    </Sidebar>
  );
}
