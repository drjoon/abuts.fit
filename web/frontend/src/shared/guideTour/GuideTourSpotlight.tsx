// related files:
// - web/frontend/src/shared/guideTour/GuideTourProvider.tsx
// - web/frontend/src/index.css
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/ui/cn";

type Rect = { top: number; left: number; width: number; height: number };

const PAD = 8;
const CARD_GAP = 12;
const VIEW_PAD = 16;
const CARD_H_FALLBACK = 160;

function readTargetRect(target: string | null | undefined): Rect | null {
  if (!target) return null;
  const el = document.querySelector(
    `[data-guide-tour="${CSS.escape(target)}"]`,
  ) as HTMLElement | null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;
  return {
    top: Math.max(0, r.top - PAD),
    left: Math.max(0, r.left - PAD),
    width: r.width + PAD * 2,
    height: r.height + PAD * 2,
  };
}

type CardPlacement =
  | { mode: "center" }
  | { mode: "anchored"; top: number; left: number };

function placeCardNearTarget(
  rect: Rect | null,
  cardSize: { width: number; height: number },
): CardPlacement {
  if (!rect) return { mode: "center" };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cardW = Math.min(
    cardSize.width || Math.min(vw - VIEW_PAD * 2, 26 * 16),
    vw - VIEW_PAD * 2,
  );
  const cardH = cardSize.height || CARD_H_FALLBACK;

  const belowTop = rect.top + rect.height + CARD_GAP;
  const aboveTop = rect.top - CARD_GAP - cardH;
  const spaceBelow = vh - VIEW_PAD - belowTop;
  const spaceAbove = rect.top - VIEW_PAD - CARD_GAP;

  let top: number;
  if (spaceBelow >= cardH || spaceBelow >= spaceAbove) {
    top = Math.min(belowTop, Math.max(VIEW_PAD, vh - VIEW_PAD - cardH));
  } else {
    top = Math.max(VIEW_PAD, aboveTop);
  }

  // 타깃 왼쪽 정렬, 뷰포트 안으로 클램프
  let left = rect.left;
  left = Math.min(Math.max(VIEW_PAD, left), vw - VIEW_PAD - cardW);

  return { mode: "anchored", top, left };
}

type GuideTourSpotlightProps = {
  stepIndex: number;
  stepTotal: number;
  title: string;
  hint: string;
  target?: string | null;
  showBack: boolean;
  showNext: boolean;
  nextLabel?: string;
  onBack: () => void;
  onNext: () => void;
  onPause: () => void;
  className?: string;
};

/** 대상만 선명, 나머지는 블러·딤. 코치마크(뒤로·다음에 하기·다음). */
export function GuideTourSpotlight({
  stepIndex,
  stepTotal,
  title,
  hint,
  target,
  showBack,
  showNext,
  nextLabel = "다음",
  onBack,
  onNext,
  onPause,
  className,
}: GuideTourSpotlightProps) {
  const [rect, setRect] = useState<Rect | null>(() => readTargetRect(target));
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [cardSize, setCardSize] = useState({ width: 0, height: 0 });
  const [placement, setPlacement] = useState<CardPlacement>({ mode: "center" });

  useEffect(() => {
    const update = () => setRect(readTargetRect(target));
    update();
    const t1 = window.setTimeout(update, 80);
    const t2 = window.setTimeout(update, 320);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    const el = target
      ? (document.querySelector(
          `[data-guide-tour="${CSS.escape(target)}"]`,
        ) as HTMLElement | null)
      : null;
    if (el && ro) ro.observe(el);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      ro?.disconnect();
    };
  }, [target, stepIndex]);

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setCardSize({ width: r.width, height: r.height });
    };
    measure();
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(measure)
        : null;
    if (ro) ro.observe(el);
    return () => ro?.disconnect();
  }, [stepIndex, title, hint, showBack, showNext]);

  useLayoutEffect(() => {
    setPlacement(placeCardNearTarget(rect, cardSize));
  }, [rect, cardSize]);

  const card = (
    <div
      ref={cardRef}
      role="status"
      className={cn(
        "pointer-events-auto relative z-[421] w-[min(100%,26rem)] max-w-md rounded-xl border border-accent-muted bg-accent-soft px-6 py-5 shadow-lg shadow-accent/20",
        className,
      )}
    >
      <p className="text-sm font-semibold text-accent-strong">
        {title} · {stepIndex + 1}/{stepTotal}
      </p>
      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600">
        {hint}
      </p>
      <div className="mt-5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {showBack ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 border-accent-muted px-3 text-sm text-accent-strong hover:bg-white/70"
              onClick={onBack}
            >
              뒤로
            </Button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 border-accent-muted px-3 text-sm text-accent-strong hover:bg-white/70"
            onClick={onPause}
          >
            다음에 하기
          </Button>
          {showNext ? (
            <Button
              type="button"
              size="sm"
              className="h-8 bg-accent px-4 text-sm text-accent-foreground hover:bg-accent-strong"
              onClick={onNext}
            >
              {nextLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );

  return createPortal(
    <div className="guide-tour-root pointer-events-none fixed inset-0 z-[420]">
      {rect ? (
        <>
          <div
            className="guide-tour-blur absolute left-0 right-0 top-0"
            style={{ height: rect.top }}
            aria-hidden
          />
          <div
            className="guide-tour-blur absolute bottom-0 left-0 right-0"
            style={{ top: rect.top + rect.height }}
            aria-hidden
          />
          <div
            className="guide-tour-blur absolute left-0"
            style={{
              top: rect.top,
              height: rect.height,
              width: rect.left,
            }}
            aria-hidden
          />
          <div
            className="guide-tour-blur absolute right-0"
            style={{
              top: rect.top,
              height: rect.height,
              left: rect.left + rect.width,
            }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute rounded-lg ring-2 ring-accent ring-offset-2 ring-offset-transparent"
            style={{
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
            }}
            aria-hidden
          />
        </>
      ) : (
        <div className="guide-tour-blur absolute inset-0" aria-hidden />
      )}
      {placement.mode === "anchored" ? (
        <div
          className="pointer-events-none absolute px-0"
          style={{ top: placement.top, left: placement.left }}
        >
          {card}
        </div>
      ) : (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center px-4">
          {card}
        </div>
      )}
    </div>,
    document.body,
  );
}
