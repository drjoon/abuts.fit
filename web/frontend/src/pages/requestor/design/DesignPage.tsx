// change-log:
// - 2026-08-10: 디자인 큐를 제조사 → 지정 의뢰자(designAccessEnabled)로 이전.
// - 2026-08-09: 디자인 페이지에서 진행중 요약 카드·Filled STL 재생성 버튼 숨김.
// - 2026-08-09: 디자인+가공(productMode=design_custom_abutment) 준비 건을 디자인 페이지에 표시.
// related files:
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/App.tsx
// - web/frontend/src/pages/manufacturer/worksheet/WorksheetPage.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
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

/** 지정 의뢰자 디자인 작업: 디자인+가공 의뢰의 준비 단계 큐. */
export const DesignPage = () => {
  return (
    <div className="w-full h-full flex flex-col min-h-0 items-stretch">
      <Suspense fallback={null}>
        <RequestPage
          showQueueBar={false}
          showBulkCamRegenerate={false}
          useManufacturerQueueList
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

/** @deprecated 제조사 경로 호환 — DesignPage 사용 */
export const ManufacturerDesignPage = DesignPage;
