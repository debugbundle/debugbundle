// WildFly timer dumps embed changing Java Date values in otherwise identical
// errors. Restrict calendar normalization to the two known timer diagnostics;
// retain the component, error code, timer state and any following exception.
const TIMER_DIAGNOSTIC = /^WFLYEJB002(?:0|2):[^\n]*\[id=[^\]\n]*\btimedObjectId=/;
const JAVA_TIMER_DATE =
  /\b(previousRun|initialExpiration|nextExpiration)=((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+[A-Za-z][A-Za-z0-9:+-]{0,15}\s+\d{4})\b/g;

export function normalizeJavaTimerMessage(message: string): string {
  return TIMER_DIAGNOSTIC.test(message)
    ? message.replace(JAVA_TIMER_DATE, "$1={dynamic}")
    : message;
}
