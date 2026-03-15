import { RequestPage } from "../RequestPage";

// 가공 공정 전용 페이지 (RequestPage 래퍼)
export const MachiningPage = () => {
  return <RequestPage showQueueBar={true} />;
};
