/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ANALYTICS_API_URL: string;
  readonly VITE_ANALYTICS_DASHBOARD_SECRET: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
