import { Link, useLocation } from "react-router-dom";

import { ProjectNameWithAccessIndicator } from "./project-name-with-access-indicator.js";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from "../ui/breadcrumb.js";
import { useProjectRoute } from "./project-route-context.js";
import { Separator } from "../ui/separator.js";
import { SidebarTrigger } from "../ui/sidebar.js";

const routeTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/incidents": "Incidents",
  "/improvements": "Improvements",
  "/projects": "Projects",
  "/billing": "Billing",
  "/member-tokens": "Member Tokens",
  "/settings": "Settings"
};

function resolveTitle(pathname: string): string {
  if (routeTitles[pathname] !== undefined) {
    return routeTitles[pathname];
  }

  // /incidents/:id
  if (/^\/incidents\/[^/]+$/.test(pathname)) return "Incident";
  if (/^\/projects\/[^/]+\/improvements\/[^/]+$/.test(pathname)) return "Improvement";

  return "DebugBundle";
}

const projectTabLabels: Record<string, string> = {
  members: "Members",
  settings: "Settings",
  tokens: "Tokens",
  alerts: "Alerts",
  webhooks: "Webhooks",
  github: "GitHub",
  incidents: "Incidents",
  improvements: "Improvements",
  bundles: "Bundles"
};

function resolveProjectTab(pathname: string): string {
  const segments = pathname.split("/");
  // /projects/:id/tab → segments = ["", "projects", ":id", "tab"]
  const tab = segments[3];
  if (tab !== undefined) {
    return projectTabLabels[tab] ?? "Overview";
  }
  return "Overview";
}

export function SiteHeader(): JSX.Element {
  const location = useLocation();
  const isProjectRoute = /^\/projects\/[^/]+/.test(location.pathname);
  const { activeProject } = useProjectRoute();

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
      <div className="flex items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 self-center! h-4!" />
        {isProjectRoute ? (
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/projects">Projects</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>
                  {activeProject === null ? (
                    "Project"
                  ) : (
                    <ProjectNameWithAccessIndicator
                      project={{
                        project_id: activeProject.projectId,
                        organization_id: "",
                        name: activeProject.projectName,
                        slug: "",
                        environment_default: "",
                        organization_plan: "team",
                        metrics: {
                          monthly_bundle_requests: 0,
                          monthly_raw_ingested_events: 0,
                          retained_bundles: 0,
                          monthly_alert_deliveries: 0
                        },
                        created_at: "",
                        updated_at: "",
                        relationship: activeProject.relationship
                      }}
                    />
                  )}
                </BreadcrumbPage>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{resolveProjectTab(location.pathname)}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        ) : (
          <h1 className="m-0 text-base font-medium leading-none">{resolveTitle(location.pathname)}</h1>
        )}
      </div>
    </header>
  );
}
