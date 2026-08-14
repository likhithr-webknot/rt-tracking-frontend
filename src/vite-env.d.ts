/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_DEV_PROXY?: string;
  readonly VITE_WEBTRAK_API_BASE?: string;
  readonly VITE_EMPLOYEE_ROSTER_API_BASE?: string;
  readonly VITE_WEBTRAK_API_KEY?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_FRONTEND_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly NEXT_PUBLIC_SUPABASE_URL?: string;
  readonly NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
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
