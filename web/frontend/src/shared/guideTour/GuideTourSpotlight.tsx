// related files:
// - web/frontend/src/shared/guideTour/GuideTourProvider.tsx
// - web/frontend/src/shared/guideTour/scrollGuideTourTarget.ts
// - web/frontend/src/index.css
// - web/frontend/src/shared/components/practice/PracticeOrderArrivalDateRangeField.tsx
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// change-log:
// - 2026-09-05: oral_calendar — 사이드바·캘린더 별도 홀(위성 union 대신). 카드는 캘린더 위.
// - 2026-09-05: 영화형 — blur·홀 클릭 차단. allowTargetInteraction만 홀 통과(4·5번).
// - 2026-09-05: 코치카드 — guide-tour-root(z-420) 밖 별도 레이어(z-440). 루트 안 z-440은 중첩 모달(z-425)에 가려짐.
// - 2026-09-05: oral_send — 작성 패널 스크롤 후 하이라이트(견적→전송).
// - 2026-09-05: 치식 홀이 커스텀어벗 모달 위에 남는 문제 — 타깃 변경 시 rect 즉시 클리어·모달 우선 측정.
// - 2026-09-05: 큰 모달 타깃(임플란트·어벗 프리셋) — 코치마크를 뷰포트/모달 위에 두어 잘림 방지.
// - 2026-09-05: 하이라이트 — 팝오버 zoom 애니메이션 후 재측정·PAD 확대·링 inset 제거.
// - 2026-09-05: 위성(data-guide-tour-satellite) 홀 확장·카드 회피. 드롭다운 타깃은 코치마크 오른쪽.
// - 2026-09-05: outline 버튼 hover 글자 — accent-foreground(흰) 덮어써 안 보이던 문제 수정.
// - 2026-09-05: 치식 타깃 스크롤 — data-guide-tour-scroll + 지연 재시도(타깃 DOM 동기화 대기).
// - 2026-09-05: 버튼 순서 — 다음에 하기 · (뒤로·건너뛰기·다음 오른쪽).
// - 2026-09-05: 코치마크 가로폭 — 메시지 max-content(가급적 1줄), 뷰포트만 상한.
// - 2026-09-05: oral_lab — 코치마크를 필드 오른쪽 고정. 타깃과 절대 겹치지 않게 배치.
// - 2026-09-05: 건너뛰기 버튼(챕터3).
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  COMPOSE_SCROLL_GUIDE_TARGETS,
  CUSTOM_ABUT_GUIDE_TARGETS,
  scrollComposeGuideTargetIntoView,
  scrollToothChartGuideTargetIntoView,
  TOOTH_CHART_GUIDE_TARGETS,
} from "@/shared/guideTour/scrollGuideTourTarget";
import { cn } from "@/shared/ui/cn";

type Rect = { top: number; left: number; width: number; height: number };

/** 하이라이트·홀이 대상보다 작게 잡히지 않도록(링/그림자 여유) */
const PAD = 12;
const CARD_GAP = 16;
const VIEW_PAD = 16;
const CARD_H_FALLBACK = 160;
const CARD_W_FALLBACK = 20 * 16;
/** 팝오버 zoom-in 등 transform 종료 후 재측정 */
const REMEASURE_AFTER_MS = [0, 50, 120, 220, 360, 520] as const;

/** 아래로 열리는 팝오버/드롭다운 — 코치마크는 옆(오른쪽)에 두어 설명 대상을 가리지 않음 */
const DROPDOWN_BELOW_TARGETS = new Set(["oral_header"]);
/** 커스텀어벗 설정 모달 — 큰 타깃, 코치마크는 위쪽 */
const PRESET_MODAL_TARGETS = CUSTOM_ABUT_GUIDE_TARGETS;
/** 위성은 union하지 않고 별도 홀(사이드바 메뉴 + 캘린더) */
const SEPARATE_SATELLITE_TARGETS = new Set(["oral_calendar"]);
/** 코치마크를 타깃 위에 고정 */
const PREFER_ABOVE_TARGETS = new Set(["oral_calendar"]);

