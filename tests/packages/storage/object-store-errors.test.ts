import { expect, it } from "vitest";
import { isObjectMissing } from "../../../packages/storage/src/object-store-errors.js";

it.each([
  new Error("s3_object_not_found"),
  { name: "NoSuchKey" },
  { code: "NoSuchKey" },
  { $metadata: { httpStatusCode: 404 } }
])("recognizes explicit object absence: %j", (error) => {
  expect(isObjectMissing(error)).toBe(true);
});

it.each([
  null,
  undefined,
  "network_error",
  [],
  new Error("timeout"),
  { $metadata: { httpStatusCode: 403 } },
  { $metadata: { httpStatusCode: 500 } },
  { $metadata: [] },
  { $metadata: null }
])("never turns a storage error or malformed failure into object absence: %j", (error) => {
  expect(isObjectMissing(error)).toBe(false);
});
