// related files:
// - web/frontend/src/features/landing/LandingHome.tsx
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/shared/ui/cn";

export type LandingRailItem = { id: string; label: string };

/** 우측 가장자리 섹션 내비(스크롤 스파이). 클릭하면 해당 섹션으로 부드럽게 이동한다. */
export function LandingSectionRail({ items }: { items: LandingRailItem[] }) {
  const [active, setActive] = useState(items[0]?.id ?? "");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
    );
    for (const item of items) {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [items]);

  const go = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  };

  return createPortal(
    <nav
      aria-label="섹션 이동"
      className="fixed right-3 top-1/2 z-40 hidden -translate-y-1/2 flex-col items-end gap-3.5 md:flex lg:right-5"
    >
      {items.map((item) => {
        const on = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            aria-label={item.label}
            aria-current={on ? "true" : undefined}
            onClick={(event) => {
              go(item.id);
              event.currentTarget.blur();
            }}
            className="group relative flex h-3 w-9 items-center justify-end outline-none"
          >
            <span
              className={cn(
                "pointer-events-none absolute right-full mr-3 whitespace-nowrap rounded-full bg-[#0b2a5c] px-2.5 py-1 text-[11px] font-medium text-white opacity-0 shadow-md transition-opacity delay-0 group-hover:opacity-100 group-hover:delay-[600ms] group-focus-visible:opacity-100",
              )}
            >
              {item.label}
            </span>
            <span
              className={cn(
                "block h-[3px] rounded-full ring-1 ring-white/60 transition-all duration-300",
                on
                  ? "w-6 bg-[#2563eb] shadow-[0_0_10px_rgba(37,99,235,0.6)]"
                  : "w-3 bg-[#2563eb]/40 group-hover:w-5 group-hover:bg-[#2563eb]/70",
              )}
            />
          </button>
        );
      })}
    </nav>,
    document.body,
  );
}
