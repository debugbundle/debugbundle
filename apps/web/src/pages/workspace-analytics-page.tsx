import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { PageHeader } from "../components/system/page-header.js";
import { WorkspaceAnalyticsBundles } from "../components/system/workspace-analytics-bundles.js";
import { WorkspaceAnalyticsOpportunities } from "../components/system/workspace-analytics-opportunities.js";
import { Notice } from "../components/ui/notice.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs.js";
import { listProjects, type ProjectRecord } from "../lib/api.js";

export function WorkspaceAnalyticsPage(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectRecord[] | null>(null);
  const [projectsUnavailable, setProjectsUnavailable] = useState(false);
  const activeView = location.pathname.endsWith("/bundles") ? "bundles" : "opportunities";

  useEffect(() => {
    let active = true;
    void listProjects()
      .then((response) => {
        if (active) setProjects(response);
      })
      .catch(() => {
        if (active) {
          setProjects([]);
          setProjectsUnavailable(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader description="Cross-project product-usage opportunities and generated AnalyticsBundles for this workspace." />
      <Tabs
        value={activeView}
        onValueChange={(value) => {
          void navigate(value === "bundles" ? "/analytics/workspace/bundles" : "/analytics/workspace");
        }}
      >
        <TabsList variant="line" aria-label="Workspace analytics views">
          <TabsTrigger value="opportunities">Opportunities</TabsTrigger>
          <TabsTrigger value="bundles">Bundles</TabsTrigger>
        </TabsList>
      </Tabs>

      {projectsUnavailable ? (
        <Notice title="Project filter unavailable" tone="warning">
          Analytics inventory data is still available, but project names could not be loaded for
          the filter control.
        </Notice>
      ) : null}

      {projects === null ? (
        <div className="flex flex-col gap-3" aria-label="Loading workspace analytics">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : activeView === "bundles" ? (
        <WorkspaceAnalyticsBundles projects={projects} />
      ) : (
        <WorkspaceAnalyticsOpportunities projects={projects} />
      )}
    </div>
  );
}
