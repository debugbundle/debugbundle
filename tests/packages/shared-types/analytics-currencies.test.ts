import { describe, expect, it } from "vitest";
import {
  ANALYTICS_CURRENCY_TABLE_VERSION,
  getAnalyticsCurrencyExponent
} from "../../../packages/shared-types/src/index.js";

describe("analytics lossless currency interpretation", () => {
  it("uses the pinned official minor-unit table instead of assuming two decimal places", () => {
    expect(ANALYTICS_CURRENCY_TABLE_VERSION).toBe("iso4217-2026-09-17");
    expect(getAnalyticsCurrencyExponent("USD")).toBe(2);
    expect(getAnalyticsCurrencyExponent("EUR")).toBe(2);
    expect(getAnalyticsCurrencyExponent("JPY")).toBe(0);
    expect(getAnalyticsCurrencyExponent("KWD")).toBe(3);
    expect(getAnalyticsCurrencyExponent("CLF")).toBe(4);
  });
  it.each(["usd", "XXX", "XAU", "BGN", "constructor", "__proto__", "NOT_A_CURRENCY"])(
    "withholds unsupported current code %s",
    (value) => {
      expect(getAnalyticsCurrencyExponent(value)).toBeNull();
    }
  );
});
