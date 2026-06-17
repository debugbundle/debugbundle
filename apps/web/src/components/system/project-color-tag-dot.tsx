import type { ProjectColorTag } from "../../../../../packages/shared-types/src/index.js";
import { getProjectColorTagHex } from "../../lib/project-color-tags.js";
import { cn } from "../../lib/utils.js";

export function ProjectColorTagDot({
  colorTag,
  className
}: {
  colorTag: ProjectColorTag | null;
  className?: string;
}): JSX.Element | null {
  if (colorTag === null) {
    return null;
  }

  return (
    <span
      aria-hidden="true"
      data-project-color-tag={colorTag}
      className={cn("inline-flex size-3 shrink-0 rounded-full border border-background/70", className)}
      style={{ backgroundColor: getProjectColorTagHex(colorTag) }}
    />
  );
}
