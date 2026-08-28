// related files:
// - web/frontend/src/pages/requestor/settings/SettingsPage.tsx
// - web/frontend/src/features/settings/LabPracticeSpecialSupplySection.tsx
// - web/frontend/src/features/settings/tabs/LabFeeScheduleTab.tsx
// - web/backend/controllers/labTradingPartners/labTradingPartner.controller.js
// - 2026-08-29: 기공소 설정 「특별공급가」탭 — 기공비 항목을 불러와 치과별 오버라이드 UI에 전달.
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { SettingsCardSkeleton } from "@/features/components/SettingsSkeletons";
import { LabPracticeSpecialSupplySection } from "@/features/settings/LabPracticeSpecialSupplySection";
import {
  normalizeLabFeeItems,
  type LabFeeItem,
  type LabFeeSchedule,
} from "@/shared/practice/labFeeSchedule";

export const LabPracticeSpecialSupplyTab = () => {
  const { toast } = useToast();
  const { token } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [feeItems, setFeeItems] = useState<LabFeeItem[]>([]);

  const loadFeeItems = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await request<{
        data?: {
          items?: LabFeeItem[];
          schedule?: Partial<LabFeeSchedule>;
          remake?: Partial<LabFeeSchedule>;
          enabled?: Partial<Record<string, boolean>>;
        };
        message?: string;
      }>({
        path: "/api/lab-trading-partners/fee-schedule",
        method: "GET",
        token,
      });
      if (!res.ok) {
        toast({
          title: "기공비 항목 조회 실패",
          description: res.data?.message || "다시 시도해주세요.",
          variant: "destructive",
        });
        setFeeItems([]);
        return;
      }
      const payload = res.data?.data;
      if (Array.isArray(payload?.items)) {
        setFeeItems(
          payload.items.length
            ? normalizeLabFeeItems({ items: payload.items })
            : [],
        );
        return;
      }
      setFeeItems(
        normalizeLabFeeItems({
          ...(payload?.schedule || {}),
          remake: payload?.remake,
          enabled: payload?.enabled,
        }),
      );
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    void loadFeeItems();
  }, [loadFeeItems]);

  if (loading) {
    return <SettingsCardSkeleton />;
  }

  return <LabPracticeSpecialSupplySection feeItems={feeItems} />;
};