function readElRect(el: Element | null): Rect | null {
  if (!el || !(el instanceof HTMLElement)) return null;
  // Radix popper wrapper — Content의 zoom transform에 덜 흔들림
  const measureEl =
    (el.closest(
      "[data-radix-popper-content-wrapper]",
    ) as HTMLElement | null) || el;
  const r = measureEl.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;
  return {
    top: Math.max(0, r.top - PAD),
    left: Math.max(0, r.left - PAD),
    width: r.width + PAD * 2,
    height: r.height + PAD * 2,
  };
}

function unionRect(a: Rect, b: Rect): Rect {
  const top = Math.min(a.top, b.top);
  const left = Math.min(a.left, b.left);
  const right = Math.max(a.left + a.width, b.left + b.width);
  const bottom = Math.max(a.top + a.height, b.top + b.height);
  return { top, left, width: right - left, height: bottom - top };
}

/** 커스텀어벗 설정 등 투어 중 중첩 모달 — 치식 홀보다 우선 */
const NESTED_GUIDE_DIALOG_SELECTOR = ".guide-tour-nested-dialog";

function readNestedGuideDialogRect(): Rect | null {
  const el = document.querySelector(NESTED_GUIDE_DIALOG_SELECTOR);
  return readElRect(el);
}

function readSatelliteRects(target: string): Rect[] {
  const out: Rect[] = [];
  document
    .querySelectorAll(`[data-guide-tour-satellite="${CSS.escape(target)}"]`)
    .forEach((el) => {
      const sat = readElRect(el);
      if (sat) out.push(sat);
    });
  return out;
}

/**
 * 타깃(+위성) 홀 목록.
 * oral_calendar 등 SEPARATE_SATELLITE — 위성 별도 홀.
 * 그 외 — 위성은 union으로 하나의 홀.
 */
function readSpotlightRects(target: string | null | undefined): Rect[] {
  if (!target) return [];

  // 보철물(치식) 타깃인데 커스텀어벗 모달이 열려 있으면 모달 크기로 맞춤.
  if (TOOTH_CHART_GUIDE_TARGETS.has(target)) {
    const nested = readNestedGuideDialogRect();
    if (nested) return [nested];
  }

  const primary = document.querySelector(
    `[data-guide-tour="${CSS.escape(target)}"]`,
  );
  const primaryRect = readElRect(primary);
  if (!primaryRect) {
    if (CUSTOM_ABUT_GUIDE_TARGETS.has(target)) {
      const nested = readNestedGuideDialogRect();
      return nested ? [nested] : [];
    }
    return [];
  }

  const satellites = readSatelliteRects(target);
  if (satellites.length === 0) return [primaryRect];

  if (SEPARATE_SATELLITE_TARGETS.has(target)) {
    // 사이드바 메뉴를 앞에, 캘린더(primary)를 앵커로 뒤에
    return [...satellites, primaryRect];
  }

  let hole = primaryRect;
  for (const sat of satellites) {
    hole = unionRect(hole, sat);
  }
  return [hole];
}

