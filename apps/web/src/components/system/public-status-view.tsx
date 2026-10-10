import { useState } from "react";
import type { PublicStatusPage } from "../../../../../packages/shared-types/src/public-status.js";
import { HealthStatusProjectRow } from "./health-status-view.js";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card.js";

export function PublicStatusPageView({ page }: { page: PublicStatusPage }): JSX.Element {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  return (
    <Card>
      <CardHeader>
        <CardTitle>Health status</CardTitle>
        <p className="text-sm text-muted-foreground">30-day retained history</p>
      </CardHeader>
      <CardContent>
        {page.projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No published health checks are available.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {page.projects.map((project) => (
              <HealthStatusProjectRow
                key={project.key}
                project={project}
                showVerifiedAt
                expanded={expanded.has(project.key)}
                onToggle={() =>
                  setExpanded((current) => {
                    const next = new Set(current);
                    if (next.has(project.key)) next.delete(project.key);
                    else next.add(project.key);
                    return next;
                  })
                }
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
