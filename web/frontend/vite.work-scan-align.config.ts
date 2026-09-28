// 작업 스캔 자동 정렬을 백엔드가 쓰는 Node ESM 한 파일로 묶는다(three 포함).
// 결과물은 web/backend/vendor/workScanAutoAlign/ 에 둔다. `npm run build`가 같이 만든다.
// related files:
// - web/frontend/src/node/workScanAutoAlign.node.ts
// - web/backend/services/workScanAutoAlign.worker.js
import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  publicDir: false,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  ssr: {
    noExternal: true,
    target: "node",
  },
  build: {
    ssr: path.resolve(__dirname, "src/node/workScanAutoAlign.node.ts"),
    outDir: path.resolve(__dirname, "../backend/vendor/workScanAutoAlign"),
    emptyOutDir: true,
    target: "node20",
    minify: false,
    sourcemap: false,
    rollupOptions: {
      output: {
        format: "es",
        entryFileNames: "workScanAutoAlign.mjs",
        inlineDynamicImports: true,
      },
    },
  },
});
