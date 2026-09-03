export const OPENAI_PLUGIN_PREVIEW_ROUTE = "/__dev/openai-plugin";

export interface OpenAiPluginPreviewEnv {
  DEV?: boolean;
  MODE?: string;
  VITE_OPENAI_PLUGIN_PREVIEW?: string;
}

export function isOpenAiPluginPreviewEnabled(
  env: OpenAiPluginPreviewEnv = import.meta.env
): boolean {
  if (env.MODE === "test") {
    return true;
  }

  return env.DEV === true && env.MODE !== "production" && env.VITE_OPENAI_PLUGIN_PREVIEW === "true";
}
