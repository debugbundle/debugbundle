import { describe, expect, it } from "vitest";

import { buildReproduction } from "../../../packages/repro-engine/src/index.js";
import {
  absentBodyGoldenFixture,
  emptyJsonObjectBodyGoldenFixture,
  forwardedRequestContextGoldenFixture,
  jsonArrayBodyGoldenFixture,
  jsonScalarStringBodyGoldenFixture,
  multilineControlCharacterGoldenFixture,
  plainTextBodyGoldenFixture,
  redactedAbsentBodyGoldenFixture,
  redactedJsonScalarNullBodyGoldenFixture,
  redactedRepeatedHeaderArrayGoldenFixture,
  redactedRepeatedSignedDecimalStringLiteralQueryArrayGoldenFixture,
  redactedRepeatedStringLiteralQueryArrayGoldenFixture,
  redactedRepeatedQueryArrayGoldenFixture,
  redactedStructuredJsonBodyGoldenFixture,
  requestContextGoldenFixture,
  shellQuotedRequestGoldenFixture,
  structuredFormBodyGoldenFixture,
  structuredJsonBodyGoldenFixture
} from "../../helpers/repro-engine-fixtures.ts";
import {
  createBundleWithAbsentBodyRequestContext,
  createBundleWithEmptyJsonObjectRequestBody,
  createBundleWithForwardedRequestContext,
  createBundleWithJsonArrayRequestBody,
  createBundleWithJsonScalarRequestBody,
  createBundleWithMultilineControlCharacterRequestContext,
  createBundleWithPlainTextRequestBody,
  createBundleWithRedactedAbsentBodyRequestContext,
  createBundleWithRedactedJsonNullScalarRequestBody,
  createBundleWithRedactedRepeatedHeaderArrayRequestContext,
  createBundleWithRedactedRepeatedSignedDecimalStringLiteralQueryArrayRequestContext,
  createBundleWithRedactedRepeatedStringLiteralQueryArrayRequestContext,
  createBundleWithRedactedRepeatedQueryArrayRequestContext,
  createBundleWithRedactedStructuredJsonRequestBody,
  createBundleWithRequestContext,
  createBundleWithShellQuotedRequestContext,
  createBundleWithStructuredFormRequestBody,
  createBundleWithStructuredJsonRequestBody,
  jsonScalarStringFixtureInput
} from "../../helpers/repro-engine.ts";

