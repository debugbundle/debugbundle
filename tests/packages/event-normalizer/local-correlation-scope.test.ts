import { expect, it } from "vitest";
import {
  bindLocalProjectScope,
  UNASSIGNED_LOCAL_PROJECT_ID,
  sourceEventsMatchScope
} from "../../../packages/event-normalizer/src/local-correlation-scope.js";
import { rustSdkEvents } from "../../helpers/rust-sdk-fixtures.js";

it("binds absent/null SDK project IDs locally without changing explicit project/environment boundaries", () => {
  const original = rustSdkEvents()[0]!;
  expect(original.project_id).toBeUndefined();
  for (const project_id of [undefined, null]) {
    const event = project_id === undefined ? original : { ...original, project_id };
    const bound = bindLocalProjectScope(event);
    expect(bound.project_id).toBe(UNASSIGNED_LOCAL_PROJECT_ID);
    expect(event.project_id).toBe(project_id);
    expect(bound.event_id).toBe(original.event_id);
    expect(bound.correlation).toEqual(original.correlation);
    expect(
      sourceEventsMatchScope({
        projectId: UNASSIGNED_LOCAL_PROJECT_ID,
        environment: original.service.environment,
        sourceEvents: [bound]
      })
    ).toBe(true);
    const explicit = { ...original, project_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
    expect(bindLocalProjectScope(explicit)).toBe(explicit);
    expect(
      sourceEventsMatchScope({
        projectId: UNASSIGNED_LOCAL_PROJECT_ID,
        environment: original.service.environment,
        sourceEvents: [bound, explicit]
      })
    ).toBe(false);
    expect(
      sourceEventsMatchScope({
        projectId: UNASSIGNED_LOCAL_PROJECT_ID,
        environment: "another-environment",
        sourceEvents: [bound]
      })
    ).toBe(false);
  }
  expect(original.project_id).toBeUndefined();
});
