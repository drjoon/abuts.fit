// change-log:
// - 2026-08-04: 오늘 발송 체크 해제 시 낙관적 UI/캐시 무효화로 의뢰자 기본 발송 요일로 복원
// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/backend/controllers/requests/shipping.controller.js
import { useState, useCallback } from "react";
import { type ManufacturerRequest } from "@/pages/manufacturer/worksheet/custom_abutment/utils/request";
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";

export const useMailboxManagement = (
  token: string | null,
  fetchRequests: () => Promise<void>,
) => {
  const [mailboxModalOpen, setMailboxModalOpen] = useState(false);
  const [mailboxModalAddress, setMailboxModalAddress] = useState("");
  const [mailboxModalRequests, setMailboxModalRequests] = useState<
    ManufacturerRequest[]
  >([]);
  const [forceTodayMailboxAddresses, setForceTodayMailboxAddresses] = useState<
    Set<string>
  >(new Set());
  const [clearedForceTodayMailboxAddresses, setClearedForceTodayMailboxAddresses] =
    useState<Set<string>>(new Set());
  const [mailboxErrorByAddress, setMailboxErrorByAddress] = useState<
    Record<string, string>
  >({});
  const [isRollingBackAll, setIsRollingBackAll] = useState(false);
  const [isForceTodayUpdating, setIsForceTodayUpdating] = useState(false);
  const [isMailboxDetailsLoading, setIsMailboxDetailsLoading] = useState(false);
  const { toast } = useToast();

  const handleRegisterShipment = useCallback(
    async (address: string, reqs: ManufacturerRequest[]) => {
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
    setIsMailboxDetailsLoading(false);
  }, []);

  const setMailboxForceToday = useCallback(
    async (address: string, enabled: boolean) => {
      const normalized = String(address || "").trim();
      if (!normalized) return;
      setIsForceTodayUpdating(true);

      const applyLocal = (checked: boolean) => {
        setForceTodayMailboxAddresses((prev) => {
          const next = new Set(prev);
          if (checked) next.add(normalized);
          else next.delete(normalized);
          return next;
        });
        setClearedForceTodayMailboxAddresses((prev) => {
          const next = new Set(prev);
          if (checked) next.delete(normalized);
          else next.add(normalized);
          return next;
        });
        setMailboxModalRequests((prev) =>
          prev.map((req) => ({
            ...req,
            timeline: {
              ...(req as any)?.timeline,
              forceTodayShipment: checked,
            },
          })),
        );
      };

      applyLocal(enabled);

      if (!token) {
        toast({
          title: "로그인이 필요합니다",
          variant: "destructive",
        });
        applyLocal(!enabled);
        setIsForceTodayUpdating(false);
        return;
      }

      try {
        const res = await request<any>({
          path: "/api/requests/shipping/mailbox-force-today",
          method: "POST",
          token,
          jsonBody: {
            mailboxAddress: normalized,
            forceTodayShipment: enabled,
          },
        });

        if (!res.ok || !res.data?.success) {
          throw new Error(
            String(res.data?.message || "").trim() ||
              "강제 오늘 발송 저장에 실패했습니다.",
          );
        }

        await fetchRequests();
      } catch (error) {
        applyLocal(!enabled);
        toast({
          title: enabled ? "오늘 발송 설정 실패" : "오늘 발송 해제 실패",
          description:
            error instanceof Error && error.message
              ? error.message
              : "강제 오늘 발송 저장에 실패했습니다.",
          variant: "destructive",
        });
      } finally {
        setIsForceTodayUpdating(false);
      }
    },
    [fetchRequests, toast, token],
  );

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
      const res = await request<any>({
        path: "/api/requests/shipping/mailbox-rollback",
        method: "POST",
        token,
        jsonBody: {
          mailboxAddress: mailboxModalAddress,
          requestIds: mailboxModalRequests
            .map((req) => req._id)
            .filter(Boolean),
        },
      });

      if (!res.ok) {
        const message =
          String(res.data?.message || "").trim() || "전체 롤백에 실패했습니다.";
        throw new Error(message);
      }

      await fetchRequests();
      toast({
        title: "박스 전체 롤백 완료",
        description: "우편함 롤백을 완료했습니다.",
        duration: 3000,
      });
    } catch (error) {
      toast({
        title: "전체 롤백 실패",
        description:
          error instanceof Error && error.message
            ? error.message
            : "우편함 전체 롤백에 실패했습니다.",
        variant: "destructive",
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
    forceTodayMailboxAddresses,
    clearedForceTodayMailboxAddresses,
    setMailboxForceToday,
    mailboxErrorByAddress,
    setMailboxErrorByAddress,
    isRollingBackAll,
    setIsRollingBackAll,
    isForceTodayUpdating,
    isMailboxDetailsLoading,
    setIsMailboxDetailsLoading,
    handleRegisterShipment,
    handleShipmentModalClose,
    handleMailboxAddressSaved,
    handleRollbackAllInMailbox,
    clearMailboxError,
  };
};
