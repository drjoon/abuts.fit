// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installFetchGuard } from "./shared/api/installFetchGuard.ts";

installFetchGuard();

// After a deploy, or when Vite rewrites optimized-dep ?v= hashes mid-session
// (504 Outdated Optimize Dep), stale tabs/module graphs fail. Reload once.
const reloadOnceForChunkError = () => {
  const reloadKey = "vite-preload-reload";
  const last = Number(sessionStorage.getItem(reloadKey) || "0");
  if (Date.now() - last < 15_000) return;
  sessionStorage.setItem(reloadKey, String(Date.now()));
  window.location.reload();
};

const isChunkLoadErrorMessage = (message: string) =>
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Loading chunk [\d]+ failed|Outdated Optimize Dep|Importing a module script failed/i.test(
    message,
  );

window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  reloadOnceForChunkError();
});

window.addEventListener("unhandledrejection", (event) => {
  const message = String(
    (event.reason && (event.reason as { message?: string }).message) ||
      event.reason ||
      "",
  );
  if (isChunkLoadErrorMessage(message)) {
    reloadOnceForChunkError();
  }
});

// React.lazy often swallows the rejection then rethrows during render, so
// unhandledrejection never fires — catch the window error path too.
window.addEventListener("error", (event) => {
  const message = String(
    event.message ||
      (event.error && (event.error as { message?: string }).message) ||
      "",
  );
  if (isChunkLoadErrorMessage(message)) {
    reloadOnceForChunkError();
  }
});

createRoot(document.getElementById("root")!).render(<App />);
