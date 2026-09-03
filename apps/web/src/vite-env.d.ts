/// <reference types="vite/client" />

declare const __DEBUGBUNDLE_APP_BUILD_ID__: string;

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_DOCUMENTATION_URL?: string;
  readonly VITE_OPENAI_PLUGIN_PREVIEW?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
