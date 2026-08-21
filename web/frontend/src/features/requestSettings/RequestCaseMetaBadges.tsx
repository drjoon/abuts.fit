// related files:
// - web/frontend/src/pages/requestor/new_request/components/NewRequestAttachmentsPanel.tsx
// - web/frontend/src/shared/components/practice/PracticeTransferLabReceiveCard.tsx
// - web/frontend/src/shared/components/PastRequestsModal.tsx
// - web/frontend/src/features/requestSettings/RequestSettingsToolbar.tsx
// change-log:
// - 2026-08-16: secondary 배경이 카드에서 안 보여 muted+border 필로 명시(가시성).
// - 2026-08-16: 어벗생산의뢰 파일카드·기공의뢰수신 카드 공통 메타 뱃지(디자인SW·아노).
import { cn } from "@/shared/ui/cn";

/**
 * 어벗생산의뢰 파일카드 메타 뱃지와 동일 스케일.
 * (프로젝트 text-xs=14px 이므로 임의 픽셀 사용. bg-secondary는 흰 카드에서 거의 안 보여 muted+border 사용)
 */
export const REQUEST_CASE_META_BADGE_CLASS =
  "inline-flex items-center rounded-md border border-slate-200 bg-slate-100 text-slate-700 text-[10px] font-medium leading-none px-1.5 py-0.5 shrink-0";

export type RequestCaseMetaBadgesProps = {
  designSoftware?: string | null;
  anodizingEnabled?: boolean | null;
  /** ExoCAD 첫의뢰 헥스 확인용 복사샘플 */
  hexVerificationSample?: boolean | null;
  className?: string;
};

/** 디자인 소프트웨어 · 아노다이징 스냅샷 뱃지 (툴바 버튼보다 작게) */
export function RequestCaseMetaBadges({
  designSoftware,
  anodizingEnabled,
  hexVerificationSample = false,
  className,
}: RequestCaseMetaBadgesProps) {
  const software = String(designSoftware || "").trim();
  const hasAnodizing = typeof anodizingEnabled === "boolean";
  const isHexSample = Boolean(hexVerificationSample);
  if (!software && !hasAnodizing && !isHexSample) return null;

  return (
    <span className={cn("inline-flex items-center gap-1 flex-wrap", className)}>
      {isHexSample ? (
        <span
          className={cn(
            REQUEST_CASE_META_BADGE_CLASS,
            "border-amber-300 bg-amber-50 text-amber-900 font-semibold",
          )}
        >
          헥스 확인용 무료 샘플
        </span>
      ) : null}
      {software ? (
        <span className={REQUEST_CASE_META_BADGE_CLASS}>{software}</span>
      ) : null}
      {hasAnodizing ? (
        <span className={REQUEST_CASE_META_BADGE_CLASS}>
          {anodizingEnabled ? "아노 ON" : "아노 OFF"}
        </span>
      ) : null}
    </span>
  );
}
