# @debugbundle/redaction

Sensitive-data redaction helpers used by DebugBundle SDKs and ingestion flows.

This package provides the shared payload scrubbing primitives that remove secrets and other unsafe fields before data leaves a process.

The legacy `redact(value, { sensitiveKeys })` helper keeps its existing replacement-list behavior for callers that use it directly. Production telemetry paths should use `sanitizeTelemetry`, whose extra keys are additive to the mandatory baseline. The SDKs and server must adopt that entry point at their own capture and storage boundaries; installing the library alone does not change an older SDK.

## Install

Published package:

```bash
npm install @debugbundle/redaction
```

## Example

```ts
import { redact } from "@debugbundle/redaction";

const sanitized = redact({
  authorization: "Bearer secret",
  password: "super-secret",
  safe: "ok"
});

import { sanitizeTelemetry } from "@debugbundle/redaction";

const result = sanitizeTelemetry({ message: "Authorization: Bearer example" });
if (result.ok) {
  // Use result.value only after validating the expected event schema.
} else {
  // Withhold the unsafe event; result.reason is a fixed, payload-free code.
}
```

## Notes

- Published from the core-owned shared-package release workflow in `debugbundle/debugbundle`.
- Most applications consume this transitively through a DebugBundle SDK package.
- The mandatory telemetry policy bounds depth, nodes, collection entries, each scanned string, total output, and field/query names. Field names longer than 128 UTF-16 code units and matching URL query pairs are omitted before segment matching. Applications should avoid collecting unnecessary data; this policy cannot recognize arbitrary private prose or encoded secrets.
