"use client";

import { createDebugBundleBrowserSdk } from "@debugbundle/sdk-browser";

export const browserDebugBundle = createDebugBundleBrowserSdk({
  apiUrl: process.env.NEXT_PUBLIC_DEBUGBUNDLE_API_URL,
  environment: process.env.NEXT_PUBLIC_DEBUGBUNDLE_ENVIRONMENT ?? "development",
  service: process.env.NEXT_PUBLIC_DEBUGBUNDLE_SERVICE ?? "nextjs-basic-browser"
});