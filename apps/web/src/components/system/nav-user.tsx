import {
  BookMarkedIcon,
  ChevronsUpDownIcon,
  CreditCardIcon,
  LogOutIcon,
  MoonIcon,
  SunIcon,
  UserIcon
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { resolveDocumentationUrl } from "../../lib/external-links.js";
import { useTheme } from "../../lib/theme.js";
import { UserAvatar } from "./user-avatar.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "../ui/dropdown-menu.js";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar
} from "../ui/sidebar.js";

interface NavUserProps {
  email: string;
  role: string;
  avatarUrl?: string | null;
  onSignOut: () => Promise<void>;
}

export function NavUser({ email, role, avatarUrl = null, onSignOut }: NavUserProps): JSX.Element {
  const { isMobile } = useSidebar();
  const navigate = useNavigate();
  const { resolvedTheme, setTheme } = useTheme();
  const documentationUrl = resolveDocumentationUrl();

  function handleToggleTheme(): void {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <UserAvatar email={email} avatarUrl={avatarUrl} className="size-8 rounded-lg" fallbackClassName="rounded-lg" />
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{email}</span>
                <span className="truncate text-xs text-muted-foreground">{role}</span>
              </div>
              <ChevronsUpDownIcon className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <UserAvatar email={email} avatarUrl={avatarUrl} className="size-8 rounded-lg" fallbackClassName="rounded-lg" />
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{email}</span>
                  <span className="truncate text-xs text-muted-foreground">{role}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem className="py-2" onSelect={() => { void navigate("/settings"); }}>
                <UserIcon />
                Account
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="py-2">
                <a href={documentationUrl} target="_blank" rel="noreferrer">
                  <BookMarkedIcon />
                  Documentation
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem className="py-2" onSelect={() => { void navigate("/billing"); }}>
                <CreditCardIcon />
                Billing
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="py-2" onSelect={handleToggleTheme}>
              {resolvedTheme === "dark" ? <SunIcon /> : <MoonIcon />}
              {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="py-2" onSelect={() => void onSignOut()}>
              <LogOutIcon />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
