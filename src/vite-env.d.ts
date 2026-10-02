/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend base URL, e.g. http://localhost:4000 — enables API auth when set. */
  readonly VITE_API_URL?: string;
  /** When "false", do not fall back to in-memory seed login if API fails. */
  readonly VITE_API_FALLBACK?: string;
  /** production | staging. Production builds refuse demo settings and hide test aids. */
  readonly VITE_APP_ENV?: string;
  /** When "false", no demo roster or demo choirs are built into the site. */
  readonly VITE_DEMO_SEED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
