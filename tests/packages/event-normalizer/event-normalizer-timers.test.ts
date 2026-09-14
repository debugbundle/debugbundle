import { expect, it } from "vitest";
import { fingerprint, normalizeEvent } from "../../../packages/event-normalizer/src/index.js";
import { createEventEnvelope } from "../../../packages/shared-types/src/index.js";

function timer(
  date: string,
  code = "WFLYEJB0020",
  component = "LoaderScheduler",
  version: "v1" | "v2" = "v2"
) {
  return normalizeEvent(
    createEventEnvelope({
      event_type: "log_event",
      service: { name: "worker", environment: "staging", runtime: "java" },
      payload: {
        level: "error",
        message: `${code}: Error invoking timeout for timer: [id=123e4567-e89b-42d3-a456-426614174000 timedObjectId=app.module.${component} auto-timer?:true persistent?:true timerService=org.jboss.as.ejb3.timerservice.TimerServiceImpl@4d5678 previousRun=${date} initialExpiration=null intervalDuration(in milli sec)=0 nextExpiration=${date} timerState=IN_TIMEOUT info=null]`,
        attributes: {}
      }
    }),
    version
  );
}

it("groups the same Java timer failure across calendar names, days, months and offsets", () => {
  const dates = [
    "Fri Aug 28 17:30:00 UTC 2026",
    "Sun Sep 06 17:30:00 UTC 2026",
    "Mon Sep 7 19:30:00 CEST 2026",
    "Tue Oct 6 17:30:00 GMT+02:00 2026"
  ];
  expect(new Set(dates.map((date) => fingerprint(timer(date)))).size).toBe(1);
});

it("keeps different timer components and wrapper error codes distinct", () => {
  const date = "Sun Sep 06 17:30:00 UTC 2026";
  expect(fingerprint(timer(date))).not.toBe(fingerprint(timer(date, "WFLYEJB0022")));
  expect(fingerprint(timer(date))).not.toBe(
    fingerprint(timer(date, "WFLYEJB0020", "OtherScheduler"))
  );
});

it("does not normalize arbitrary calendar words outside the known timer diagnostic", () => {
  const a = timer("Sun Sep 06 17:30:00 UTC 2026", "CUSTOM0001");
  const b = timer("Mon Sep 07 17:30:00 UTC 2026", "CUSTOM0001");
  expect(fingerprint(a)).not.toBe(fingerprint(b));
});

it("retains the legacy algorithm for installed exact-match rules and separates environments and causes", () => {
  const date = "Sun Sep 06 17:30:00 UTC 2026";
  const legacy = timer(date, "WFLYEJB0020", "LoaderScheduler", "v1");
  const current = timer(date);
  expect(fingerprint(legacy)).not.toBe(fingerprint(current));
  expect(legacy.normalized_message).toContain("Sun Sep");
  expect(fingerprint(current)).not.toBe(fingerprint({ ...current, environment: "production" }));
  expect(
    fingerprint({
      ...current,
      normalized_message: current.normalized_message + " Caused by TimeoutException"
    })
  ).not.toBe(
    fingerprint({
      ...current,
      normalized_message: current.normalized_message + " Caused by NullPointerException"
    })
  );
});
