// related files:
// - web/frontend/src/shared/guideTour/GuideTourSpotlight.tsx
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// change-log:
// - 2026-09-05: 구강 9장 — 치식 prosthesis/card_ops, compose memo_files·estimate·send.
// - 2026-09-05: oral_send — 견적 다음 스텝에서 전송 버튼까지 자동 스크롤.
// - 2026-09-05: scrollComposeGuideTargetIntoView — 메모·파일 등 작성 패널 타깃.
// - 2026-09-05: 치식 가이드투어 — 작성 패널 data-guide-tour-scroll만 스크롤(조상 window 금지).

/** 치식 위 코치마크 자리 */
export const TOOTH_CHART_COACH_RESERVE_PX = 168;

export const TOOTH_CHART_GUIDE_STEP_IDS = ["card_ops"] as const;

export const TOOTH_CHART_GUIDE_TARGETS = new Set([
  "oral_card_ops",
  // 레거시
  "oral_prosthesis",
]);

/** 메모·파일·견적·전송 — 작성 스크롤 영역에서 타깃이 보이게 */
export const COMPOSE_SCROLL_GUIDE_TARGETS = new Set([
  "oral_memo_files",
  "oral_phone",
  "oral_estimate",
  "oral_send",
  "oral_header",
]);

/** 커스텀어벗 설정 모달 타깃(시네마 3장) */
export const CUSTOM_ABUT_GUIDE_TARGETS = new Set([
  "oral_custom_abut_implant",
  "oral_custom_abut_scanbody",
  "oral_custom_abut_simple",
  // 레거시
  "oral_custom_abut",
]);

function findGuideTourScroller(el: HTMLElement): HTMLElement | null {
  const marked = el.closest(
    "[data-guide-tour-scroll]",
  ) as HTMLElement | null;
  if (marked) return marked;

  let scroller: HTMLElement | null = el.parentElement;
  while (scroller) {
    const { overflowY } = window.getComputedStyle(scroller);
    if (
      overflowY === "auto" ||
      overflowY === "scroll" ||
      overflowY === "overlay"
    ) {
      return scroller;
    }
    scroller = scroller.parentElement;
  }
  return null;
}

/**
 * 치식(data-tooth-chart) 타깃이 코치마크+상·하악과 함께 보이도록
 * 작성 Dialog 스크롤 컨테이너만 이동. behavior=auto(즉시) — smooth는 리렌더에 끊김.
 */
export function scrollToothChartGuideTargetIntoView(
  el: HTMLElement | null | undefined,
): boolean {
  if (!el || !el.hasAttribute("data-tooth-chart")) return false;
  const scroller = findGuideTourScroller(el);
  if (!scroller) return false;

  const elRect = el.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();
  if (elRect.height <= 0 || scrollerRect.height <= 0) return false;

  const delta = elRect.top - scrollerRect.top - TOOTH_CHART_COACH_RESERVE_PX;
  if (Math.abs(delta) < 8) return true;

  const nextTop = Math.max(0, scroller.scrollTop + delta);
  if (Math.abs(scroller.scrollTop - nextTop) < 8) return true;

  scroller.scrollTo({ top: nextTop, behavior: "auto" });
  return true;
}

/** 메모·파일 등 — 작성 패널 스크롤러에서 타깃이 보이도록 */
export function scrollComposeGuideTargetIntoView(
  el: HTMLElement | null | undefined,
  reserveTopPx = 96,
): boolean {
  if (!el) return false;
  const scroller = findGuideTourScroller(el);
  if (!scroller) return false;

  const elRect = el.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();
  if (elRect.height <= 0 || scrollerRect.height <= 0) return false;

  const visibleTop = scrollerRect.top + reserveTopPx;
  const visibleBottom = scrollerRect.bottom - 24;
  if (elRect.top >= visibleTop && elRect.bottom <= visibleBottom) return true;

  const delta = elRect.top - scrollerRect.top - reserveTopPx;
  const nextTop = Math.max(0, scroller.scrollTop + delta);
  if (Math.abs(scroller.scrollTop - nextTop) < 8) return true;

  scroller.scrollTo({ top: nextTop, behavior: "auto" });
  return true;
}
