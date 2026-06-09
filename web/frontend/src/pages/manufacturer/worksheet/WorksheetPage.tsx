import { Suspense, lazy } from "react";
import { useLocation } from "react-router-dom";
import { deriveStageForFilter } from "@/pages/manufacturer/worksheet/custom_abutment/utils/request";

const RequestPage = lazy(() =>
  import("./custom_abutment/components/RequestPage").then((m) => ({
    default: m.RequestPage,
  })),
);
const CamPage = lazy(() =>
  import("./custom_abutment/cam/CamPage").then((m) => ({ default: m.CamPage })),
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
              filterRequests={(req) => deriveStageForFilter(req) === "의뢰"}
            />
          );
        case "cam":
          return <CamPage />;
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
                String(req.source || "").trim() === "manufacturer_sample" &&
                Boolean(req.rnd?.doneAt)
              }
            />
          );
        default:
          return (
            <RequestPage
              showQueueBar={true}
              filterRequests={(req) => deriveStageForFilter(req) === "의뢰"}
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
