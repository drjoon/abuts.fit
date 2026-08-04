// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installFetchGuard } from "./shared/api/installFetchGuard.ts";

installFetchGuard();

// After a deploy, stale tabs may request old hashed chunks that no longer
// exist. Reload once so the browser picks up the new index.html.
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  const reloadKey = "vite-preload-reload";
  const last = Number(sessionStorage.getItem(reloadKey) || "0");
  if (Date.now() - last < 15_000) return;
  sessionStorage.setItem(reloadKey, String(Date.now()));
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(<App />);
