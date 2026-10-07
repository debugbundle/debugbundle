import { useEffect, useState } from "react";
import { listServices, type ServiceRecord } from "../../lib/api.js";
import { Field, FieldDescription, FieldLabel } from "../ui/field.js";
import { Input } from "../ui/input.js";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "../ui/select.js";
import { Switch } from "../ui/switch.js";
import { Checkbox } from "../ui/checkbox.js";

export function AlertDeliveryFields({
  projectId,
  serviceId,
  setServiceId,
  enabled,
  setEnabled,
  digestWindow,
  setDigestWindow,
  cooldownScope,
  setCooldownScope,
  signingRequested,
  setSigningRequested,
  editingAlertId,
  channel
}: {
  projectId: string;
  editingAlertId: string | null;
  serviceId: string;
  setServiceId: (value: string) => void;
  enabled: boolean;
  setEnabled: (value: boolean) => void;
  digestWindow: string;
  setDigestWindow: (value: string) => void;
  cooldownScope: string;
  setCooldownScope: (value: string) => void;
  signingRequested: boolean;
  setSigningRequested: (value: boolean) => void;
  channel: "email" | "slack" | "discord" | "webhook";
}): JSX.Element {
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [servicesError, setServicesError] = useState(false);
  useEffect(() => {
    let active = true;
    setServices([]);
    setServicesError(false);
    void listServices(projectId).then(
      (records) => {
        if (active) setServices(records);
      },
      () => {
        if (active) setServicesError(true);
      }
    );
    return () => {
      active = false;
    };
  }, [projectId]);
  return (
    <>
      <Field>
        <FieldLabel htmlFor="project-alert-service">Service scope</FieldLabel>
        <Select
          value={serviceId || "__all__"}
          onValueChange={(value) => setServiceId(value === "__all__" ? "" : value)}
        >
          <SelectTrigger id="project-alert-service" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="__all__">All services</SelectItem>
              {serviceId && !services.some((service) => service.service_id === serviceId) ? (
                <SelectItem value={serviceId}>{serviceId}</SelectItem>
              ) : null}
              {services.map((service) => (
                <SelectItem key={service.service_id} value={service.service_id}>
                  {service.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {servicesError ? (
          <FieldDescription>
            Could not load services. The current scope is preserved.
          </FieldDescription>
        ) : null}
      </Field>
      {channel === "email" ? (
        <Field>
          <FieldLabel htmlFor="project-alert-digest">Digest window (seconds)</FieldLabel>
          <Input
            id="project-alert-digest"
            type="number"
            min={1}
            max={300}
            step={1}
            value={digestWindow}
            onChange={(event) => setDigestWindow(event.currentTarget.value)}
          />
          <FieldDescription>Leave empty for the default 10-second window.</FieldDescription>
        </Field>
      ) : (
        <Field>
          <FieldLabel htmlFor="project-alert-cooldown-scope">Cooldown scope</FieldLabel>
          <Select
            value={cooldownScope || "__default__"}
            onValueChange={(value) => setCooldownScope(value === "__default__" ? "" : value)}
          >
            <SelectTrigger id="project-alert-cooldown-scope" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="__default__">Incident (default)</SelectItem>
                <SelectItem value="incident">Incident</SelectItem>
                <SelectItem value="project">Project</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      )}
      <Field orientation="horizontal">
        <Switch id="project-alert-enabled" checked={enabled} onCheckedChange={setEnabled} />
        <FieldLabel htmlFor="project-alert-enabled">Enabled</FieldLabel>
      </Field>
      {channel === "webhook" ? (
        <Field orientation="horizontal">
          <Checkbox
            id="project-alert-signing"
            checked={signingRequested}
            onCheckedChange={(checked) => setSigningRequested(checked === true)}
          />
          <div>
            <FieldLabel htmlFor="project-alert-signing">
              {editingAlertId === null ? "Reveal signing secret" : "Rotate signing secret"}
            </FieldLabel>
            <FieldDescription>
              {editingAlertId === null
                ? "Copy the verification key after creation."
                : "Rotation replaces the active key immediately. Update your receiver with the new key."}
            </FieldDescription>
          </div>
        </Field>
      ) : null}
    </>
  );
}
