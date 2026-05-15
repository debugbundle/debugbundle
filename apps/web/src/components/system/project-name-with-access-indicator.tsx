import { UsersRoundIcon } from "lucide-react";

import { isSharedProject, type AccessibleProjectRecord } from "../../lib/project-access.js";
import { cn } from "../../lib/utils.js";

export function ProjectNameWithAccessIndicator({
  project,
  className,
  name
}: {
  project: AccessibleProjectRecord;
  className?: string;
  name?: string;
}): JSX.Element {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span>{name ?? project.name}</span>
      {isSharedProject(project) ? (
        <span className="inline-flex items-center text-muted-foreground" aria-label="Shared project" title="Shared project">
          <UsersRoundIcon className="size-3.5" />
        </span>
      ) : null}
    </span>
  );
}
