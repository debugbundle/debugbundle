import { forwardRef, type ComponentProps } from "react";
import type { LucideIcon } from "lucide-react";
import { Button } from "../ui/button.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip.js";

type TableActionButtonProps = Omit<
  ComponentProps<typeof Button>,
  "children" | "size" | "asChild"
> & {
  icon: LucideIcon;
  label: string;
};

/** Compact table actions retain keyboard labels and compose with confirmation triggers. */
export const TableActionButton = forwardRef<HTMLButtonElement, TableActionButtonProps>(
  function TableActionButton({ icon: Icon, label, variant = "ghost", ...props }, ref) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            {...props}
            ref={ref}
            type={props.type ?? "button"}
            variant={variant}
            size="icon-sm"
            aria-label={props["aria-label"] ?? label}
          >
            <Icon aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    );
  }
);