describe("repro-engine golden fixtures", () => {
  it("should produce deterministic request-context output matching golden fixture", (): void => {
    const reproduction = buildReproduction(createBundleWithRequestContext());

    expect(JSON.stringify(reproduction)).toBe(requestContextGoldenFixture);
    expect(buildReproduction(createBundleWithRequestContext())).toEqual(reproduction);
  });

  it("should produce deterministic forwarded-request output matching golden fixture", (): void => {
    const reproduction = buildReproduction(createBundleWithForwardedRequestContext());

    expect(JSON.stringify(reproduction)).toBe(forwardedRequestContextGoldenFixture);
    expect(buildReproduction(createBundleWithForwardedRequestContext())).toEqual(reproduction);
  });

  it("should produce deterministic plain-text body output matching golden fixture", (): void => {
    const reproduction = buildReproduction(createBundleWithPlainTextRequestBody());

    expect(JSON.stringify(reproduction)).toBe(plainTextBodyGoldenFixture);
    expect(buildReproduction(createBundleWithPlainTextRequestBody())).toEqual(reproduction);
  });

  it("should produce deterministic structured form-body output matching golden fixture", (): void => {
    const reproduction = buildReproduction(createBundleWithStructuredFormRequestBody());

    expect(JSON.stringify(reproduction)).toBe(structuredFormBodyGoldenFixture);
    expect(buildReproduction(createBundleWithStructuredFormRequestBody())).toEqual(reproduction);
  });

  it("should produce deterministic shell-quoted request output matching golden fixture", (): void => {
    const reproduction = buildReproduction(createBundleWithShellQuotedRequestContext());

    expect(JSON.stringify(reproduction)).toBe(shellQuotedRequestGoldenFixture);
    expect(buildReproduction(createBundleWithShellQuotedRequestContext())).toEqual(reproduction);
  });

  it("should produce deterministic multiline/control-character output matching golden fixture", (): void => {
    const reproduction = buildReproduction(createBundleWithMultilineControlCharacterRequestContext());

    expect(JSON.stringify(reproduction)).toBe(multilineControlCharacterGoldenFixture);
    expect(buildReproduction(createBundleWithMultilineControlCharacterRequestContext())).toEqual(reproduction);
  });

  it("should produce deterministic structured JSON body output matching golden fixture", (): void => {
    const reproduction = buildReproduction(createBundleWithStructuredJsonRequestBody());

    expect(JSON.stringify(reproduction)).toBe(structuredJsonBodyGoldenFixture);
    expect(buildReproduction(createBundleWithStructuredJsonRequestBody())).toEqual(reproduction);
  });

  it("should produce deterministic redacted structured JSON body output matching golden fixture", (): void => {
    const reproduction = buildReproduction(createBundleWithRedactedStructuredJsonRequestBody());

    expect(JSON.stringify(reproduction)).toBe(redactedStructuredJsonBodyGoldenFixture);
    expect(buildReproduction(createBundleWithRedactedStructuredJsonRequestBody())).toEqual(reproduction);
  });

  it("should produce deterministic top-level JSON array output matching golden fixture", (): void => {
    const reproduction = buildReproduction(createBundleWithJsonArrayRequestBody());

    expect(JSON.stringify(reproduction)).toBe(jsonArrayBodyGoldenFixture);
    expect(buildReproduction(createBundleWithJsonArrayRequestBody())).toEqual(reproduction);
  });

  it("should produce deterministic top-level JSON string scalar output matching golden fixture", (): void => {
    const reproduction = buildReproduction(createBundleWithJsonScalarRequestBody(jsonScalarStringFixtureInput));

    expect(JSON.stringify(reproduction)).toBe(jsonScalarStringBodyGoldenFixture);
    expect(buildReproduction(createBundleWithJsonScalarRequestBody(jsonScalarStringFixtureInput))).toEqual(reproduction);
  });

  it("should produce deterministic absent-body output matching golden fixture", (): void => {
    const reproduction = buildReproduction(createBundleWithAbsentBodyRequestContext());

    expect(JSON.stringify(reproduction)).toBe(absentBodyGoldenFixture);
    expect(buildReproduction(createBundleWithAbsentBodyRequestContext())).toEqual(reproduction);
  });

  it("should produce deterministic redacted absent-body output matching golden fixture", (): void => {
    const reproduction = buildReproduction(createBundleWithRedactedAbsentBodyRequestContext());

    expect(JSON.stringify(reproduction)).toBe(redactedAbsentBodyGoldenFixture);
    expect(buildReproduction(createBundleWithRedactedAbsentBodyRequestContext())).toEqual(reproduction);
  });

  it("should produce deterministic empty structured JSON object output matching golden fixture", (): void => {
    const reproduction = buildReproduction(createBundleWithEmptyJsonObjectRequestBody());

    expect(JSON.stringify(reproduction)).toBe(emptyJsonObjectBodyGoldenFixture);
    expect(buildReproduction(createBundleWithEmptyJsonObjectRequestBody())).toEqual(reproduction);
  });

  it("should produce deterministic redacted JSON null scalar output matching golden fixture", (): void => {
    const reproduction = buildReproduction(createBundleWithRedactedJsonNullScalarRequestBody());

    expect(JSON.stringify(reproduction)).toBe(redactedJsonScalarNullBodyGoldenFixture);
    expect(buildReproduction(createBundleWithRedactedJsonNullScalarRequestBody())).toEqual(reproduction);
  });

  it("should produce deterministic repeated redacted header array output matching golden fixture", (): void => {
    const reproduction = buildReproduction(createBundleWithRedactedRepeatedHeaderArrayRequestContext());

    expect(JSON.stringify(reproduction)).toBe(redactedRepeatedHeaderArrayGoldenFixture);
    expect(buildReproduction(createBundleWithRedactedRepeatedHeaderArrayRequestContext())).toEqual(reproduction);
  });

  it("should produce deterministic repeated redacted query array output matching golden fixture", (): void => {
    const reproduction = buildReproduction(createBundleWithRedactedRepeatedQueryArrayRequestContext());

    expect(JSON.stringify(reproduction)).toBe(redactedRepeatedQueryArrayGoldenFixture);
    expect(buildReproduction(createBundleWithRedactedRepeatedQueryArrayRequestContext())).toEqual(reproduction);
  });

  it("should produce deterministic repeated redacted string-literal query array output matching golden fixture", (): void => {
    const reproduction = buildReproduction(createBundleWithRedactedRepeatedStringLiteralQueryArrayRequestContext());

    expect(JSON.stringify(reproduction)).toBe(redactedRepeatedStringLiteralQueryArrayGoldenFixture);
    expect(buildReproduction(createBundleWithRedactedRepeatedStringLiteralQueryArrayRequestContext())).toEqual(reproduction);
  });

  it("should produce deterministic repeated redacted signed-decimal string-literal query array output matching golden fixture", (): void => {
    const reproduction = buildReproduction(createBundleWithRedactedRepeatedSignedDecimalStringLiteralQueryArrayRequestContext());

    expect(JSON.stringify(reproduction)).toBe(redactedRepeatedSignedDecimalStringLiteralQueryArrayGoldenFixture);
    expect(buildReproduction(createBundleWithRedactedRepeatedSignedDecimalStringLiteralQueryArrayRequestContext())).toEqual(reproduction);
  });

});