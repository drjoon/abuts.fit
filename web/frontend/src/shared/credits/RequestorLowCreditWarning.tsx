// related files:
// - web/backend/services/requestorLowCreditWarning.service.js
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/shared/credits/useRequestorLowCreditWarning.ts
// - web/frontend/src/shared/notices/DashboardImportantNoticesRail.tsx
// - web/frontend/src/shared/business/departmentAccess.ts
//
// PTX·커스텀어벗 의뢰 화면. 최근 충전의 1/4 이하이면 모달 한 번, 이후에는 남은 금액.
// 정산 메뉴가 없는 기공사도 같은 경고를 본다. 충전 버튼은 정산을 볼 수 있는 기공소만.
// practice-transfers 헤더 중요 공지 레일이 배너를 맡으면 hideBanner로 여기 배너만 끈다.

import { type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import { CONTENT_MEASURED_CHROME_CLASS } from "@/shared/ui/contentMeasuredChrome";
import { cn } from "@/shared/ui/cn";
import {
  formatLowCreditWon,
  LOW_CREDIT_CHARGE_HREF,
  RequestorLowCreditWarningContext,
  useRequestorLowCreditWarning,
} from "./useRequestorLowCreditWarning";

/**
 * 저잔액 경고 상태 1회 로드. 배너·모달·중요 공지 레일이 공유한다.
 */
export function RequestorLowCreditWarningProvider({
  children,
  hideBanner = false,
}: {
  children: ReactNode;
  /** true면 배너는 중요 공지 레일이 표시. 모달만 유지. */
  hideBanner?: boolean;
}) {
  const navigate = useNavigate();
  const value = useRequestorLowCreditWarning();
  const {
    orderable,
    lastCharge,
    canCharge,
    showBanner,
    modalOpen,
    hideForever,
    setHideForever,
    dismissModal,
  } = value;

  return (
    <RequestorLowCreditWarningContext.Provider value={value}>
      {!hideBanner && showBanner ? (
        <div className="shrink-0 px-3 pt-2">
          <div
            className={cn(
              CONTENT_MEASURED_CHROME_CLASS,
              "flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-950",
            )}
          >
            <span className="min-w-0">
              남은 크레딧 {formatLowCreditWon(orderable)}
            </span>
            {canCharge ? (
              <button
                type="button"
                className="shrink-0 rounded-md px-1.5 py-0.5 text-amber-950 underline underline-offset-2"
                onClick={() => navigate(LOW_CREDIT_CHARGE_HREF)}
              >
                충전
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <ConfirmDialog
        open={modalOpen}
        title="크레딧이 얼마 남지 않았습니다"
        confirmTone="primary"
        confirmLabel={canCharge ? "충전" : "닫기"}
        cancelLabel="닫기"
        showCancel={canCharge}
        closeOnBackdrop={false}
        footerLeading={
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={hideForever}
              onChange={(event) => setHideForever(event.target.checked)}
            />
            다시 보지 않기
          </label>
        }
        description={
          <p>
            남은 크레딧은 {formatLowCreditWon(orderable)}입니다.
            <br />
            최근 충전 {formatLowCreditWon(lastCharge)}의 4분의 1 이하입니다.
          </p>
        }
        onCancel={dismissModal}
        onConfirm={() => {
          dismissModal();
          if (canCharge) navigate(LOW_CREDIT_CHARGE_HREF);
        }}
      />
      {children}
    </RequestorLowCreditWarningContext.Provider>
  );
}

/** @deprecated Provider로 통합. 레이아웃 호환용. */
export function RequestorLowCreditWarning({
  hideBanner = false,
}: {
  hideBanner?: boolean;
}) {
  return (
    <RequestorLowCreditWarningProvider hideBanner={hideBanner}>
      {null}
    </RequestorLowCreditWarningProvider>
  );
}
