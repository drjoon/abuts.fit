// change-log:
// - 2026-08-11: DesignPage 삭제 → 의뢰수신 내장 섹션으로 통합(독립 페이지/사이드메뉴 없음).
// - 2026-08-11: 로딩/서스펜스·빈 목록 시 빈 상태 카드 미표시(의뢰수신 전송 내역과 중복 방지).
// - 2026-08-10: detailMode=transferChat — 기공의뢰서형 카드·상세/채팅 모달.
// - 2026-08-10: 디자인 큐를 제조사 → 지정 의뢰자(designAccessEnabled)로 이전.
// related files:
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/frontend/src/pages/requestor/design/DesignRequestTransferView.tsx
// - web/frontend/src/pages/requestor/design/DesignRequestCardGrid.tsx
import { Suspense, lazy } from "react";
import {
  deriveStageForFilter,
  isDesignCustomAbutmentRequest,
  PRODUCT_MODE,
} from "@/pages/manufacturer/worksheet/custom_abutment/utils/request";

const RequestPage = lazy(() =>
  import(
    "@/pages/manufacturer/worksheet/custom_abutment/components/RequestPage"
  ).then((m) => ({
    default: m.RequestPage,
  })),
);

/**
 * 의뢰수신에 편입된 디자인+생산(준비) 큐.
 * PeriodFilter는 상위(의뢰수신)에서 공유한다.
 */
export const DesignQueueSection = () => {
  return (
    <div className="w-full min-h-0 flex flex-col items-stretch">
      <Suspense fallback={null}>
        <RequestPage
          showQueueBar={false}
          showBulkCamRegenerate={false}
          useManufacturerQueueList
          detailMode="transferChat"
          productMode={PRODUCT_MODE.DESIGN_CUSTOM_ABUTMENT}
          filterRequests={(req) =>
            isDesignCustomAbutmentRequest(req) &&
            deriveStageForFilter(req) === "준비"
          }
        />
      </Suspense>
    </div>
  );
};

/** @deprecated DesignQueueSection 사용 */
export const DesignPage = DesignQueueSection;
/** @deprecated DesignQueueSection 사용 */
export const ManufacturerDesignPage = DesignQueueSection;
