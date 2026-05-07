"use client";

import { browserDebugBundle } from "../lib/debugbundle-browser";

export function ClientTrigger() {
  return (
    <button
      type="button"
      onClick={async () => {
        const error = new Error("Next.js browser example failure");
        await browserDebugBundle.captureException(error, {
          tags: { example: "nextjs-basic-browser" }
        });
        throw error;
      }}
    >
      Trigger Browser Error
    </button>
  );
}