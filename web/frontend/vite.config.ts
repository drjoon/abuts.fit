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
      alias: {
        "@": path.resolve(__dirname, "src"),
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
