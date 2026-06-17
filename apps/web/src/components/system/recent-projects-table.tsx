import { FolderIcon, PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card.js";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../ui/empty.js";
import { Skeleton } from "../ui/skeleton.js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table.js";
import { ProjectNameWithAccessIndicator } from "./project-name-with-access-indicator.js";
import { listProjects, type ProjectRecord } from "../../lib/api.js";
import { useDelayedVisibility } from "../../lib/use-delayed-visibility.js";

export function RecentProjectsTable(): JSX.Element {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectRecord[] | null>(null);
  const showProjectsLoading = useDelayedVisibility(projects === null);

  useEffect(() => {
    void (async () => {
      try {
        const data = await listProjects();
        setProjects(data);
      } catch {
        setProjects([]);
      }
    })();
  }, []);

  return (
    <div>
      <Card>
        <CardHeader>
          <CardTitle>Projects</CardTitle>
        </CardHeader>
        <CardContent>
          {projects === null ? (
            showProjectsLoading ? (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : null
          ) : projects.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FolderIcon />
                </EmptyMedia>
                <EmptyTitle>No projects yet</EmptyTitle>
                <EmptyDescription>
                  You haven't created any projects yet. Create one to start collecting debug data.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button asChild>
                  <Link to="/projects">
                    <PlusIcon data-icon="inline-start" />
                    Create project
                  </Link>
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Environment</TableHead>
                  <TableHead>Open incidents</TableHead>
                  <TableHead>New today</TableHead>
                  <TableHead>Opened this month</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((project) => (
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
                    <TableCell className="text-muted-foreground">{project.slug}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{project.environment_default}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{project.metrics.open_incidents.toLocaleString()}</TableCell>
                    <TableCell className="text-muted-foreground">{project.metrics.opened_incidents_today.toLocaleString()}</TableCell>
                    <TableCell className="text-muted-foreground">{project.metrics.opened_incidents_month.toLocaleString()}</TableCell>
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
