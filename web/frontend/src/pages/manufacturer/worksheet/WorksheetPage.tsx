// change-log:
// - 2026-08-03: 워크시트 기본 탭 '의뢰' 표시를 '준비'로 변경(표시 레이어만). 관련 유틸의 deriveStageForFilter와 연동됨.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/backend/controllers/requests/common.review.controller.js
import { Suspense, lazy } from "react";
import { useLocation } from "react-router-dom";
import {
  deriveStageForFilter,
  isRndSampleRequest,
} from "@/pages/manufacturer/worksheet/custom_abutment/utils/request";

const RequestPage = lazy(() =>
  import("./custom_abutment/components/RequestPage").then((m) => ({
    default: m.RequestPage,
  })),
);

const MachiningPage = lazy(() =>
  import("./custom_abutment/machining/MachiningPage").then((m) => ({
    default: m.MachiningPage,
  })),
);
const PackingPage = lazy(() =>
  import("./custom_abutment/packing/PackingPage").then((m) => ({
    default: m.PackingPage,
  })),
);
const ShippingPage = lazy(() =>
  import("./custom_abutment/shipping/ShippingPage").then((m) => ({
    default: m.ShippingPage,
  })),
);
const TrackingInquiryPage = lazy(() =>
  import("./custom_abutment/tracking/TrackingPage").then((m) => ({
    default: m.TrackingInquiryPage,
  })),
);

export const ManufacturerWorksheetPage = () => {
  const location = useLocation();
  const worksheetParams = new URLSearchParams(location.search);

  // Default to custom_abutment/request if no params provided
  const worksheetType = worksheetParams.get("type") || "custom_abutment";
  const worksheetStage = worksheetParams.get("stage") || "request";

  const renderContent = () => {
    // Product: Custom Abutment
    // Legacy support: 'cnc' type maps to custom_abutment logic for now
    if (worksheetType === "custom_abutment" || worksheetType === "cnc") {
      switch (worksheetStage) {
        case "request":
          return (
            <RequestPage
              showQueueBar={true}
              filterRequests={(req) => deriveStageForFilter(req) === "준비"}
            />
          );
        case "cam":
          // 작업 공정 변경: CAM 탭 비노출. legacy cam URL은 가공 페이지로 연결한다.
          return <MachiningPage />;
        case "machining":
          return <MachiningPage />;
        case "packing":
          return <PackingPage showQueueBar={true} />;
        case "shipping":
          return <ShippingPage />;
        case "tracking":
          return <TrackingInquiryPage />;
        case "rnd":
          return (
            <RequestPage
              showQueueBar={true}
              filterRequests={(req) =>
                isRndSampleRequest(req) && req.rnd?.unmachinableAt == null
              }
            />
          );
        case "unmachinable":
          return (
            <RequestPage
              showQueueBar={true}
              filterRequests={(req) => req.rnd?.unmachinableAt != null}
            />
          );
        default:
          return (
            <RequestPage
              showQueueBar={true}
              filterRequests={(req) => deriveStageForFilter(req) === "준비"}
            />
          );
      }
    }

    // Product: Crown (Example for future expansion)
    if (worksheetType === "crown") {
      return (
        <div className="p-8 text-center text-slate-500">
          Crown 페이지 준비중...
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        올바르지 않은 제품군 또는 공정입니다.
      </div>
    );
  };

  return (
    <div className="w-full h-full flex flex-col min-h-0 items-stretch">
      <Suspense fallback={null}>{renderContent()}</Suspense>
    </div>
  );
};
