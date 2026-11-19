import { expect, it } from "vitest";
import { localDateTimeInput, localDateTimeUtc } from "../../../apps/web/src/lib/local-datetime.js";

it.skipIf(process.env["TZ"] !== "Europe/Ljubljana")(
  "rejects the spring DST gap and uses the selected date’s UTC offset",
  () => {
    expect(localDateTimeUtc("2026-03-29T02:30")).toBeNull();
    expect(localDateTimeUtc("2026-07-01T14:30")).toBe("2026-07-01T12:30:00.000Z");
    expect(localDateTimeUtc("2026-12-01T14:30")).toBe("2026-12-01T13:30:00.000Z");
  }
);

it("converts native local input to UTC without changing untouched precise timestamps", () => {
  const original = "2026-11-18T10:07:53.991Z";
  expect(localDateTimeUtc(localDateTimeInput(original), original)).toBe(original);
  expect(localDateTimeUtc("2026-12-01T14:30")).toBe(new Date(2026, 11, 1, 14, 30).toISOString());
  expect(localDateTimeInput(new Date(2026, 11, 1, 14, 30).toISOString())).toBe("2026-12-01T14:30");
});
it.each(["", "invalid", "2026-02-30T14:30", "2026-12-01T25:30"])(
  "rejects invalid local date %s",
  (value) => {
    expect(localDateTimeUtc(value)).toBeNull();
  }
);
