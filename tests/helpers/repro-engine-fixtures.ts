import { readFileSync } from "node:fs";

export const requestContextGoldenFixture = readFileSync(
  new URL("../fixtures/build-reproduction.request-context.golden.json", import.meta.url),
  "utf8"
).trim();

export const forwardedRequestContextGoldenFixture = readFileSync(
  new URL("../fixtures/build-reproduction.forwarded-request-context.golden.json", import.meta.url),
  "utf8"
).trim();

export const plainTextBodyGoldenFixture = readFileSync(
  new URL("../fixtures/build-reproduction.plain-text-body.golden.json", import.meta.url),
  "utf8"
).trim();

export const structuredFormBodyGoldenFixture = readFileSync(
  new URL("../fixtures/build-reproduction.structured-form-body.golden.json", import.meta.url),
  "utf8"
).trim();

export const shellQuotedRequestGoldenFixture = readFileSync(
  new URL("../fixtures/build-reproduction.shell-quoted-request.golden.json", import.meta.url),
  "utf8"
).trim();

export const multilineControlCharacterGoldenFixture = readFileSync(
  new URL("../fixtures/build-reproduction.multiline-control-text.golden.json", import.meta.url),
  "utf8"
).trim();

export const structuredJsonBodyGoldenFixture = readFileSync(
  new URL("../fixtures/build-reproduction.structured-json-body.golden.json", import.meta.url),
  "utf8"
).trim();

export const redactedStructuredJsonBodyGoldenFixture = readFileSync(
  new URL("../fixtures/build-reproduction.redacted-structured-json-body.golden.json", import.meta.url),
  "utf8"
).trim();

export const jsonArrayBodyGoldenFixture = readFileSync(
  new URL("../fixtures/build-reproduction.json-array-body.golden.json", import.meta.url),
  "utf8"
).trim();

export const jsonScalarStringBodyGoldenFixture = readFileSync(
  new URL("../fixtures/build-reproduction.json-scalar-string-body.golden.json", import.meta.url),
  "utf8"
).trim();

export const redactedJsonScalarNullBodyGoldenFixture = readFileSync(
  new URL("../fixtures/build-reproduction.redacted-json-scalar-null-body.golden.json", import.meta.url),
  "utf8"
).trim();

export const redactedRepeatedHeaderArrayGoldenFixture = readFileSync(
  new URL("../fixtures/build-reproduction.redacted-repeated-header-array.golden.json", import.meta.url),
  "utf8"
).trim();

export const redactedRepeatedQueryArrayGoldenFixture = readFileSync(
  new URL("../fixtures/build-reproduction.redacted-repeated-query-array.golden.json", import.meta.url),
  "utf8"
).trim();

export const redactedRepeatedStringLiteralQueryArrayGoldenFixture = readFileSync(
  new URL("../fixtures/build-reproduction.redacted-repeated-string-literal-query-array.golden.json", import.meta.url),
  "utf8"
).trim();

export const redactedRepeatedSignedDecimalStringLiteralQueryArrayGoldenFixture = readFileSync(
  new URL("../fixtures/build-reproduction.redacted-repeated-signed-decimal-string-literal-query-array.golden.json", import.meta.url),
  "utf8"
).trim();

export const absentBodyGoldenFixture = readFileSync(
  new URL("../fixtures/build-reproduction.absent-body.golden.json", import.meta.url),
  "utf8"
).trim();

export const redactedAbsentBodyGoldenFixture = readFileSync(
  new URL("../fixtures/build-reproduction.redacted-absent-body.golden.json", import.meta.url),
  "utf8"
).trim();

export const emptyJsonObjectBodyGoldenFixture = readFileSync(
  new URL("../fixtures/build-reproduction.empty-json-object-body.golden.json", import.meta.url),
  "utf8"
).trim();
