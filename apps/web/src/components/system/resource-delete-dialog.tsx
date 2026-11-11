import { Trash2Icon } from "lucide-react";
import { Button } from "../ui/button.js";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction
} from "../ui/alert-dialog.js";
export function ResourceDeleteDialog({
  label,
  triggerLabel = label,
  description,
  disabled = false,
  variant = "outline",
  onConfirm
}: {
  label: string;
  triggerLabel?: string;
  description: string;
  disabled?: boolean;
  variant?: "outline" | "ghost";
  onConfirm: () => void;
}): JSX.Element {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant={variant} size="sm" disabled={disabled} aria-label={label}>
          <Trash2Icon data-icon="inline-start" />
          {triggerLabel}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{label}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={disabled}>
            {label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
