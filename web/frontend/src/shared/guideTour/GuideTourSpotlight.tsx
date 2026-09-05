// related files:
// - web/frontend/src/shared/guideTour/GuideTourProvider.tsx
// - web/frontend/src/shared/guideTour/scrollGuideTourTarget.ts
// - web/frontend/src/index.css
// - web/frontend/src/shared/components/practice/PracticeOrderArrivalDateRangeField.tsx
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// change-log:
// - 2026-09-05: new_request_workspace — 사이드바「기공의뢰+어벗디자인으로」별도 홀(복수 satellite 키).
// - 2026-09-05: credits_* — 사이드바 위성 별칭·코치마크 중하단(탭·요약카드 노출).
// - 2026-09-05: credits_workspace — 사이드바 별도 홀·코치마크를 작업영역 중하단(탭·요약카드 노출).
// - 2026-09-05: oral_estimate — allowTargetInteraction으로 견적 호버·툴팁 가능.
// - 2026-09-05: card_ops·estimate 코치 — 오른쪽(견적 툴팁 중앙 가림 방지). 큰 치식 타깃도 동일.
// - 2026-09-05: oral_phone — 코치마크를 안내 문구 아래 가운데 정렬.
// - 2026-09-05: oral_phone — 코치마크 뷰포트 오른쪽 반쪽. 안내·폰 별도 홀.
// - 2026-09-05: oral_phone — below 우선·타깃 오른쪽 하단. 안내·폰 별도 홀.
// - 2026-09-05: oral_phone — 안내 문구·폰 미리보기 별도 홀(SEPARATE_SATELLITE).
// - 2026-09-05: 작성 Dialog(z-410) 블러 아래 유지 — outside dismiss 시 홀 소실 방지와 맞춤.
// - 2026-09-05: 멀티 홀 — 뷰포트−홀 블러 패널(홀 위 backdrop 없음). mask/blend 폐기.
// - 2026-09-05: oral_calendar — 사이드바·캘린더 별도 홀(위성 union 대신). 카드는 캘린더 위.
// - 2026-09-05: 영화형 — blur·홀 클릭 차단. allowTargetInteraction만 홀 통과(card_ops·custom_abut·estimate).
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
const DROPDOWN_BELOW_TARGETS = new Set(["oral_header", "oral_memo_files"]);
/** 커스텀어벗 설정 모달 — 큰 타깃, 코치마크는 위쪽 */
const PRESET_MODAL_TARGETS = CUSTOM_ABUT_GUIDE_TARGETS;
/** 위성은 union하지 않고 별도 홀(사이드바 메뉴 + 캘린더 · 폰 미리보기 + 안내 문구 · 정산 · 어벗 CNC) */
const SEPARATE_SATELLITE_TARGETS = new Set([
  "oral_calendar",
  "oral_phone",
  "credits_workspace",
  "credits_ledger",
  "credits_stats",
  "credits_charge",
  "new_request_workspace",
]);
/** 코치마크를 타깃 위에 고정 */
const PREFER_ABOVE_TARGETS = new Set([
  "oral_calendar",
  "oral_send",
]);
/** 코치마크를 타깃 아래·오른쪽에 고정 */
const PREFER_BELOW_TARGETS = new Set<string>([]);
/** 큰 작업영역 — 코치마크를 홀 중하단에 두어 상단 탭·요약카드를 가리지 않음 */
const PREFER_LOWER_IN_HOLE_TARGETS = new Set([
  "credits_workspace",
  "credits_ledger",
  "credits_stats",
  "credits_charge",
]);
/** 사이드바 위성 id가 스텝 target과 다를 때(정산 3탭) */
const SATELLITE_ALIAS: Record<string, string[]> = {
  credits_ledger: ["credits_workspace"],
  credits_stats: ["credits_workspace"],
  credits_charge: ["credits_workspace"],
};
/** 코치마크를 뷰포트 오른쪽(견적 중앙 툴팁과 겹침 회피: card_ops·estimate) */
const PREFER_RIGHT_HALF_TARGETS = new Set([
  "oral_card_ops",
  "oral_estimate",
]);
/** 코치마크를 primary 타깃 아래 가운데 정렬 */
const PREFER_BELOW_CENTER_TARGETS = new Set(["oral_phone"]);

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
  const keys = new Set([target, ...(SATELLITE_ALIAS[target] ?? [])]);
  document.querySelectorAll("[data-guide-tour-satellite]").forEach((el) => {
    const raw = el.getAttribute("data-guide-tour-satellite") || "";
    const elKeys = raw.trim().split(/\s+/).filter(Boolean);
    if (!elKeys.some((k) => keys.has(k))) return;
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
    // 사이드바 위성들(기공의뢰+구강스캔으로)은 하나의 홀로 union, 캘린더는 별도
    let sideHole: Rect | null = null;
    for (const sat of satellites) {
      sideHole = sideHole ? unionRect(sideHole, sat) : sat;
    }
    return sideHole ? [sideHole, primaryRect] : [primaryRect];
  }

  let hole = primaryRect;
  for (const sat of satellites) {
    hole = unionRect(hole, sat);
  }
  return [hole];
}

