import { useEffect } from "react";
import { type ManufacturerRequest } from "@/pages/manufacturer/worksheet/custom_abutment/utils/request";

export const useMailboxSync = (pageState: any, mailboxState: any) => {
  const {
    mailboxModalOpen,
    mailboxModalAddress,
    mailboxModalRequests,
    setMailboxModalRequests,
    handleShipmentModalClose,
  } = mailboxState;

  useEffect(() => {
    if (!mailboxModalOpen || !mailboxModalAddress) return;
    const next = pageState.requests.filter(
      (req: ManufacturerRequest) => req.mailboxAddress === mailboxModalAddress,
    );
    setMailboxModalRequests(next);
  }, [
    pageState.requests,
    mailboxModalOpen,
    mailboxModalAddress,
    setMailboxModalRequests,
  ]);

  useEffect(() => {
    if (!mailboxModalOpen) return;
    if (mailboxModalRequests.length > 0) return;
    handleShipmentModalClose();
  }, [mailboxModalRequests.length, mailboxModalOpen, handleShipmentModalClose]);
};
