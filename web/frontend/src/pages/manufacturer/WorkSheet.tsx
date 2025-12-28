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
          return <RequestPage showQueueBar={true} />;
        case "machining":
          return (
            <RequestPage
              showQueueBar={true}
              filterRequests={(req) => {
                const status = String(req.status || "").trim();
                const s1 = String(req.status1 || "").trim();
                const s2 = String(req.status2 || "").trim();
                // 가공 단계: status1이 가공이거나 상태가 가공전/가공후인 모든 건
                return (
                  s1 === "가공" ||
                  status === "가공전" ||
                  status === "가공후" ||
                  s2 === "전" ||
                  s2 === "중" ||
                  s2 === "후"
                );
              }}
            />
          );
        case "cam":
          return (
            <RequestPage
              showQueueBar={true}
              filterRequests={(req) => {
                const status = String(req.status || "").trim();
                const s1 = String(req.status1 || "").trim();
                const s2 = String(req.status2 || "").trim();
                return status === "가공후" || (s1 === "가공" && s2 === "후");
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