function buildHoleMaskImage(rects: Rect[], vw: number, vh: number): string {
  const holes = rects
    .map(
      (r) =>
        `<rect x="${r.left}" y="${r.top}" width="${r.width}" height="${r.height}" rx="8" fill="black"/>`,
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${vw}" height="${vh}"><rect width="100%" height="100%" fill="white"/>${holes}</svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

/** evenodd 경로 — 홀 밖만 클릭 캡처 */
function buildEvenOddHitPath(rects: Rect[], vw: number, vh: number): string {
  const outer = `M0,0H${vw}V${vh}H0Z`;
  const holes = rects
    .map((r) => {
      const x = r.left;
      const y = r.top;
      const w = r.width;
      const h = r.height;
      return `M${x},${y}h${w}v${h}h${-w}Z`;
    })
    .join("");
  return `${outer}${holes}`;
}

type CardPlacement =
  | { mode: "center" }
  | { mode: "anchored"; top: number; left: number };

type PlacePrefer = "auto" | "above" | "below" | "right";

function overlapsAnyTarget(
  top: number,
  left: number,
  cardW: number,
  cardH: number,
  rects: Rect[],
): boolean {
  const cardRight = left + cardW;
  const cardBottom = top + cardH;
  return rects.some((rect) => {
    const targetRight = rect.left + rect.width;
    const targetBottom = rect.top + rect.height;
    return !(
      cardRight <= rect.left ||
      left >= targetRight ||
      cardBottom <= rect.top ||
      top >= targetBottom
    );
  });
}

function placeCardNearTarget(
  rects: Rect[],
  cardSize: { width: number; height: number },
  prefer: PlacePrefer = "auto",
): CardPlacement {
  // 앵커는 primary(마지막 — separate 시 캘린더) 또는 단일 홀
  const rect = rects.length > 0 ? rects[rects.length - 1]! : null;
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
    if (overlapsAnyTarget(top, left, cardW, cardH, rects)) return null;
    return { mode: "anchored", top, left };
  };

  const rightLeft = rect.left + rect.width + CARD_GAP;
  const leftLeft = rect.left - CARD_GAP - cardW;
  const belowTop = rect.top + rect.height + CARD_GAP;
  const aboveTop = rect.top - CARD_GAP - cardH;
  const midTop = Math.max(
    VIEW_PAD,
    Math.min(vh - VIEW_PAD - cardH, rect.top + (rect.height - cardH) / 2),
  );
  const centerLeft = Math.max(VIEW_PAD, (vw - cardW) / 2);

  // 큰 모달: 옆·아래 공간이 거의 없음 → 모달 위 또는 뷰포트 상단
  if (rect.height >= vh * 0.42) {
    const aboveCentered = tryPlace(aboveTop, centerLeft);
    if (aboveCentered) return aboveCentered;
    const aboveLeft = tryPlace(aboveTop, Math.max(VIEW_PAD, rect.left));
    if (aboveLeft) return aboveLeft;
    return { mode: "anchored", top: VIEW_PAD, left: centerLeft };
  }

  const candidates: Array<{ top: number; left: number }> = [];

  if (prefer === "right") {
    candidates.push(
      { top: midTop, left: rightLeft },
      { top: rect.top, left: rightLeft },
      { top: midTop, left: leftLeft },
      { top: rect.top, left: leftLeft },
      { top: aboveTop, left: rect.left },
      { top: belowTop, left: rect.left },
    );
  } else if (prefer === "above") {
    candidates.push(
      { top: aboveTop, left: rect.left },
      { top: aboveTop, left: centerLeft },
      { top: belowTop, left: rect.left },
      { top: midTop, left: rightLeft },
      { top: midTop, left: leftLeft },
    );
  } else if (prefer === "below") {
    candidates.push(
      { top: belowTop, left: rect.left },
      { top: aboveTop, left: rect.left },
      { top: midTop, left: rightLeft },
      { top: midTop, left: leftLeft },
    );
  } else {
    // auto: 옆 → 위 → 아래 (아래로 열리는 UI와 겹침 최소화)
    candidates.push(
      { top: midTop, left: rightLeft },
      { top: midTop, left: leftLeft },
      { top: aboveTop, left: rect.left },
      { top: belowTop, left: rect.left },
      { top: rect.top, left: rightLeft },
      { top: rect.top, left: leftLeft },
    );
  }

  for (const c of candidates) {
    const placed = tryPlace(c.top, c.left);
    if (placed) return placed;
  }

  const bottomCenterTop = vh - VIEW_PAD - cardH;
  const bottom = tryPlace(bottomCenterTop, centerLeft);
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
  /** true면 하이라이트 홀 클릭 통과(보철물 카드·커스텀어벗 체험) */
  allowTargetInteraction?: boolean;
  onBack: () => void;
  onNext: () => void;
  onSkip?: () => void;
  onPause: () => void;
  className?: string;
};

/** 대상만 선명, 나머지는 블러·딤. 코치마크(다음에 하기 · 뒤로·건너뛰기·다음). 기본은 홀 포함 클릭 차단. */
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
  allowTargetInteraction = false,
  onBack,
  onNext,
  onSkip,
  onPause,
  className,
}: GuideTourSpotlightProps) {
  const [rects, setRects] = useState<Rect[]>(() => readSpotlightRects(target));
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [cardSize, setCardSize] = useState({ width: 0, height: 0 });
  const [placement, setPlacement] = useState<CardPlacement>({ mode: "center" });
  const [viewport, setViewport] = useState(() => ({
    w: typeof window !== "undefined" ? window.innerWidth : 0,
    h: typeof window !== "undefined" ? window.innerHeight : 0,
  }));

  useEffect(() => {
    // 이전 스텝(치식) 홀이 한 프레임이라도 남지 않게 즉시 비움
    setRects([]);

    let observed: HTMLElement | null = null;
    const satelliteObserved = new Set<Element>();
    const pendingTimers: number[] = [];
    let remasureGeneration = 0;
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            setRects(readSpotlightRects(target));
          })
        : null;

    const measure = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
      setRects(readSpotlightRects(target));
    };

    const scheduleRemeasure = () => {
      remasureGeneration += 1;
      const gen = remasureGeneration;
      measure();
      for (const ms of REMEASURE_AFTER_MS) {
        pendingTimers.push(
          window.setTimeout(() => {
            if (gen !== remasureGeneration) return;
            measure();
          }, ms),
        );
      }
    };

    const resolveTargetEl = (): HTMLElement | null => {
      if (!target) return null;
      const primary = document.querySelector(
        `[data-guide-tour="${CSS.escape(target)}"]`,
      ) as HTMLElement | null;
      if (primary) return primary;
      if (
        (target && CUSTOM_ABUT_GUIDE_TARGETS.has(target)) ||
        (target && TOOTH_CHART_GUIDE_TARGETS.has(target))
      ) {
        return document.querySelector(
          NESTED_GUIDE_DIALOG_SELECTOR,
        ) as HTMLElement | null;
      }
      return null;
    };

    const syncObservers = (opts?: { onNewSatellite?: boolean }) => {
      const el = resolveTargetEl();
      if (el && ro && observed !== el) {
        if (observed) ro.unobserve(observed);
        ro.observe(el);
        observed = el;
      }
      if (ro && target) {
        const sats = document.querySelectorAll(
          `[data-guide-tour-satellite="${CSS.escape(target)}"]`,
        );
        sats.forEach((sat) => {
          const wrap =
            (sat.closest(
              "[data-radix-popper-content-wrapper]",
            ) as HTMLElement | null) || (sat as HTMLElement);
          if (satelliteObserved.has(wrap)) return;
          ro.observe(wrap);
          satelliteObserved.add(wrap);
          if (opts?.onNewSatellite !== false) scheduleRemeasure();
        });
      }
    };

    const syncScrollAndMeasure = () => {
      const el = resolveTargetEl();
      if (
        el &&
        target &&
        TOOTH_CHART_GUIDE_TARGETS.has(target) &&
        el.hasAttribute("data-tooth-chart")
      ) {
        scrollToothChartGuideTargetIntoView(el);
      } else if (el && target && COMPOSE_SCROLL_GUIDE_TARGETS.has(target)) {
        scrollComposeGuideTargetIntoView(el);
      }
      measure();
      syncObservers({ onNewSatellite: false });
    };

    syncScrollAndMeasure();
    scheduleRemeasure();
    for (const ms of [50, 150, 320, 600, 900] as const) {
      pendingTimers.push(window.setTimeout(syncScrollAndMeasure, ms));
    }
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);

    const mo =
      typeof MutationObserver !== "undefined"
        ? new MutationObserver(() => {
            const before = satelliteObserved.size;
            const prevObserved = observed;
            syncObservers({ onNewSatellite: false });
            // 중첩 모달 등장·data-guide-tour 이동 시 강제 재측정
            if (
              satelliteObserved.size !== before ||
              observed !== prevObserved ||
              Boolean(document.querySelector(NESTED_GUIDE_DIALOG_SELECTOR))
            ) {
              scheduleRemeasure();
            } else {
              measure();
            }
          })
        : null;
    mo?.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-guide-tour", "data-guide-tour-satellite"],
    });

    return () => {
      remasureGeneration += 1;
      for (const id of pendingTimers) window.clearTimeout(id);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      ro?.disconnect();
      mo?.disconnect();
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
    if (rects.length === 0) {
      setPlacement({ mode: "center" });
      return;
    }
    // 실측 전 fallback으로 한 번 튀지 않게 — 측정 후에만 고정 배치
    if (cardSize.width <= 0 || cardSize.height <= 0) return;
    const prefer: PlacePrefer =
      target && DROPDOWN_BELOW_TARGETS.has(target)
        ? "right"
        : target &&
            (TOOTH_CHART_GUIDE_TARGETS.has(target) ||
              PRESET_MODAL_TARGETS.has(target) ||
              PREFER_ABOVE_TARGETS.has(target))
          ? "above"
          : "auto";
    setPlacement(placeCardNearTarget(rects, cardSize, prefer));
  }, [rects, cardSize, target]);

  const maskImage = useMemo(() => {
    if (rects.length === 0 || viewport.w <= 0 || viewport.h <= 0) return null;
    return buildHoleMaskImage(rects, viewport.w, viewport.h);
  }, [rects, viewport.h, viewport.w]);

  const hitPath = useMemo(() => {
    if (rects.length === 0 || viewport.w <= 0 || viewport.h <= 0) return null;
    return buildEvenOddHitPath(rects, viewport.w, viewport.h);
  }, [rects, viewport.h, viewport.w]);

  const card = (
    <div
      ref={cardRef}
      role="status"
      className={cn(
        "pointer-events-auto inline-flex w-max max-w-[calc(100vw-2rem)] flex-col rounded-xl border border-accent-muted bg-accent-soft px-6 py-5 shadow-lg shadow-accent/20",
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

  // z-420 blur(클릭 차단) · z-425 nested dialog · z-430 popper · z-440 card(루트 밖)
  const blurLayer = (
    <div className="guide-tour-root pointer-events-none fixed inset-0 z-[420]">
      {rects.length > 0 && maskImage && hitPath ? (
        <>
          <div
            className="guide-tour-blur pointer-events-none absolute inset-0"
            style={{
              WebkitMaskImage: maskImage,
              maskImage,
            }}
            aria-hidden
          />
          {/* 마스크는 페인팅만 — 홀 밖 클릭은 evenodd SVG로 차단 */}
          <svg
            className="absolute inset-0 h-full w-full"
            width={viewport.w}
            height={viewport.h}
            aria-hidden
          >
            <path
              d={hitPath}
              fill="black"
              fillOpacity={0}
              fillRule="evenodd"
              pointerEvents="fill"
              className="pointer-events-auto"
            />
          </svg>
          {rects.map((rect, i) => (
            <div key={`hole-${i}`}>
              {!allowTargetInteraction ? (
                <div
                  className="pointer-events-auto absolute rounded-lg"
                  style={{
                    top: rect.top,
                    left: rect.left,
                    width: rect.width,
                    height: rect.height,
                  }}
                  aria-hidden
                />
              ) : null}
              <div
                className="pointer-events-none absolute rounded-lg outline outline-2 outline-accent outline-offset-2"
                style={{
                  top: rect.top,
                  left: rect.left,
                  width: rect.width,
                  height: rect.height,
                }}
                aria-hidden
              />
            </div>
          ))}
        </>
      ) : (
        <div
          className="guide-tour-blur pointer-events-auto absolute inset-0"
          aria-hidden
        />
      )}
    </div>
  );

  const cardLayer =
    placement.mode === "anchored" ? (
      <div
        className="pointer-events-none fixed z-[440]"
        style={{ top: placement.top, left: placement.left }}
      >
        {card}
      </div>
    ) : (
      <div className="pointer-events-none fixed inset-x-0 top-1/2 z-[440] flex -translate-y-1/2 justify-center px-4">
        {card}
      </div>
    );

  return createPortal(
    <>
      {blurLayer}
      {cardLayer}
    </>,
    document.body,
  );
}
