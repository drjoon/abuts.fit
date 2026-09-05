// related files:
// - web/frontend/src/shared/guideTour/GuideTourProvider.tsx
// - web/frontend/src/shared/guideTour/scrollGuideTourTarget.ts
// - web/frontend/src/index.css
// change-log:
// - 2026-09-05: outline 버튼 hover 글자 — accent-foreground(흰) 덮어써 안 보이던 문제 수정.
// - 2026-09-05: 치식 타깃 스크롤 — data-guide-tour-scroll + 지연 재시도(타깃 DOM 동기화 대기).
// - 2026-09-05: 버튼 순서 — 다음에 하기 · (뒤로·건너뛰기·다음 오른쪽).
// - 2026-09-05: 코치마크 가로폭 32rem(기존 26→42는 과대).
// - 2026-09-05: oral_lab — 코치마크를 필드 오른쪽 고정. 타깃과 절대 겹치지 않게 배치.
// - 2026-09-05: 건너뛰기 버튼(챕터3).
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  scrollToothChartGuideTargetIntoView,
  TOOTH_CHART_GUIDE_TARGETS,
} from "@/shared/guideTour/scrollGuideTourTarget";
import { cn } from "@/shared/ui/cn";

type Rect = { top: number; left: number; width: number; height: number };

const PAD = 8;
const CARD_GAP = 16;
const VIEW_PAD = 16;
const CARD_H_FALLBACK = 160;
const CARD_W_FALLBACK = 32 * 16;

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

type PlacePrefer = "auto" | "above" | "below" | "right";

function overlapsTarget(
  top: number,
  left: number,
  cardW: number,
  cardH: number,
  rect: Rect,
): boolean {
  const cardRight = left + cardW;
  const cardBottom = top + cardH;
  const targetRight = rect.left + rect.width;
  const targetBottom = rect.top + rect.height;
  return !(
    cardRight <= rect.left ||
    left >= targetRight ||
    cardBottom <= rect.top ||
    top >= targetBottom
  );
}

function placeCardNearTarget(
  rect: Rect | null,
  cardSize: { width: number; height: number },
  prefer: PlacePrefer = "auto",
): CardPlacement {
  if (!rect) return { mode: "center" };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cardW = Math.min(
    cardSize.width || Math.min(vw - VIEW_PAD * 2, CARD_W_FALLBACK),
    vw - VIEW_PAD * 2,
  );
  const cardH = cardSize.height || CARD_H_FALLBACK;

  const fitsViewport = (top: number, left: number) =>
    top >= VIEW_PAD &&
    left >= VIEW_PAD &&
    top + cardH <= vh - VIEW_PAD &&
    left + cardW <= vw - VIEW_PAD;

  const tryPlace = (top: number, left: number): CardPlacement | null => {
    if (!fitsViewport(top, left)) return null;
    if (overlapsTarget(top, left, cardW, cardH, rect)) return null;
    return { mode: "anchored", top, left };
  };

  const rightLeft = rect.left + rect.width + CARD_GAP;
  const leftLeft = rect.left - CARD_GAP - cardW;
  const belowTop = rect.top + rect.height + CARD_GAP;
  const aboveTop = rect.top - CARD_GAP - cardH;

  const candidates: Array<{ top: number; left: number }> = [];

  if (prefer === "right") {
    candidates.push(
      { top: rect.top, left: rightLeft },
      { top: rect.top, left: leftLeft },
      { top: belowTop, left: rect.left },
      { top: aboveTop, left: rect.left },
    );
  } else if (prefer === "above") {
    candidates.push(
      { top: aboveTop, left: rect.left },
      { top: belowTop, left: rect.left },
      { top: rect.top, left: rightLeft },
      { top: rect.top, left: leftLeft },
    );
  } else if (prefer === "below") {
    candidates.push(
      { top: belowTop, left: rect.left },
      { top: aboveTop, left: rect.left },
      { top: rect.top, left: rightLeft },
      { top: rect.top, left: leftLeft },
    );
  } else {
    candidates.push(
      { top: belowTop, left: rect.left },
      { top: aboveTop, left: rect.left },
      { top: rect.top, left: rightLeft },
      { top: rect.top, left: leftLeft },
    );
  }

  for (const c of candidates) {
    const placed = tryPlace(c.top, c.left);
    if (placed) return placed;
  }

  const bottomCenterTop = vh - VIEW_PAD - cardH;
  const bottomCenterLeft = Math.max(VIEW_PAD, (vw - cardW) / 2);
  const bottom = tryPlace(bottomCenterTop, bottomCenterLeft);
  if (bottom) return bottom;

  return { mode: "center" };
}

