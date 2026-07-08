import { useEffect } from "react";
import { type ManufacturerRequest } from "@/pages/manufacturer/worksheet/custom_abutment/utils/request";

export const useMailboxSync = (pageState: any, mailboxState: any) => {
  const {
    mailboxModalOpen,
    mailboxModalAddress,
    mailboxModalRequests,
    setMailboxModalRequests,
    handleShipmentModalClose,
    isForceTodayUpdating,
    isMailboxDetailsLoading,
  } = mailboxState;

  useEffect(() => {
    if (!mailboxModalOpen || !mailboxModalAddress) return;

    const normalizedAddress = String(mailboxModalAddress || "")
      .trim()
      .toUpperCase();

    const next = pageState.requests.filter((req: ManufacturerRequest) => {
      const reqMailboxAddress = String(req.mailboxAddress || "")
        .trim()
        .toUpperCase();
      return reqMailboxAddress === normalizedAddress;
    });

    // 페이지 데이터가 부분 로드된 상태일 수 있어, 빈 결과로 기존 모달 데이터를 덮어쓰지 않는다.
    setMailboxModalRequests((prev: ManufacturerRequest[]) =>
      next.length > 0 ? next : prev,
    );
  }, [
    pageState.requests,
    mailboxModalOpen,
    mailboxModalAddress,
    setMailboxModalRequests,
  ]);

  useEffect(() => {
    if (!mailboxModalOpen) return;
    if (isForceTodayUpdating) return;
    if (isMailboxDetailsLoading) return;
    if (mailboxModalRequests.length > 0) return;
    handleShipmentModalClose();
  }, [
    isForceTodayUpdating,
    isMailboxDetailsLoading,
    mailboxModalRequests.length,
    mailboxModalOpen,
    handleShipmentModalClose,
  ]);
};
