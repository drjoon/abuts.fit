import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.VITE_DEV_API_TARGET || "http://localhost:8080";
  const cncTarget =
    env.VITE_DEV_CNC_TARGET ||
    env.VITE_DEV_BRIDGE_TARGET ||
    "http://localhost:8002";

  return {
    server: {
      host: "::",
      port: 5173,
      proxy: {
        "/api/cnc-machines": {
          target: apiTarget,
          changeOrigin: true,
        },
        "/api/cnc/": {
          target: cncTarget,
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
  };
});
