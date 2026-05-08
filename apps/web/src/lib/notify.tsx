import { CheckIcon, CircleAlertIcon, InfoIcon } from "lucide-react";
import { toast as sonnerToast } from "sonner";

const iconClassName = "size-4";

export function showSuccessToast(message: string): void {
  sonnerToast(message, {
    icon: <CheckIcon className={iconClassName} aria-hidden="true" />
  });
}

export function showErrorToast(message: string): void {
  sonnerToast.error(message, {
    icon: <CircleAlertIcon className={iconClassName} aria-hidden="true" />
  });
}

export function showInfoToast(message: string): void {
  sonnerToast(message, {
    icon: <InfoIcon className={iconClassName} aria-hidden="true" />
  });
}