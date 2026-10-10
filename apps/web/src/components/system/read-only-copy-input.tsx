import { useRef } from "react";
import { CopyIcon } from "lucide-react";
import { Field, FieldLabel } from "../ui/field.js";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from "../ui/input-group.js";
import { showErrorToast, showSuccessToast } from "../../lib/notify.js";

export interface ReadOnlyCopyInputProps {
  id: string;
  label: string;
  value: string;
  copyLabel?: string;
  successMessage?: string;
  errorMessage?: string;
}

export function ReadOnlyCopyInput({
  id,
  label,
  value,
  copyLabel = "Copy",
  successMessage = "Copied to clipboard.",
  errorMessage = "Could not copy. Select and copy the value in the input."
}: ReadOnlyCopyInputProps): JSX.Element {
  const input = useRef<HTMLInputElement>(null);
  async function copy(): Promise<void> {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(value);
      showSuccessToast(successMessage);
    } catch {
      input.current?.focus();
      input.current?.select();
      showErrorToast(errorMessage);
    }
  }
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <InputGroup>
        <InputGroupInput
          id={id}
          ref={input}
          value={value}
          readOnly
          onFocus={(event) => event.currentTarget.select()}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            aria-label={copyLabel}
            title={copyLabel}
            onClick={() => void copy()}
          >
            <CopyIcon />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </Field>
  );
}
