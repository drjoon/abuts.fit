// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.VITE_DEV_API_TARGET || "http://localhost:8080";

  return {
    server: {
      host: "::",
      port: 5173,
      // 사전 번들 deps는 기본이 1년 immutable이다. 락파일 해시가 그대로면
      // 청크 이름만 바뀐 뒤에도 브라우저가 옛 ?v= 를 써서, 없는 청크 404(MIME "")로 막힌다.
      headers: {
        "Cache-Control": "no-cache",
      },
      proxy: {
        "/socket.io": {
          target: apiTarget,
          changeOrigin: true,
          ws: true,
        },
        "/api/cnc-machines": {
          target: apiTarget,
          changeOrigin: true,
        },
        "/api/cnc/": {
          target: apiTarget,
          changeOrigin: true,
        },
        "/api/core": {
          target: apiTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/core/, "/api"),
        },
        "/api/bridge-store": {
          target: apiTarget,
          changeOrigin: true,
        },
        "/api": {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(
      Boolean,
    ),
    resolve: {
      alias: [
        { find: "@", replacement: path.resolve(__dirname, "src") },
        // rhino3dm 패키지 main은 Node용 CJS. 브라우저 청크는 ESM과 wasm URL을 쓴다.
        {
          find: /^rhino3dm$/,
          replacement: path.resolve(__dirname, "node_modules/rhino3dm/rhino3dm.module.js"),
        },
        // CAD wasm 래퍼가 Node 분기에만 쓰는 내장 모듈. 브라우저에서는 호출되지 않는다.
        {
          find: /^node:module$/,
          replacement: path.resolve(__dirname, "src/shims/nodeModule.js"),
        },
        {
          find: /^path$/,
          replacement: path.resolve(__dirname, "src/shims/nodePath.js"),
        },
        {
          find: /^crypto$/,
          replacement: path.resolve(__dirname, "src/shims/nodeCrypto.js"),
        },
      ],
    },
    optimizeDeps: {
      exclude: ["rhino3dm"],
      // esbuildOptions는 브라우저 해시(?v=)에 들어간다. 식별자는 소스에서 안 쓰여 출력은 그대로고,
      // 이미 immutable로 박힌 98b24b15 URL만 버린다.
      esbuildOptions: {
        define: {
          __ABUTS_OPTIMIZE_DEPS_REV__: '"1"',
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (
              id.includes("node_modules/three") ||
              id.includes("node_modules/three-stdlib")
            ) {
              return "three";
            }
            if (
              id.includes("node_modules/@radix-ui") ||
              id.includes("node_modules/cmdk") ||
              id.includes("node_modules/vaul")
            ) {
              return "radix";
            }
            if (
              id.includes("node_modules/react/") ||
              id.includes("node_modules/react-dom/") ||
              id.includes("node_modules/react-router") ||
              id.includes("node_modules/scheduler/")
            ) {
              return "react-vendor";
            }
            if (id.includes("node_modules/@tanstack")) {
              return "tanstack";
            }
            if (id.includes("node_modules/lucide-react")) {
              return "lucide";
            }
            if (id.includes("node_modules/date-fns")) {
              return "date-fns";
            }
            if (
              id.includes("node_modules/socket.io-client") ||
              id.includes("node_modules/engine.io-client") ||
              id.includes("node_modules/@socket.io") ||
              id.includes("node_modules/socket.io-parser")
            ) {
              return "socketio";
            }
          },
        },
      },
    },
  };
});
