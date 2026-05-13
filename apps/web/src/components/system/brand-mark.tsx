import { cn } from "../../lib/utils.js";

interface BrandMarkProps {
  className?: string;
}

export function BrandMark({ className }: BrandMarkProps): JSX.Element {
  return <img src="/favicon.svg" alt="" aria-hidden="true" className={cn("shrink-0", className)} />;
}
