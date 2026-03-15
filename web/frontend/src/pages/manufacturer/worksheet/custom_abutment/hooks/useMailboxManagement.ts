import { useState, useCallback } from "react";
import { type ManufacturerRequest } from "@/pages/manufacturer/worksheet/custom_abutment/utils/request";
import { useToast } from "@/shared/hooks/use-toast";

export const useMailboxManagement = (
  token: string | null,
  fetchRequests: () => Promise<void>,
) => {
  const [mailboxModalOpen, setMailboxModalOpen] = useState(false);
  const [mailboxModalAddress, setMailboxModalAddress] = useState("");
  const [mailboxModalRequests, setMailboxModalRequests] = useState<
    ManufacturerRequest[]
  >([]);
  const [mailboxErrorByAddress, setMailboxErrorByAddress] = useState<
    Record<string, string>
  >({});
  const [isRollingBackAll, setIsRollingBackAll] = useState(false);
  const { toast } = useToast();

  const handleRegisterShipment = useCallback(
    async (address: string, reqs: ManufacturerRequest[]) => {
      if (!reqs.length) return;
      setMailboxModalAddress(address);
      setMailboxModalRequests(reqs);
      setIsRollingBackAll(false);
      setMailboxModalOpen(true);
    },
    [],
  );

  const handleShipmentModalClose = useCallback(() => {
    setMailboxModalOpen(false);
    setMailboxModalAddress("");
    setMailboxModalRequests([]);
    setIsRollingBackAll(false);
  }, []);

  const handleMailboxAddressSaved = useCallback(
    (payload: {
      businessAnchorId: string;
      address: string;
      addressDetail: string;
      zipCode: string;
    }) => {
      const businessAnchorId = String(payload.businessAnchorId || "").trim();
      if (!businessAnchorId) return;

      setMailboxErrorByAddress((prev) => {
        const next = { ...prev };
        delete next[mailboxModalAddress];
        return next;
      });
    },
    [mailboxModalAddress],
  );

  const handleRollbackAllInMailbox = useCallback(async () => {
    if (
      !mailboxModalRequests.length ||
      isRollingBackAll ||
      !mailboxModalAddress ||
      !token
    )
      return;
    setIsRollingBackAll(true);
    try {
      const res = await fetch("/api/requests/shipping/mailbox-rollback", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mailboxAddress: mailboxModalAddress,
          requestIds: mailboxModalRequests
            .map((req) => req._id)
            .filter(Boolean),
        }),
      });

      if (!res.ok) {
        let message = "전체 롤백에 실패했습니다.";
        try {
          const body = await res.json().catch(() => null);
          if (body?.message) message = body.message;
        } catch {
          // ignore
        }
        throw new Error(message);
      }

      await fetchRequests();
      toast({
        title: "박스 전체 롤백 완료",
        description: "우편함 롤백을 완료했습니다.",
        duration: 3000,
      });
    } finally {
      setIsRollingBackAll(false);
    }
  }, [
    fetchRequests,
    isRollingBackAll,
    mailboxModalAddress,
    mailboxModalRequests,
    toast,
    token,
  ]);

  const clearMailboxError = useCallback((address: string) => {
    setMailboxErrorByAddress((prev) => {
      const next = { ...prev };
      delete next[address];
      return next;
    });
  }, []);

  return {
    mailboxModalOpen,
    setMailboxModalOpen,
    mailboxModalAddress,
    setMailboxModalAddress,
    mailboxModalRequests,
    setMailboxModalRequests,
    mailboxErrorByAddress,
    setMailboxErrorByAddress,
    isRollingBackAll,
    setIsRollingBackAll,
    handleRegisterShipment,
    handleShipmentModalClose,
    handleMailboxAddressSaved,
    handleRollbackAllInMailbox,
    clearMailboxError,
  };
};
