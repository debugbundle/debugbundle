import { Link } from "react-router-dom";

import { cn } from "../../lib/utils.js";
import { BrandMark } from "./brand-mark.js";

interface BrandLockupProps {
  className?: string;
  href: string;
  imageClassName?: string;
  labelClassName?: string;
}

export function BrandLockup({ className, href, imageClassName, labelClassName }: BrandLockupProps): JSX.Element {
  return (
    <Link to={href} className={cn("flex items-center gap-2 font-medium transition-colors hover:text-foreground/80", className)}>
      <BrandMark className={cn("size-6", imageClassName)} />
      <span className={cn("font-semibold", labelClassName)}>DebugBundle</span>
    </Link>
  );
}
