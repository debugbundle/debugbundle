import type { ComponentProps, ReactNode } from "react";
import { LoaderCircleIcon } from "lucide-react";
import { Button } from "../ui/button.js";

type PendingButtonProps = Omit<ComponentProps<typeof Button>, "asChild"> & {
  pending: boolean;
  pendingLabel?: ReactNode;
  icon?: ReactNode;
};

/** Pending is request state, never inferred from validation or permission-based disabling. */
export function PendingButton({
  pending,
  pendingLabel,
  icon,
  children,
  disabled,
  type = "button",
  ...props
}: PendingButtonProps): JSX.Element {
  return (
    <Button {...props} type={type} disabled={pending || disabled} aria-busy={pending || undefined}>
      {pending ? (
        <LoaderCircleIcon
          data-icon="inline-start"
          className="animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
      ) : (
        icon
      )}
      {/* Keep translated text out of the icon's insertion/removal boundary. */}
      <span>{pending && pendingLabel !== undefined ? pendingLabel : children}</span>
    </Button>
  );
}
