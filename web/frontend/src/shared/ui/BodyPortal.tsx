// related files:
// - web/frontend/src/components/ui/dialog.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Mount children on document.body so `fixed inset-0` overlays cover the full
 * viewport (including the sidebar), not just the workspace card under
 * `backdrop-blur` / overflow stacking contexts.
 */
export function BodyPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
