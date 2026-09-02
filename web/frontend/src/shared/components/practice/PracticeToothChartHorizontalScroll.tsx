// related files:
// - web/frontend/src/shared/components/practice/PracticeToothWorkChartReadOnly.tsx
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/index.css (custom-scrollbar-x)
// - 2026-09-02: w-max inline 트랙 + pr-4 + scroll-padding — 끝 치아까지 스크롤.
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/shared/ui/cn";

type PracticeToothChartHorizontalScrollProps = {
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
};

export function PracticeToothChartHorizontalScroll({
  children,
  className,
  ariaLabel,
}: PracticeToothChartHorizontalScrollProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
    setCanScrollLeft(maxScroll > 2 && el.scrollLeft > 2);
    setCanScrollRight(maxScroll > 2 && el.scrollLeft < maxScroll - 2);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    updateScrollState();
    const ro = new ResizeObserver(() => updateScrollState());
    ro.observe(el);
    for (const child of Array.from(el.children)) {
      if (child instanceof Element) ro.observe(child);
    }
    return () => ro.disconnect();
  }, [updateScrollState, children]);

  return (
    <div className={cn("relative isolate w-full min-w-0 max-w-full", className)}>
      <div
        ref={scrollRef}
        className="custom-scrollbar-x w-full min-w-0 max-w-full touch-pan-x overflow-x-auto overscroll-x-contain pb-1.5 [-webkit-overflow-scrolling:touch] [scroll-padding-inline-end:1rem]"
        aria-label={ariaLabel}
        onScroll={updateScrollState}
      >
        <div className="flex w-max max-w-none flex-nowrap pr-4">{children}</div>
      </div>
      {canScrollLeft ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-3 bg-gradient-to-r from-background via-background/80 to-transparent"
        />
      ) : null}
      {canScrollRight ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-3 bg-gradient-to-l from-background via-background/80 to-transparent"
        />
      ) : null}
    </div>
  );
}
