import { useEffect } from "react";
import { type ManufacturerRequest } from "@/pages/manufacturer/worksheet/custom_abutment/utils/request";

export const useMailboxSync = (
  pageState: any,
  mailboxState: any,
) => {
  useEffect(() => {
    if (!mailboxState.mailboxModalOpen || !mailboxState.mailboxModalAddress)
      return;
    const next = pageState.requests.filter(
      (req: ManufacturerRequest) => req.mailboxAddress === mailboxState.mailboxModalAddress,
    );
    mailboxState.setMailboxModalRequests(next);
  }, [
    pageState.requests,
    mailboxState.mailboxModalOpen,
    mailboxState.mailboxModalAddress,
    mailboxState,
  ]);

  useEffect(() => {
    if (!mailboxState.mailboxModalOpen) return;
    if (mailboxState.mailboxModalRequests.length > 0) return;
    mailboxState.handleShipmentModalClose();
  }, [
    mailboxState.mailboxModalRequests.length,
    mailboxState.mailboxModalOpen,
    mailboxState,
  ]);
};
