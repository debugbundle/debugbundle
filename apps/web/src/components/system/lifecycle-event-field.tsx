import { WebhookEventTypeSchema } from "../../../../../packages/webhook-client/src/index.js";
import { Checkbox } from "../ui/checkbox.js";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "../ui/field.js";

export function LifecycleEventField({
  id,
  value,
  onChange
}: {
  id: string;
  value: string[];
  onChange: (value: string[]) => void;
}): JSX.Element {
  return (
    <FieldSet>
      <FieldLegend>Event types</FieldLegend>
      <FieldGroup>
        {WebhookEventTypeSchema.options.map((event) => (
          <Field key={event} orientation="horizontal">
            <Checkbox
              id={`${id}-${event}`}
              checked={value.includes(event)}
              onCheckedChange={(checked) =>
                onChange(
                  checked === true ? [...value, event] : value.filter((entry) => entry !== event)
                )
              }
            />
            <FieldLabel htmlFor={`${id}-${event}`}>{event}</FieldLabel>
          </Field>
        ))}
      </FieldGroup>
    </FieldSet>
  );
}