/** outer에서 hole을 뺀 직사각 조각(최대 4). backdrop-filter 홀에 안전. */
function subtractRect(outer: Rect, hole: Rect): Rect[] {
  const ox2 = outer.left + outer.width;
  const oy2 = outer.top + outer.height;
  const hx1 = Math.max(outer.left, hole.left);
  const hy1 = Math.max(outer.top, hole.top);
  const hx2 = Math.min(ox2, hole.left + hole.width);
  const hy2 = Math.min(oy2, hole.top + hole.height);
  if (hx1 >= hx2 || hy1 >= hy2) return [outer];

  const out: Rect[] = [];
  // top
  if (hy1 > outer.top) {
    out.push({
      top: outer.top,
      left: outer.left,
      width: outer.width,
      height: hy1 - outer.top,
    });
  }
  // bottom
  if (hy2 < oy2) {
    out.push({
      top: hy2,
      left: outer.left,
      width: outer.width,
      height: oy2 - hy2,
    });
  }
  // left (middle band)
  if (hx1 > outer.left) {
    out.push({
      top: hy1,
      left: outer.left,
      width: hx1 - outer.left,
      height: hy2 - hy1,
    });
  }
  // right (middle band)
  if (hx2 < ox2) {
    out.push({
      top: hy1,
      left: hx2,
      width: ox2 - hx2,
      height: hy2 - hy1,
    });
  }
  return out.filter((r) => r.width > 0.5 && r.height > 0.5);
}

/** 뷰포트 − 홀들 → 블러를 깔 직사각들(홀 위에는 블러 없음) */
function blurCoversMinusHoles(
  vw: number,
  vh: number,
  holes: Rect[],
): Rect[] {
  let covers: Rect[] = [{ top: 0, left: 0, width: vw, height: vh }];
  for (const hole of holes) {
    const next: Rect[] = [];
    for (const c of covers) {
      next.push(...subtractRect(c, hole));
    }
    covers = next;
  }
  return covers;
}

type CardPlacement =
  | { mode: "center" }
  | { mode: "anchored"; top: number; left: number };

