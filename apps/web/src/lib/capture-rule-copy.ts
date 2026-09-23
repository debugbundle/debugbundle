import type { CaptureRuleMatcher } from "./capture-rules-api.js";

export function formatCaptureRuleMatcher(matcher: CaptureRuleMatcher): string {
  const parts: string[] = [];

  if (matcher.event_types?.length) {
    parts.push(`events: ${matcher.event_types.join(", ")}`);
  }
  if (matcher.browser_event_kind !== undefined) {
    parts.push(`browser: ${matcher.browser_event_kind}`);
  }
  if (matcher.browser_event_opaque !== undefined) {
    parts.push(matcher.browser_event_opaque ? "opaque browser event" : "non-opaque browser event");
  }
  if (matcher.browser_page_visibility_state !== undefined) parts.push(`page visibility: ${matcher.browser_page_visibility_state}`);
  if (matcher.browser_page_ready_state !== undefined) parts.push(`document state: ${matcher.browser_page_ready_state}`);
  if (matcher.browser_target_tag_name !== undefined) parts.push(`target: ${matcher.browser_target_tag_name}`);
  if (matcher.browser_target_attributes !== undefined) {
    parts.push(`target attributes: ${Object.entries(matcher.browser_target_attributes).map(([key, value]) => `${key}=${String(value)}`).join(", ")}`);
  }
  if (matcher.runtime?.length) {
    parts.push(`runtime: ${matcher.runtime.join(", ")}`);
  }
  if (matcher.services?.length) {
    parts.push(`services: ${matcher.services.join(", ")}`);
  }
  if (matcher.environments?.length) {
    parts.push(`environments: ${matcher.environments.join(", ")}`);
  }
  if (matcher.client_kind !== undefined) {
    parts.push(`client: ${matcher.client_kind}`);
  }
  if (matcher.bot_family !== undefined) {
    parts.push(`bot: ${matcher.bot_family}`);
  }
  if (matcher.error_name !== undefined) {
    parts.push(`error: ${matcher.error_name}`);
  }
  if (matcher.message_equals !== undefined) {
    parts.push(`message: ${matcher.message_equals}`);
  }
  if (matcher.message_contains !== undefined) {
    parts.push(`message contains: ${matcher.message_contains}`);
  }
  if (matcher.resource_url !== undefined) {
    parts.push(`resource: ${formatUrlMatcher(matcher.resource_url)}`);
  }
  if (matcher.request_url !== undefined) {
    parts.push(`request: ${formatUrlMatcher(matcher.request_url)}`);
  }
  if (matcher.status_codes?.length) {
    parts.push(`status: ${matcher.status_codes.join(", ")}`);
  }
  if (matcher.status_ranges?.length) {
    parts.push(
      `status ranges: ${matcher.status_ranges.map((range) => `${range.start}–${range.end}`).join(", ")}`
    );
  }
  if (matcher.first_party !== undefined) {
    parts.push(matcher.first_party ? "first-party only" : "third-party only");
  }
  if (matcher.fingerprint !== undefined) {
    parts.push(`fingerprint: ${matcher.fingerprint.version}:${matcher.fingerprint.value}`);
  }

  return parts.length === 0 ? "Custom matcher" : parts.join(" • ");
}

function formatUrlMatcher(matcher: NonNullable<CaptureRuleMatcher["resource_url"]>): string {
  const parts: string[] = [];
  if (matcher.host !== undefined) parts.push(matcher.host);
  if (matcher.host_suffix !== undefined) parts.push(`*.${matcher.host_suffix}`);
  if (matcher.path_equals !== undefined) parts.push(matcher.path_equals);
  if (matcher.path_prefix !== undefined) parts.push(`${matcher.path_prefix}*`);
  return parts.join(" ");
}
