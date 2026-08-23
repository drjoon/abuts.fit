// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/backend/controllers/requests/common.review.controller.js
import { useEffect, useRef, type ReactNode } from "react";

type MailboxStickyHeaderProps = {
  children: ReactNode;
};

/** Sticky action/tabs header; publishes height as --mailbox-sticky-h for top scrollbars. */
export const MailboxStickyHeader = ({ children }: MailboxStickyHeaderProps) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const publish = () => {
      const host = el.parentElement;
      if (!host) return;
      host.style.setProperty("--mailbox-sticky-h", `${el.offsetHeight}px`);
    };

    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    window.addEventListener("resize", publish);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", publish);
      el.parentElement?.style.removeProperty("--mailbox-sticky-h");
    };
  }, []);

  return (
    <div
      ref={ref}
      className="sticky top-0 z-40 -mx-3 w-full flex-shrink-0 bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:-mx-6 sm:px-6"
    >
      {children}
    </div>
  );
};
