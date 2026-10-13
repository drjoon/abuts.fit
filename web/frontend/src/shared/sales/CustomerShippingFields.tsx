// change-log:
// - 2026-10-13: 딜러·영업팀이 소개 거래처의 배송 방식(택배/딜리버리)을 지정한다.
// related files:
// - web/backend/controllers/salesman/salesman.controller.js
// - web/frontend/src/pages/salesTeam/SalesAccountsPage.tsx
// - web/frontend/src/shared/shipping/ShippingModeToggle.tsx
import { useState } from "react";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import {
  ShippingModeToggle,
  type RequestorShippingMode,
} from "@/shared/shipping/ShippingModeToggle";
import {
  DELIVERY_CONDITION_LINE,
  DELIVERY_DEALER_FULL_PAYOUT_LINE,
  DELIVERY_MIN_MONTHLY_REQUESTS,
  DELIVERY_MONTHLY_PAYER_LINE,
  PARCEL_DEALER_DEDUCT_LINE,
} from "@/shared/shipping/shippingPolicyCopy";
import type { CustomerPriceRow } from "@/shared/sales/CustomerPriceDialog";

/** 선택한 거래처 카드의 배송 방식. 저장 즉시 반영. */
export function CustomerShippingFields({
  row,
  onSaved,
}: {
  row: CustomerPriceRow;
  onSaved: (next: CustomerPriceRow) => void;
}) {
  const { token } = useAuthStore();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const mode: RequestorShippingMode =
    row.shippingMode === "express" ? "express" : "normal";
  const monthly = row.monthlyRequestCount ?? 0;
  const eligible = monthly >= DELIVERY_MIN_MONTHLY_REQUESTS;

  const save = async (next: RequestorShippingMode) => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await request<any>({
        path: `/api/salesman/customer-shipping/${encodeURIComponent(row.anchorId)}`,
        method: "PUT",
        token,
        jsonBody: { shippingMode: next },
      });
      const body: any = res.data || {};
      if (!res.ok || !body?.success) {
        throw new Error(body?.message || "저장에 실패했습니다.");
      }
      onSaved({ ...row, shippingMode: next });
      toast({ title: "배송 방식을 저장했습니다.", duration: 2000 });
    } catch (e: any) {
      toast({
        title: "저장 실패",
        description: e?.message || "다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold tracking-tight text-slate-900">
        배송 방식
      </div>
      <ShippingModeToggle value={mode} onChange={save} disabled={saving} />
      <p className="text-xs leading-relaxed tabular-nums text-slate-500">
        이번 달 {monthly.toLocaleString()}건 · 지난달{" "}
        {(row.prevMonthRequestCount ?? 0).toLocaleString()}건
        <br />
        딜리버리: {DELIVERY_CONDITION_LINE}
        {eligible ? " (충족)" : ""}
      </p>
      <p className="text-xs leading-relaxed text-slate-500">
        {PARCEL_DEALER_DEDUCT_LINE}
        <br />
        {DELIVERY_DEALER_FULL_PAYOUT_LINE}
        <br />
        {DELIVERY_MONTHLY_PAYER_LINE}
      </p>
    </div>
  );
}
