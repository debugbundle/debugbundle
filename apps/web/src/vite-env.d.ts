/// <reference types="vite/client" />

declare const __DEBUGBUNDLE_APP_BUILD_ID__: string;

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_PUBLIC_STATUS_PAGE_BASE_URL?: string;
  readonly VITE_DOCUMENTATION_URL?: string;
  readonly VITE_OPENAI_PLUGIN_PREVIEW?: string;
  readonly VITE_DEBUGBUNDLE_DOGFOOD_PROJECT_TOKEN?: string;
  readonly VITE_DEBUGBUNDLE_FLOW_PROJECT_ID?: string;
  readonly VITE_DEBUGBUNDLE_FLOW_PROJECT_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