type PlacePrefer =
  | "auto"
  | "above"
  | "below"
  | "belowCenter"
  | "right"
  | "rightHalf"
  | "lowerInHole";

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

  // 큰 모달/치식: 옆·아래 공간이 거의 없음 → prefer에 따라 상단·오른쪽·홀 중하단
  if (rect.height >= vh * 0.42) {
    if (prefer === "lowerInHole") {
      // 탭·요약카드 위쪽을 비우고 필터/테이블 쪽에 겹쳐 둠(홀 밖 공간이 없음)
      const lowerTop = Math.max(
        VIEW_PAD,
        Math.min(
          vh - VIEW_PAD - cardH,
          rect.top + Math.max(cardH + CARD_GAP, rect.height * 0.32),
        ),
      );
      return { mode: "anchored", top: lowerTop, left: centerLeft };
    }
    if (prefer === "rightHalf") {
      const rightLeft = Math.max(VIEW_PAD, vw - VIEW_PAD - cardW);
      const topRight = tryPlace(VIEW_PAD, rightLeft);
      if (topRight) return topRight;
      const midRight = tryPlace(
        Math.max(VIEW_PAD, Math.min(vh - VIEW_PAD - cardH, (vh - cardH) / 3)),
        rightLeft,
      );
      if (midRight) return midRight;
      return { mode: "anchored", top: VIEW_PAD, left: rightLeft };
    }
    const aboveCentered = tryPlace(aboveTop, centerLeft);
    if (aboveCentered) return aboveCentered;
    const aboveLeft = tryPlace(aboveTop, Math.max(VIEW_PAD, rect.left));
    if (aboveLeft) return aboveLeft;
    return { mode: "anchored", top: VIEW_PAD, left: centerLeft };
  }

  const candidates: Array<{ top: number; left: number }> = [];

  if (prefer === "rightHalf") {
    // 뷰포트 오른쪽 상단·중앙(견적 바·툴팁이 가운데에 있어 중앙 코치를 피함)
    const halfLeft = vw * 0.5;
    const regionW = vw * 0.5;
    const left = Math.max(
      VIEW_PAD,
      Math.min(
        vw - VIEW_PAD - cardW,
        halfLeft + (regionW - cardW) / 2,
      ),
    );
    const rightEdge = Math.max(VIEW_PAD, vw - VIEW_PAD - cardW);
    const upper = Math.max(VIEW_PAD, Math.min(vh - VIEW_PAD - cardH, vh * 0.12));
    const mid = Math.max(
      VIEW_PAD,
      Math.min(vh - VIEW_PAD - cardH, (vh - cardH) / 2),
    );
    const lower = Math.max(
      VIEW_PAD,
      Math.min(vh - VIEW_PAD - cardH, vh * 0.55),
    );
    candidates.push(
      { top: upper, left: rightEdge },
      { top: upper, left },
      { top: mid, left: rightEdge },
      { top: mid, left },
      { top: lower, left: rightEdge },
      { top: belowTop, left: rightEdge },
    );
  } else if (prefer === "right") {
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
  } else if (prefer === "belowCenter") {
    // primary(안내 문구) 바로 아래 · 가로 가운데
    const belowCenterLeft = Math.max(
      VIEW_PAD,
      Math.min(
        vw - VIEW_PAD - cardW,
        rect.left + (rect.width - cardW) / 2,
      ),
    );
    candidates.push(
      { top: belowTop, left: belowCenterLeft },
      { top: belowTop, left: Math.max(VIEW_PAD, rect.left) },
      { top: belowTop, left: centerLeft },
      { top: aboveTop, left: belowCenterLeft },
    );
  } else if (prefer === "below") {
    // 타깃 오른쪽 아래(파일 열 하단) 우선
    const belowRightLeft = Math.max(
      VIEW_PAD,
      Math.min(vw - VIEW_PAD - cardW, rect.left + rect.width - cardW),
    );
    candidates.push(
      { top: belowTop, left: belowRightLeft },
      { top: belowTop, left: rect.left },
      { top: belowTop, left: centerLeft },
      { top: aboveTop, left: belowRightLeft },
      { top: midTop, left: rightLeft },
      { top: midTop, left: leftLeft },
    );
  } else if (prefer === "lowerInHole") {
    const lowerTop = Math.max(
      VIEW_PAD,
      Math.min(
        vh - VIEW_PAD - cardH,
        rect.top + Math.max(cardH + CARD_GAP, rect.height * 0.32),
      ),
    );
    candidates.push(
      { top: lowerTop, left: centerLeft },
      { top: midTop, left: centerLeft },
      { top: belowTop, left: centerLeft },
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

  if (prefer === "lowerInHole") {
    const lowerTop = Math.max(
      VIEW_PAD,
      Math.min(
        vh - VIEW_PAD - cardH,
        rect.top + Math.max(cardH + CARD_GAP, rect.height * 0.32),
      ),
    );
    return { mode: "anchored", top: lowerTop, left: centerLeft };
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
        const want = new Set([target, ...(SATELLITE_ALIAS[target] ?? [])]);
        document.querySelectorAll("[data-guide-tour-satellite]").forEach((sat) => {
          const raw = sat.getAttribute("data-guide-tour-satellite") || "";
          const elKeys = raw.trim().split(/\s+/).filter(Boolean);
          if (!elKeys.some((k) => want.has(k))) return;
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
        : target && PREFER_BELOW_CENTER_TARGETS.has(target)
          ? "belowCenter"
          : target && PREFER_RIGHT_HALF_TARGETS.has(target)
            ? "rightHalf"
            : target && PREFER_LOWER_IN_HOLE_TARGETS.has(target)
              ? "lowerInHole"
              : target && PREFER_BELOW_TARGETS.has(target)
                ? "below"
                : target &&
                    (TOOTH_CHART_GUIDE_TARGETS.has(target) ||
                      PRESET_MODAL_TARGETS.has(target) ||
                      PREFER_ABOVE_TARGETS.has(target))
                  ? "above"
                  : "auto";
    setPlacement(placeCardNearTarget(rects, cardSize, prefer));
  }, [rects, cardSize, target]);

  const blurCovers = useMemo(() => {
    if (rects.length === 0 || viewport.w <= 0 || viewport.h <= 0) return [];
    return blurCoversMinusHoles(viewport.w, viewport.h, rects);
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
  // 홀 위에는 blur 패널을 아예 두지 않음(backdrop-filter mask/blend 회피)
  const blurLayer = (
    <div className="guide-tour-root pointer-events-none fixed inset-0 z-[420]">
      {rects.length > 0 ? (
        <>
          {blurCovers.map((cover, i) => (
            <div
              key={`blur-${i}`}
              className="guide-tour-blur pointer-events-auto absolute"
              style={{
                top: cover.top,
                left: cover.left,
                width: cover.width,
                height: cover.height,
              }}
              aria-hidden
            />
          ))}
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
