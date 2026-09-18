// related files:
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/Navigation.tsx
import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";

/** Reset window scroll when the route pathname changes (hash deep-links keep section scroll). */
export function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useLayoutEffect(() => {
    if (hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname, hash]);

  return null;
}
