import { lazy, Suspense, type ReactElement } from "react";
import { Route } from "react-router-dom";

import {
  OPENAI_PLUGIN_PREVIEW_ROUTE,
  isOpenAiPluginPreviewEnabled
} from "./lib/openai-plugin-preview-gate.js";

const OpenAiPluginPreviewPage =
  import.meta.env.DEV || import.meta.env.MODE === "test"
    ? lazy(async () => {
        const previewModule = await import("./pages/openai-plugin-preview-page.js");
        return { default: previewModule.OpenAiPluginPreviewPage };
      })
    : null;

export function createOpenAiPluginPreviewRoute(fallback: ReactElement): ReactElement | null {
  if (!isOpenAiPluginPreviewEnabled() || OpenAiPluginPreviewPage === null) {
    return null;
  }

  return (
    <Route
      path={OPENAI_PLUGIN_PREVIEW_ROUTE}
      element={
        <Suspense fallback={fallback}>
          <OpenAiPluginPreviewPage />
        </Suspense>
      }
    />
  );
}
