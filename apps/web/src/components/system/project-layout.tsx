import { useEffect, useState } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";

import { CalloutCard } from "./callout-card.js";
import { useProjectRoute } from "./project-route-context.js";
import { Button } from "../ui/button.js";
import { Skeleton } from "../ui/skeleton.js";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs.js";
import { listProjects, type ProjectRecord } from "../../lib/api.js";
import { getProjectRelationship } from "../../lib/project-access.js";

const PROJECT_TABS = [
  { value: "overview", label: "Overview", suffix: "" },
  { value: "incidents", label: "Incidents", suffix: "/incidents" },
  { value: "bundles", label: "Bundles", suffix: "/bundles" },
  { value: "alerts", label: "Alerts", suffix: "/alerts" },
  { value: "webhooks", label: "Webhooks", suffix: "/webhooks" },
  { value: "github", label: "GitHub", suffix: "/github" },
  { value: "tokens", label: "Tokens", suffix: "/tokens" },
  { value: "members", label: "Members", suffix: "/members" },
  { value: "settings", label: "Settings", suffix: "/settings" },
] as const;

export type ProjectTab = (typeof PROJECT_TABS)[number]["value"];

function resolveActiveTab(pathname: string): ProjectTab {
  for (const tab of PROJECT_TABS) {
    if (tab.suffix !== "" && pathname.includes(`${tab.suffix}/`)) {
      return tab.value;
    }

    if (tab.suffix !== "" && pathname.endsWith(tab.suffix)) {
      return tab.value;
    }
  }
  return "overview";
}

export interface ProjectContext {
  project: ProjectRecord;
  projectId: string;
  onProjectUpdated: (project: ProjectRecord) => void;
}

export function ProjectLayout(): JSX.Element {
  const { projectId } = useParams<{ projectId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { setActiveProject } = useProjectRoute();
  const [project, setProject] = useState<ProjectRecord | null | undefined>(undefined);

  const activeTab = resolveActiveTab(location.pathname);

  useEffect(() => {
    if (projectId === undefined) return;

    setProject(undefined);
    setActiveProject(null);

    void (async () => {
      const projects = await listProjects();
      setProject(projects.find((c) => c.project_id === projectId) ?? null);
    })();
  }, [projectId, setActiveProject]);

  useEffect(() => {
    if (projectId === undefined || project === null || project === undefined) {
      return;
    }

    setActiveProject({
      projectId,
      projectName: project.name,
      relationship: getProjectRelationship(project)
    });

    return () => {
      setActiveProject((current) => {
        if (current?.projectId !== projectId) {
          return current;
        }

        return null;
      });
    };
  }, [project, projectId, setActiveProject]);

  function handleProjectUpdated(nextProject: ProjectRecord): void {
    setProject(nextProject);
    setActiveProject({
      projectId: nextProject.project_id,
      projectName: nextProject.name,
      relationship: getProjectRelationship(nextProject)
    });
  }

  if (projectId === undefined) {
    return <Navigate replace to="/projects" />;
  }

  function handleTabChange(value: string): void {
    const tab = PROJECT_TABS.find((t) => t.value === value);
    if (tab === undefined) return;
    void navigate(`/projects/${projectId}${tab.suffix}`);
  }

  if (project === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-44 w-full" />
      </div>
    );
  }

  if (project === null) {
    return (
      <CalloutCard
        eyebrow="Project not found"
        title="This project is not available in the current workspace"
        description="Return to the projects inventory and choose a project that is visible to the signed-in account."
        tone="warning"
      >
        <Button asChild type="button" variant="outline">
          <Link to="/projects">Back to projects</Link>
        </Button>
      </CalloutCard>
    );
  }

  return (
    <div className="min-w-0 space-y-6">
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          {PROJECT_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Outlet context={{ project, projectId, onProjectUpdated: handleProjectUpdated } satisfies ProjectContext} />
    </div>
  );
}
