// change-log:
// - 2026-08-09: 디자인 페이지에서 진행중 요약 카드·Filled STL 재생성 버튼 숨김.
// - 2026-08-09: 디자인+가공(productMode=design_custom_abutment) 준비 건을 디자인 페이지에 표시.
// - 2026-08-09: 디자인 작업영역은 비워두고, 상단 헤더(기간 필터)만 DashboardLayout에서 표시.
// - 2026-08-09: 제조사 사이드메뉴 "디자인" 진입점.
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
  import("../worksheet/custom_abutment/components/RequestPage").then((m) => ({
    default: m.RequestPage,
  })),
);

/** 제조사 디자인 작업: 디자인+가공 의뢰의 준비 단계 큐. */
export const ManufacturerDesignPage = () => {
  return (
    <div className="w-full h-full flex flex-col min-h-0 items-stretch">
      <Suspense fallback={null}>
        <RequestPage
          showQueueBar={false}
          showBulkCamRegenerate={false}
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
