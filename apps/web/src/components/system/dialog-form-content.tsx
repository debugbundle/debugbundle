import type * as React from "react";
import { XIcon } from "lucide-react";

import { cn } from "../../lib/utils.js";
import { Button } from "../ui/button.js";
import { DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog.js";

export interface DialogFormContentProps extends React.ComponentProps<"form"> {
  title: string;
  description?: string;
  footer: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}

export function DialogFormContent({
  title,
  description,
  footer,
  size = "md",
  className,
  children,
  ...props
}: DialogFormContentProps): JSX.Element {
  return (
    <DialogContent
      size={size}
      padding="none"
      showCloseButton={false}
      className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden"
    >
      <DialogHeader className="shrink-0 border-b bg-muted/50 px-6 pt-6 pb-4">
        <div className="flex items-start justify-between gap-4">
          <DialogTitle>{title}</DialogTitle>
          <DialogClose asChild>
            <Button variant="ghost" className="-mr-2 -mt-2 shrink-0" size="icon-sm">
              <XIcon />
              <span className="sr-only">Close</span>
            </Button>
          </DialogClose>
        </div>
        {description === undefined ? null : <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>
      <form className={cn("flex min-h-0 flex-1 flex-col", className)} {...props}>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-6 pb-6">
          <div className="flex flex-col gap-6">{children}</div>
        </div>
        <DialogFooter className="mt-0 shrink-0 items-center !mx-0 !mb-0 px-6 py-4">{footer}</DialogFooter>
      </form>
    </DialogContent>
  );
}
