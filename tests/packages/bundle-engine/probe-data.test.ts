import { expect, it } from "vitest";
import {
  collectInlineProbeItems,
  mergeProbeDataItems
} from "../../../packages/bundle-engine/src/index.js";
import { rustSdkEvents } from "../../helpers/rust-sdk-fixtures.js";

it("retains protected native inline probes and omits non-exception events", () => {
  const events = rustSdkEvents();
  const primary = events.find((event) => event.event_type === "backend_exception")!;
  expect(collectInlineProbeItems(primary)).toMatchObject([
    { label: "checkout.state", data: { phase: "authorize", password: "[REDACTED]" } }
  ]);
  expect(collectInlineProbeItems(events[1]!)).toEqual([]);
  if (primary.event_type !== "backend_exception") throw new Error("fixture");
  delete primary.payload.probe_data;
  expect(collectInlineProbeItems(primary)).toEqual([]);
});

it("deduplicates equivalent primitive data and orders combined probe records deterministically", () => {
  const first = {
    label: "b",
    timestamp: "2026-11-13T00:00:00.000Z",
    activation_id: null,
    data: { a: [1, true, null, "value"], b: { technical: 2 } }
  };
  const equivalent = { ...first, data: { b: { technical: 2 }, a: [1, true, null, "value"] } };
  const another = { ...first, label: "a", activation_id: "active" };
  const older = { ...first, timestamp: "2026-11-12T23:59:59.000Z" };
  expect(mergeProbeDataItems([first, equivalent, another, older])).toEqual([older, another, first]);
  expect(mergeProbeDataItems([])).toEqual([]);
});
