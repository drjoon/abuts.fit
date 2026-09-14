/**
 * 모바일 상단 액션 바 아래 전체화면 시트 — 채팅 패널과 동일 footprint·닫기 버튼.
 * related files:
 * - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
 * - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
 * - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
 * - web/frontend/src/shared/components/practice/PracticeRemakeSearchDialog.tsx
 * - web/frontend/src/shared/components/PastRequestsModal.tsx
 * - web/frontend/src/features/requestSettings/DesignSoftwareSettingsDialog.tsx
 * change-log:
 * - 2026-09-14: 모바일 시트 — 채팅과 같이 modal=false·outside-dismiss 금지(액션 전환 레이스).
 * - 2026-09-14: 치과·기공소 액션 모달을 채팅형 전체화면·X 스타일로 통일.
 */
import type { CSSProperties } from "react";
import { X } from "lucide-react";
import { cn } from "@/shared/ui/cn";

/** createPortal 액션 바에 붙이는 식별자 — Dialog outside 판별용 */
export const MOBILE_ACTION_CHROME_ATTR = "data-mobile-action-chrome";

/** PracticeTransferDetailChatDialog 모바일 닫기와 동일 */
export const mobileActionCloseButtonClassName =
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md opacity-70 ring-offset-background transition-opacity hover:bg-slate-100 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";

export const mobileActionCloseIconClassName = "h-5 w-5";
export const mobileActionCloseIconStroke = 2.25;

/** 액션 크롬 아래 좌우·하단 flush (inset 카드 금지) */
export const mobileActionOverlayContentClassName = cn(
  "left-0 right-0 bottom-0 h-auto max-h-none w-auto max-w-none translate-x-0 translate-y-0",
  "rounded-none border-0 bg-white shadow-none sm:max-w-none",
  "data-[state=open]:animate-in data-[state=closed]:animate-out",
  "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
  "data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95",
);

/** 채팅 헤더와 맞춘 시트 헤더 */
export const mobileActionOverlayHeaderClassName =
  "flex flex-row shrink-0 items-center justify-between gap-3 space-y-0 border-b bg-slate-50 px-4 py-2.5 text-left";

export const mobileActionOverlayTitleClassName =
  "flex min-w-0 flex-wrap items-center gap-2 text-sm font-semibold tracking-tight text-foreground";

/** Dialog 기본 닫기(absolute)용 — remake/settings 등 hideClose 없이 쓸 때 */
export const mobileActionDialogCloseClassName = cn(
  mobileActionCloseButtonClassName,
  "absolute right-3 top-2.5",
);

export function mobileActionOverlayTopStyle(
  topPx: number | null | undefined,
): CSSProperties | undefined {
  if (topPx == null || !(topPx > 0)) return undefined;
  return {
    top: topPx,
    bottom: 0,
    left: 0,
    right: 0,
    transform: "none",
    width: "auto",
    maxWidth: "none",
    height: "auto",
    maxHeight: "none",
  };
}

/** 상단 액션 바(또는 그 자식) 클릭인지 — Radix outside dismiss 제외용 */
export function isMobileActionChromeTarget(
  target: EventTarget | null,
): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(`[${MOBILE_ACTION_CHROME_ATTR}]`));
}

/**
 * 채팅 플로팅과 동일 — 상단 액션 클릭으로 시트가 열린 직후
 * 같은 pointerup이 outside로 잡혀 바로 닫히는 것을 막는다.
 */
export function preventMobileActionSheetDismiss(event: {
  preventDefault: () => void;
}) {
  event.preventDefault();
}

/** 모바일 액션 시트 DialogContent에 그대로 spread */
export const mobileActionSheetDismissProps = {
  hideOverlay: true as const,
  onPointerDownOutside: preventMobileActionSheetDismiss,
  onInteractOutside: preventMobileActionSheetDismiss,
  onFocusOutside: preventMobileActionSheetDismiss,
  onOpenAutoFocus: preventMobileActionSheetDismiss,
};

/** DialogContent onPointerDownOutside / onInteractOutside */
export function preventDismissOnMobileActionChrome(event: {
  target: EventTarget | null;
  detail?: { originalEvent?: Event };
  preventDefault: () => void;
}) {
  const target = event.detail?.originalEvent?.target ?? event.target;
  if (isMobileActionChromeTarget(target)) {
    event.preventDefault();
  }
}

export function MobileActionCloseButton({
  onClick,
  className,
}: {
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={cn(mobileActionCloseButtonClassName, className)}
      aria-label="닫기"
      title="닫기"
      onClick={onClick}
    >
      <X
        className={mobileActionCloseIconClassName}
        strokeWidth={mobileActionCloseIconStroke}
      />
      <span className="sr-only">Close</span>
    </button>
  );
}
