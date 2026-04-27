/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_SPECTRE_DATA_MODE?: "auto" | "live" | "mock";
  readonly VITE_SPECTRE_LIVE_TIMEOUT_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
