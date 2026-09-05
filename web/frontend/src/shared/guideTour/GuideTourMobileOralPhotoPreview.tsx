// related files:
// - web/frontend/src/shared/components/practice/PracticeTransferMobileOralPhotoIntake.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/shared/guideTour/guideTourSteps.ts
// - web/frontend/src/shared/guideTour/GuideTourSpotlight.tsx
// change-log:
// - 2026-09-05: oral_phone — 폰을 왼쪽 반쪽 오른쪽(코치 마크)에 가깝게.
// - 2026-09-05: oral_phone — 아이폰 스킨 + 신규 의뢰 모달 크롬. 환자명 세로깨짐(aside 레일 해제).
// - 2026-09-05: oral_phone — 뷰포트 왼쪽 반쪽 오버레이(메모 칸 아님)·여백·세로 폰.
// - 2026-09-05: oral_phone — 실제 MobileOralPhotoIntake를 폰 프레임에 넣어 미리보기.

import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { PracticeTransferRequestIntakePanelProps } from "@/shared/components/practice/PracticeTransferRequestIntakePanel";
import { PracticeTransferMobileOralPhotoIntake } from "@/shared/components/practice/PracticeTransferMobileOralPhotoIntake";
import { cn } from "@/shared/ui/cn";

type GuideTourMobileOralPhotoPreviewProps = {
  requestIntakeProps: PracticeTransferRequestIntakePanelProps;
  className?: string;
  /** Spotlight 위성 홀 — primary oral_phone 과 별도 */
  guideTourSatellite?: string;
};

/** 가이드투어용 — 아이폰 프레임 안 실제 모바일「신규 의뢰」모달 미리보기 */
export function GuideTourMobileOralPhotoPreview({
  requestIntakeProps,
  className,
  guideTourSatellite = "oral_phone",
}: GuideTourMobileOralPhotoPreviewProps) {
  if (typeof document === "undefined") return null;

  // PC 작성 패널의 투어 레일/툴바가 폰 안에 lg 2열로 들어가 환자명이 세로로 깨짐
  const previewIntakeProps: PracticeTransferRequestIntakePanelProps = {
    ...requestIntakeProps,
    reserveGuideTourAside: false,
    headerToolbar: null,
    guideTourHeaderSlotEl: null,
    aboveMemoContent: null,
    besideMemoContent: null,
  };

  return createPortal(
    <div
      className={cn(
        // blur(z-420) 아래 — 홀을 통해 보임. 왼쪽 반쪽·오른쪽(코치)에 가깝게
        "pointer-events-none fixed inset-y-0 left-0 z-[415] flex w-1/2 select-none items-center justify-end",
        "py-8 pl-4 pr-1 sm:py-10 sm:pl-6 sm:pr-2",
        className,
      )}
      aria-hidden
    >
      {/* iPhone 외형 */}
      <div
        data-guide-tour-satellite={guideTourSatellite}
        className={cn(
          "relative flex h-full max-h-[min(44rem,calc(100vh-4rem))] w-full max-w-[23rem] flex-col",
          "rounded-[2.75rem] bg-[#1c1c1e]",
          "p-[0.72rem]",
          "shadow-[0_18px_50px_rgba(15,23,42,0.35),inset_0_0_0_1px_rgba(255,255,255,0.08)]",
          "ring-1 ring-black/40",
        )}
      >
        {/* 측면 버튼 느낌 */}
        <div
          className="pointer-events-none absolute -left-[2px] top-[7.5rem] h-8 w-[3px] rounded-l-sm bg-[#3a3a3c]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -left-[2px] top-[11rem] h-14 w-[3px] rounded-l-sm bg-[#3a3a3c]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -left-[2px] top-[15.25rem] h-14 w-[3px] rounded-l-sm bg-[#3a3a3c]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -right-[2px] top-[12rem] h-20 w-[3px] rounded-r-sm bg-[#3a3a3c]"
          aria-hidden
        />

        <div
          className={cn(
            "relative flex min-h-0 flex-1 flex-col overflow-hidden",
            "rounded-[2.15rem] bg-white",
          )}
        >
          {/* Dynamic Island */}
          <div className="pointer-events-none absolute left-1/2 top-2.5 z-20 h-[1.65rem] w-[6.25rem] -translate-x-1/2 rounded-full bg-black" />

          {/* 신규 의뢰 모달 헤더 — 실제 모바일 DialogHeader 와 동일 */}
          <div
            className={cn(
              "relative z-10 flex shrink-0 flex-row items-center gap-2",
              "border-b border-slate-100 bg-white px-4 pb-3 pt-11 pr-14",
            )}
          >
            <p className="shrink-0 text-[17px] font-semibold tracking-tight text-slate-900">
              신규 의뢰
            </p>
            <span
              className={cn(
                "absolute right-3 top-[2.35rem] inline-flex h-10 w-10 items-center justify-center",
                "rounded-full bg-slate-100/90 text-slate-600",
              )}
              aria-hidden
            >
              <X className="h-5 w-5" strokeWidth={2.25} />
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain bg-slate-50/80">
            <div className="box-border min-w-0 space-y-4 px-4 pb-6 pt-4">
              <PracticeTransferMobileOralPhotoIntake
                requestIntakeProps={previewIntakeProps}
                canCapture
                photos={[]}
                onPickPhotos={() => {}}
                onRemovePhoto={() => {}}
                onClearPhotos={() => {}}
                onSave={() => {}}
                onCancel={() => {}}
                canSave={false}
                demoPreview
              />
            </div>
          </div>

          {/* Home indicator */}
          <div className="flex shrink-0 justify-center bg-slate-50/80 pb-2 pt-1">
            <div className="h-1 w-[8.5rem] rounded-full bg-slate-900/85" />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