type GuideTourSpotlightProps = {
  stepIndex: number;
  stepTotal: number;
  title: string;
  hint: string;
  target?: string | null;
  showBack: boolean;
  showNext: boolean;
  showSkip?: boolean;
  nextLabel?: string;
  onBack: () => void;
  onNext: () => void;
  onSkip?: () => void;
  onPause: () => void;
  className?: string;
};

/** 대상만 선명, 나머지는 블러·딤. 코치마크(다음에 하기 · 뒤로·건너뛰기·다음). action 스텝도「다음」표시. */
export function GuideTourSpotlight({
  stepIndex,
  stepTotal,
  title,
  hint,
  target,
  showBack,
  showNext,
  showSkip = false,
  nextLabel = "다음",
  onBack,
  onNext,
  onSkip,
  onPause,
  className,
}: GuideTourSpotlightProps) {
  const [rect, setRect] = useState<Rect | null>(() => readTargetRect(target));
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [cardSize, setCardSize] = useState({ width: 0, height: 0 });
  const [placement, setPlacement] = useState<CardPlacement>({ mode: "center" });

  useEffect(() => {
    let observed: HTMLElement | null = null;
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            setRect(readTargetRect(target));
          })
        : null;

    const measure = () => setRect(readTargetRect(target));

    const syncScrollAndMeasure = () => {
      const el = target
        ? (document.querySelector(
            `[data-guide-tour="${CSS.escape(target)}"]`,
          ) as HTMLElement | null)
        : null;
      if (el && target && TOOTH_CHART_GUIDE_TARGETS.has(target)) {
        scrollToothChartGuideTargetIntoView(el);
      }
      measure();
      if (el && ro && observed !== el) {
        if (observed) ro.unobserve(observed);
        ro.observe(el);
        observed = el;
      }
    };

    // 타깃 data-guide-tour는 패널 oral 스텝 동기화 후에 붙음 — 즉시+지연 재시도
    syncScrollAndMeasure();
    const timers = [50, 150, 320, 600].map((ms) =>
      window.setTimeout(syncScrollAndMeasure, ms),
    );
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      for (const id of timers) window.clearTimeout(id);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
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
  }, [stepIndex, title, hint, showBack, showNext, showSkip]);

  useLayoutEffect(() => {
    if (!rect) {
      setPlacement({ mode: "center" });
      return;
    }
    // 실측 전 fallback으로 한 번 튀지 않게 — 측정 후에만 고정 배치
    if (cardSize.width <= 0 || cardSize.height <= 0) return;
    // 기공소: 드롭다운은 아래·코치마크는 오른쪽 — 겹침·위치 튐 방지
    // 치식: 스크롤로 위 여유를 만든 뒤 코치마크를 타깃 위에
    const prefer: PlacePrefer =
      target === "oral_lab"
        ? "right"
        : target && TOOTH_CHART_GUIDE_TARGETS.has(target)
          ? "above"
          : "auto";
    setPlacement(placeCardNearTarget(rect, cardSize, prefer));
  }, [rect, cardSize, target]);

  const card = (
    <div
      ref={cardRef}
      role="status"
      className={cn(
        "pointer-events-auto relative z-[421] w-[min(100%,32rem)] max-w-lg rounded-xl border border-accent-muted bg-accent-soft px-6 py-5 shadow-lg shadow-accent/20",
        className,
      )}
    >
      <p className="text-sm font-semibold text-accent-strong">
        {stepTotal > 0 ? `${title} · ${stepIndex + 1}/${stepTotal}` : title}
      </p>
      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600">
        {hint}
      </p>
      <div className="mt-5 flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 border-accent-muted bg-white/80 px-3 text-sm text-accent-strong hover:bg-white hover:text-accent-strong"
            onClick={onPause}
          >
            다음에 하기
          </Button>
          <div className="ml-auto flex items-center gap-2">
            {showBack ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 border-accent-muted bg-white/80 px-3 text-sm text-accent-strong hover:bg-white hover:text-accent-strong"
                onClick={onBack}
              >
                뒤로
              </Button>
            ) : null}
            {showSkip && onSkip ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 border-accent-muted bg-white/80 px-3 text-sm text-accent-strong hover:bg-white hover:text-accent-strong"
                onClick={onSkip}
              >
                건너뛰기
              </Button>
            ) : null}
            {showNext ? (
              <Button
                type="button"
                size="sm"
                className="h-8 bg-accent px-4 text-sm text-accent-foreground hover:bg-accent-strong hover:text-accent-foreground"
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
