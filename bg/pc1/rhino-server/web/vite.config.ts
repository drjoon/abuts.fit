// related files:
// - bg/pc1/rhino-server/rules.md
// - bg/pc1/rhino-server/compute/scripts/process_abutment_stl.py
// - bg/pc1/rhino-server/compute/scripts/align_stl_coordinate.py
// - web/backend/controllers/bg/bg.controller.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
  },
});
