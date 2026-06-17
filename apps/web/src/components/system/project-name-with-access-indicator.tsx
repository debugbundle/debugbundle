import { UsersRoundIcon } from "lucide-react";

import {
  getProjectSharingState,
  isSharedProject,
  type AccessibleProjectRecord
} from "../../lib/project-access.js";
import { cn } from "../../lib/utils.js";
import { ProjectColorTagDot } from "./project-color-tag-dot.js";

export function ProjectNameWithAccessIndicator({
  project,
  className,
  name,
  showColorTag = false
}: {
  project: AccessibleProjectRecord;
  className?: string;
  name?: string;
  showColorTag?: boolean;
}): JSX.Element {
  const sharingState = getProjectSharingState(project);
  const sharedProjectLabel = sharingState === "shared_by_you" ? "Shared by you" : "Shared project";

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      {showColorTag ? <ProjectColorTagDot colorTag={project.color_tag} /> : null}
      <span>{name ?? project.name}</span>
      {isSharedProject(project) ? (
        <span className="inline-flex items-center text-muted-foreground" aria-label={sharedProjectLabel} title={sharedProjectLabel}>
          <UsersRoundIcon className="size-3.5" />
        </span>
      ) : null}
    </span>
  );
}
