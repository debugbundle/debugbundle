import type { ProjectColorTag } from "../../../../../packages/shared-types/src/index.js";
import { getProjectColorTagHex } from "../../lib/project-color-tags.js";
import { cn } from "../../lib/utils.js";

export function ProjectColorTagDot({
  colorTag,
  className
}: {
  colorTag: ProjectColorTag | null;
  className?: string;
}): JSX.Element {
  if (colorTag === null) {
    return (
      <span
        aria-hidden="true"
        data-project-color-tag="default"
        className={cn(
          "inline-flex size-3 shrink-0 rounded-full border border-background/70 bg-muted-foreground/45",
          className
        )}
      />
    );
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
