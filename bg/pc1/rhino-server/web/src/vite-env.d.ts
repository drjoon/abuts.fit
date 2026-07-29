// related files:
// - bg/pc1/rhino-server/rules.md
// - bg/pc1/rhino-server/compute/scripts/process_abutment_stl.py
// - bg/pc1/rhino-server/compute/scripts/align_stl_coordinate.py
// - web/backend/controllers/bg/bg.controller.js
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RHINO_COMPUTE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
