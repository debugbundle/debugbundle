import type { ReactNode } from "react";
import { ChevronRightIcon } from "lucide-react";
import { Button } from "../ui/button.js";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible.js";

/** Shared closed-by-default programme details; enrolment and operator actions
 * remain outside so opening or closing the policy never resets an input. */
export function OfferProgrammeDetails({ children }: { children: ReactNode }): JSX.Element {
  return (
    <Collapsible className="flex flex-col gap-4">
      <CollapsibleTrigger asChild>
        <Button type="button" variant="ghost" className="self-start">
          Programme details
          <ChevronRightIcon
            data-icon="inline-end"
            aria-hidden="true"
            className="transition-transform duration-200 group-data-[state=open]/button:rotate-90 motion-reduce:transition-none"
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-4">{children}</CollapsibleContent>
    </Collapsible>
  );
}
