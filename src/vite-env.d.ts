/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_DEV_PROXY?: string;
  readonly DEV: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Augment `Error` for HTTP helpers that attach status / path. */
interface Error {
  status?: number;
  path?: string;
  method?: string;
  attempts?: unknown[];
  attemptedPaths?: unknown[];
}
