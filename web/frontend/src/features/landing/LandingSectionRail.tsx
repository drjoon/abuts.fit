// related files:
// - web/frontend/src/features/landing/LandingHome.tsx
// - web/frontend/src/features/landing/LandingOfferPage.tsx
// - web/frontend/src/pages/public/EventApplyPage.tsx
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/shared/ui/cn";

export type LandingRailItem = { id: string; label: string };

type RailEntry = { key: string; label: string; el: HTMLElement };

function resolveEntries(items?: LandingRailItem[]): RailEntry[] {
  if (items) {
    const out: RailEntry[] = [];
    for (const item of items) {
      const el = document.getElementById(item.id);
      if (el) out.push({ key: item.id, label: item.label, el });
    }
    return out;
  }
  return [...document.querySelectorAll<HTMLElement>("[data-rail-label]")].map(
    (el, index) => ({
      key: el.id || `rail-${index}`,
      label: el.dataset.railLabel ?? "",
      el,
    }),
  );
}

/**
 * 우측 가장자리 섹션 내비(스크롤 스파이). 클릭하면 해당 섹션으로 부드럽게 이동한다.
 * `items` 가 없으면 페이지의 `[data-rail-label]` 요소를 자동으로 모은다(서브페이지).
 */
export function LandingSectionRail({ items }: { items?: LandingRailItem[] }) {
  const [entries, setEntries] = useState<RailEntry[]>([]);
  const [active, setActive] = useState("");

  useEffect(() => {
    const found = resolveEntries(items);
    setEntries(found);
    setActive(found[0]?.key ?? "");
  }, [items]);

  useEffect(() => {
    if (entries.length < 2 || typeof IntersectionObserver === "undefined") {
      return undefined;
    }
    const byEl = new Map(entries.map((entry) => [entry.el, entry.key]));
    const observer = new IntersectionObserver(
      (records) => {
        for (const record of records) {
          const key = byEl.get(record.target as HTMLElement);
          if (record.isIntersecting && key) setActive(key);
        }
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
    );
    for (const entry of entries) observer.observe(entry.el);
    return () => observer.disconnect();
  }, [entries]);

  if (entries.length < 2) return null;

  const go = (el: HTMLElement) => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  };

  return createPortal(
    <nav
      aria-label="섹션 이동"
      className="fixed right-3 top-1/2 z-40 hidden -translate-y-1/2 flex-col items-end gap-3.5 md:flex lg:right-5"
    >
      {entries.map((entry) => {
        const on = entry.key === active;
        return (
          <button
            key={entry.key}
            type="button"
            aria-label={entry.label}
            aria-current={on ? "true" : undefined}
            onClick={(event) => {
              go(entry.el);
              event.currentTarget.blur();
            }}
            className="group relative flex h-3 w-9 items-center justify-end outline-none"
          >
            <span className="pointer-events-none absolute right-full mr-3 whitespace-nowrap rounded-full bg-[#0b2a5c] px-2.5 py-1 text-[11px] font-medium text-white opacity-0 shadow-md transition-opacity delay-0 group-hover:opacity-100 group-hover:delay-[600ms] group-focus-visible:opacity-100">
              {entry.label}
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
