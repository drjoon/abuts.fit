import { RequestPage } from "../RequestPage";
import { deriveStageForFilter } from "../utils/request";
import type { ManufacturerRequest } from "../utils/request";

// 포장.발송 공정 전용 페이지 (RequestPage 래퍼)
export const ShippingPage = () => {
  const filterByShippingStage = (req: ManufacturerRequest) => {
    return deriveStageForFilter(req) === "포장.발송";
  };

  return <RequestPage showQueueBar={false} filterRequests={filterByShippingStage} />;
};
