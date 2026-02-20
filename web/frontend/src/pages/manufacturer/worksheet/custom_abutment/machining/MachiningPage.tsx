import { RequestPage } from "../RequestPage";
import { deriveStageForFilter } from "../utils/request";
import type { ManufacturerRequest } from "../utils/request";

// 가공 공정 전용 페이지 (RequestPage 래퍼)
export const MachiningPage = () => {
  const filterByMachiningStage = (req: ManufacturerRequest) => {
    return deriveStageForFilter(req) === "가공";
  };

  return <RequestPage showQueueBar={true} filterRequests={filterByMachiningStage} />;
};
