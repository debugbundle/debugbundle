import { CheckIcon, XIcon } from "lucide-react";
import type { ProjectColorTag } from "../../../../../packages/shared-types/src/index.js";
import { PROJECT_COLOR_TAG_OPTIONS } from "../../lib/project-color-tags.js";
import { cn } from "../../lib/utils.js";
import { Button } from "../ui/button.js";

export function ProjectColorTagPicker({
  value,
  onChange,
  disabled = false
}: {
  value: ProjectColorTag | null;
  onChange: (value: ProjectColorTag | null) => void;
  disabled?: boolean;
}): JSX.Element {
  function renderColorButton(option: (typeof PROJECT_COLOR_TAG_OPTIONS)[number]): JSX.Element {
    const isSelected = value === option.value;

    return (
      <Button
        key={option.value}
        type="button"
        variant="outline"
        size="icon-sm"
        aria-pressed={isSelected}
        aria-label={`Set color tag to ${option.label}`}
        className={cn(
          "relative rounded-full border-border/80 bg-background hover:bg-muted",
          isSelected && "border-foreground shadow-sm"
        )}
        disabled={disabled}
        onClick={() => onChange(option.value)}
      >
        <span
          aria-hidden="true"
          className="size-5 rounded-full border border-background/70"
          style={{ backgroundColor: option.hex }}
        />
        {isSelected ? (
          <span className="absolute -right-0.5 -top-0.5 rounded-full bg-foreground text-background">
            <CheckIcon className="size-3" />
          </span>
        ) : null}
      </Button>
    );
  }

  function renderClearButton(): JSX.Element {
    return (
      <Button
        key="clear"
        type="button"
        variant="outline"
        size="icon-sm"
        aria-pressed={value === null}
        aria-label="Clear color tag"
        className={cn(
          "rounded-full border-border/80 bg-background text-muted-foreground hover:bg-muted",
          value === null && "border-foreground text-foreground shadow-sm"
        )}
        disabled={disabled}
        onClick={() => onChange(null)}
      >
        <XIcon className="size-3.5" />
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap gap-y-1 gap-x-2" data-project-color-tag-picker="true">
      {PROJECT_COLOR_TAG_OPTIONS.map((option, index) => (
        <div key={option.value} className="contents">
          {renderColorButton(option)}
          {index === 9 ? <span aria-hidden="true" className="hidden basis-full sm:block" /> : null}
        </div>
      ))}
      {renderClearButton()}
    </div>
  );
}
