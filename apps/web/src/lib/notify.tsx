import { CheckIcon, CircleAlertIcon, InfoIcon } from "lucide-react";
import { toast as sonnerToast } from "sonner";

const iconClassName = "size-4";

interface ToastAction {
  label: string;
  onClick(): void;
}

interface ToastOptions {
  action?: ToastAction;
  description?: string;
  duration?: number;
}

export function showSuccessToast(message: string, options: ToastOptions = {}): void {
  sonnerToast(message, {
    ...options,
    icon: <CheckIcon className={iconClassName} aria-hidden="true" />
  });
}

export function showErrorToast(message: string, options: ToastOptions = {}): void {
  sonnerToast.error(message, {
    ...options,
    icon: <CircleAlertIcon className={iconClassName} aria-hidden="true" />
  });
}

export function showInfoToast(message: string, options: ToastOptions = {}): void {
  sonnerToast(message, {
    ...options,
    icon: <InfoIcon className={iconClassName} aria-hidden="true" />
  });
}
