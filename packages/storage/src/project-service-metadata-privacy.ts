import { sanitizeTelemetry } from "../../redaction/src/index.js";
import type { ServiceDefinition } from "../../shared-types/src/project-services.js";

function checkedText(value: string): { safe: boolean; text: string } {
  const result = sanitizeTelemetry(value);
  if (!result.ok || typeof result.value !== "string") return { safe: false, text: "[REDACTED]" };
  if (result.value === value) return { safe: true, text: value };
  // Inert JSON formatting can be retained after the mandatory traversal proves
  // exactly the same parsed value. Credential/budget changes never pass this check.
  try {
    if (JSON.stringify(JSON.parse(value)) === result.value) return { safe: true, text: value };
  } catch {
    /* Plain metadata need not be JSON. */
  }
  return { safe: false, text: result.value };
}

export function isSafeProjectMetadataText(value: string): boolean {
  return checkedText(value).safe;
}
export function isSafeServiceMetadata(metadata: Record<string, unknown>): boolean {
  return Object.values(metadata).every(
    (value) => typeof value !== "string" || isSafeProjectMetadataText(value)
  );
}

/** Preserve stored lineage and only sanitize the outward copy. Structural
 * repository metadata becomes explicitly unavailable if sanitizing changes it. */
export function safeServiceDefinition(record: ServiceDefinition): ServiceDefinition {
  type Field = NonNullable<ServiceDefinition["redacted_fields"]>[number];
  const fields = new Set<Field>(record.redacted_fields ?? []);
  function display(value: string, field: Field): string {
    const checked = checkedText(value);
    if (!checked.safe) fields.add(field);
    return checked.text;
  }
  function structural(value: string | null, field: Field): string | null {
    if (value === null) return null;
    const checked = checkedText(value);
    if (checked.safe) return value;
    fields.add(field);
    return null;
  }
  const name = display(record.name, "name"),
    inputName = display(record.input_name, "input_name");
  const description =
    record.description === null ? null : display(record.description, "description");
  const repositoryUrl = structural(record.repository_url, "repository_url"),
    repositoryRoot = structural(record.repository_root, "repository_root");
  let repository = record.repository;
  if (
    repository &&
    (!checkedText(repository.url).safe ||
      (repository.root !== null && !checkedText(repository.root).safe))
  ) {
    fields.add("repository");
    repository = null;
  }
  const environments = record.environments.map((value) => display(value, "environments"));
  return {
    ...record,
    name,
    input_name: inputName,
    description,
    repository_url: repositoryUrl,
    repository_root: repositoryRoot,
    repository,
    environments,
    ...(fields.size ? { redacted_fields: [...fields] } : {})
  };
}
