/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RHINO_COMPUTE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
