import { useLocation } from "react-router-dom";
import { RequestPage } from "./worksheet/custom_abutment/request/RequestPage";
import { MachiningPage } from "./worksheet/custom_abutment/machining/MachiningPage";

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
        case "receive": // Legacy alias
          return (
            <RequestPage
              showQueueBar={true}
              filterRequests={(req) => {
                const stage = String(req.manufacturerStage || "").trim();
                return !stage || stage === "의뢰";
              }}
            />
          );
        case "machining":
          return (
            <RequestPage
              showQueueBar={true}
              filterRequests={(req) => {
                const stage = String(req.manufacturerStage || "").trim();
                return stage === "생산" && !!req.caseInfos?.ncFile?.s3Key;
              }}
            />
          );
        case "cam":
          return (
            <RequestPage
              showQueueBar={true}
              filterRequests={(req) => {
                const stage = String(req.manufacturerStage || "").trim();
                return stage === "CAM" && !!req.caseInfos?.camFile?.s3Key;
              }}
            />
          );
        default:
          return <RequestPage showQueueBar={true} />;
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
