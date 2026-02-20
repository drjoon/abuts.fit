import { useLocation } from "react-router-dom";
import { RequestPage } from "./custom_abutment/components/RequestPage";
import { CamPage } from "./custom_abutment/cam/CamPage";
import { MachiningPage } from "./custom_abutment/machining/MachiningPage";
import { PackingPage } from "./custom_abutment/packing/PackingPage";
import { ShippingPage } from "./custom_abutment/shipping/ShippingPage";
import { TrackingInquiryPage } from "./custom_abutment/tracking/TrackingPage";
import { deriveStageForFilter } from "@/pages/manufacturer/worksheet/custom_abutment/utils/request";

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
    <div className="min-h-screen bg-gradient-subtle p-6">
      <div className="max-w-6xl mx-auto space-y-6">{renderContent()}</div>
    </div>
  );
};
