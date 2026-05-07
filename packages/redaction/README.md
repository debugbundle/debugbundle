# @debugbundle/redaction

Sensitive-data redaction helpers used by DebugBundle SDKs and ingestion flows.

This package provides the shared payload scrubbing primitives that remove secrets and other unsafe fields before data leaves a process.

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
```

## Notes

- Published from the core-owned shared-package release workflow in `debugbundle/debugbundle`.
- Most applications consume this transitively through a DebugBundle SDK package.