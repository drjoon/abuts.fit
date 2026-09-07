/**
 * 기공의뢰수신 — 예약된 기공비·특별공급가 변경 안내.
 * 클릭 시 현재 수가 ↔ 예약 수가 세부 비교.
 *
 * related files:
 * - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
 * - web/frontend/src/features/settings/LabFeeApplyTimingDialog.tsx
 * - web/frontend/src/pages/practice/components/LabReceiveUnreadNotice.tsx
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, X } from "lucide-react";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { formatLabFeeApplyYmdShort } from "@/features/settings/LabFeeApplyTimingDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  LAB_FEE_ITEM_UNIT_LABELS,
  normalizeLabFeeItems,
  type LabFeeItem,
  type LabFeeItemUnit,
} from "@/shared/practice/labFeeSchedule";
import { cn } from "@/shared/ui/cn";

const DISMISS_STORAGE_PREFIX = "abutsfit:lab-fee-schedule-notice-dismissed:";

type LabReceiveFeeScheduleNoticeProps = {
  className?: string;
  refreshKey?: number | string;
};

type FeePendingPayload = {
  effectiveFromYmd: string;
  items: LabFeeItem[];
};

type SupplyPendingRow = {
  practiceAnchorId: string;
  practiceName?: string;
  mode: "rate" | "amount";
  discountRate: number;
  items: Array<{
    feeItemId: string;
    feeItemName?: string;
    discountAmount: number;
    remakeDiscountAmount: number;
  }>;
};

type SupplyPendingPayload = {
  effectiveFromYmd: string;
  prices: SupplyPendingRow[];
};

const toWon = (value: unknown) => Math.max(0, Math.round(Number(value) || 0));
const formatWon = (value: number) => `${toWon(value).toLocaleString("ko-KR")}원`;

const itemUnitPrice = (item: LabFeeItem) =>
  item.unit === "perNTeeth"
    ? toWon(item.tiers?.[0]?.price ?? item.price)
    : toWon(item.price);

const itemUnitRemake = (item: LabFeeItem) =>
  item.unit === "perNTeeth"
    ? toWon(item.tiers?.[0]?.remake ?? item.remake)
    : toWon(item.remake);

function buildFeeDiffRows(live: LabFeeItem[], pending: LabFeeItem[]) {
  const liveById = new Map(live.map((item) => [item.id, item]));
  const pendingById = new Map(pending.map((item) => [item.id, item]));
  const ids = [
    ...new Set([...liveById.keys(), ...pendingById.keys()]),
  ];
  const rows: Array<{
    key: string;
    name: string;
    unitLabel: string;
    fromPrice: number | null;
    toPrice: number | null;
    fromRemake: number | null;
    toRemake: number | null;
    changed: boolean;
  }> = [];
  for (const id of ids) {
    const a = liveById.get(id);
    const b = pendingById.get(id);
    const fromPrice = a ? itemUnitPrice(a) : null;
    const toPrice = b ? itemUnitPrice(b) : null;
    const fromRemake = a ? itemUnitRemake(a) : null;
    const toRemake = b ? itemUnitRemake(b) : null;
    const unit = (b?.unit || a?.unit || "perTooth") as LabFeeItemUnit;
    const changed =
      fromPrice !== toPrice ||
      fromRemake !== toRemake ||
      Boolean(a) !== Boolean(b) ||
      Boolean(a?.enabled !== false) !== Boolean(b?.enabled !== false);
    if (!changed && a && b) continue;
    rows.push({
      key: id,
      name: String(b?.name || a?.name || "").trim() || "항목",
      unitLabel: LAB_FEE_ITEM_UNIT_LABELS[unit] || unit,
      fromPrice,
      toPrice,
      fromRemake,
      toRemake,
      changed,
    });
  }
  return rows;
}

export function LabReceiveFeeScheduleNotice({
  className,
  refreshKey = 0,
}: LabReceiveFeeScheduleNoticeProps) {
  const { token, user } = useAuthStore();
  const labAnchorId = String(user?.businessAnchorId || "").trim() || "lab";
  const [feePending, setFeePending] = useState<FeePendingPayload | null>(null);
  const [feeLive, setFeeLive] = useState<LabFeeItem[]>([]);
  const [supplyPending, setSupplyPending] =
    useState<SupplyPendingPayload | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const load = useCallback(async () => {
    if (!token) {
      setFeePending(null);
      setFeeLive([]);
      setSupplyPending(null);
      return;
    }
    try {
      const [feeRes, supplyRes] = await Promise.all([
        request<{
          data?: {
            items?: LabFeeItem[];
            pendingChange?: {
              effectiveFromYmd?: string;
              items?: LabFeeItem[];
            } | null;
          };
        }>({
          path: "/api/lab-trading-partners/fee-schedule",
          method: "GET",
          token,
        }),
        request<{
          data?: {
            pendingChange?: {
              effectiveFromYmd?: string;
              prices?: SupplyPendingRow[];
            } | null;
          };
        }>({
          path: "/api/lab-trading-partners/special-supply-prices",
          method: "GET",
          token,
        }),
      ]);

      const liveItems = Array.isArray(feeRes.data?.data?.items)
        ? normalizeLabFeeItems({ items: feeRes.data.data.items })
        : [];
      setFeeLive(liveItems);

      const feePc = feeRes.ok ? feeRes.data?.data?.pendingChange : null;
      if (feePc?.effectiveFromYmd && Array.isArray(feePc.items)) {
        setFeePending({
          effectiveFromYmd: String(feePc.effectiveFromYmd),
          items: normalizeLabFeeItems({ items: feePc.items }),
        });
      } else {
        setFeePending(null);
      }

      const supplyPc = supplyRes.ok
        ? supplyRes.data?.data?.pendingChange
        : null;
      if (supplyPc?.effectiveFromYmd) {
        setSupplyPending({
          effectiveFromYmd: String(supplyPc.effectiveFromYmd),
          prices: Array.isArray(supplyPc.prices) ? supplyPc.prices : [],
        });
      } else {
        setSupplyPending(null);
      }
    } catch {
      setFeePending(null);
      setFeeLive([]);
      setSupplyPending(null);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const feeDiffRows = useMemo(
    () =>
      feePending
        ? buildFeeDiffRows(feeLive, feePending.items)
        : [],
    [feeLive, feePending],
  );

  const dismissKey = useMemo(() => {
    const fee = feePending?.effectiveFromYmd || "";
    const supply = supplyPending?.effectiveFromYmd || "";
    if (!fee && !supply) return "";
    return `${DISMISS_STORAGE_PREFIX}${labAnchorId}:${fee}|${supply}`;
  }, [feePending?.effectiveFromYmd, supplyPending?.effectiveFromYmd, labAnchorId]);

  useEffect(() => {
    if (!dismissKey) {
      setDismissed(false);
      return;
    }
    try {
      setDismissed(sessionStorage.getItem(dismissKey) === "1");
    } catch {
      setDismissed(false);
    }
  }, [dismissKey]);

  const dismissNotice = () => {
    setDismissed(true);
    setDetailOpen(false);
    if (!dismissKey) return;
    try {
      sessionStorage.setItem(dismissKey, "1");
    } catch {
      // ignore
    }
  };

  const lines: string[] = [];
  if (feePending) {
    lines.push(
      `기공비가 ${formatLabFeeApplyYmdShort(feePending.effectiveFromYmd)}부터 변경됩니다.`,
    );
  }
  if (supplyPending) {
    lines.push(
      `특별공급가가 ${formatLabFeeApplyYmdShort(supplyPending.effectiveFromYmd)}부터 변경됩니다.`,
    );
  }
  if (!lines.length || dismissed) return null;

  return (
    <>
      <div
        className={cn(
          "flex shrink-0 items-start gap-2 rounded-lg border border-amber-200/90 bg-amber-50/90 px-3 py-2 text-sm text-amber-950",
          className,
        )}
        role="status"
        aria-live="polite"
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-2 rounded-md text-left hover:bg-amber-100/70"
          onClick={() => setDetailOpen(true)}
        >
          <CalendarClock
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-700"
            aria-hidden
          />
          <div className="min-w-0 space-y-0.5">
            {lines.map((line) => (
              <p key={line} className="font-medium leading-snug">
                {line}
              </p>
            ))}
            <p className="text-[11px] font-normal text-amber-800/80">
              클릭하면 변경 내용을 볼 수 있습니다.
            </p>
          </div>
        </button>
        <button
          type="button"
          className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-amber-800/80 hover:bg-amber-100 hover:text-amber-950"
          aria-label="안내 닫기"
          onClick={dismissNotice}
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>예약된 수가 변경</DialogTitle>
            <DialogDescription>
              적용일부터 작업시작하는 의뢰에 반영됩니다. 지금은 현재 수가로
              견적됩니다.
            </DialogDescription>
          </DialogHeader>

          {feePending ? (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-900">
                기공비 · {formatLabFeeApplyYmdShort(feePending.effectiveFromYmd)}
                부터
              </h3>
              {feeDiffRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  표시할 항목 변경이 없습니다.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200/80 bg-white">
                  {feeDiffRows.map((row) => (
                    <li
                      key={row.key}
                      className="flex flex-col gap-0.5 px-3 py-2.5 text-sm"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 font-medium text-slate-900">
                          {row.name}
                        </span>
                        <span className="shrink-0 text-[11px] text-slate-500">
                          {row.unitLabel}
                        </span>
                      </div>
                      <p className="tabular-nums text-slate-700">
                        {row.fromPrice == null
                          ? "신규"
                          : formatWon(row.fromPrice)}
                        {" → "}
                        <span className="font-semibold text-amber-900">
                          {row.toPrice == null
                            ? "삭제"
                            : formatWon(row.toPrice)}
                        </span>
                      </p>
                      {(row.fromRemake != null && row.fromRemake > 0) ||
                      (row.toRemake != null && row.toRemake > 0) ||
                      row.fromRemake !== row.toRemake ? (
                        <p className="text-[12px] tabular-nums text-slate-500">
                          리메이크{" "}
                          {row.fromRemake == null
                            ? "-"
                            : formatWon(row.fromRemake)}
                          {" → "}
                          {row.toRemake == null
                            ? "-"
                            : formatWon(row.toRemake)}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {supplyPending ? (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-900">
                특별공급가 ·{" "}
                {formatLabFeeApplyYmdShort(supplyPending.effectiveFromYmd)}부터
              </h3>
              {supplyPending.prices.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  특별공급가 없음(기본 기공비)으로 예약됨.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200/80 bg-white">
                  {supplyPending.prices.map((row) => (
                    <li
                      key={row.practiceAnchorId}
                      className="px-3 py-2.5 text-sm"
                    >
                      <p className="font-medium text-slate-900">
                        {row.practiceName || "치과"}
                      </p>
                      {row.mode === "rate" ? (
                        <p className="tabular-nums text-amber-900">
                          할인율 {Number(row.discountRate || 0)}%
                        </p>
                      ) : (
                        <ul className="mt-1 space-y-0.5 text-[12px] text-slate-600">
                          {(row.items || []).map((item) => (
                            <li key={item.feeItemId} className="tabular-nums">
                              {item.feeItemName || item.feeItemId}: 할인{" "}
                              {formatWon(item.discountAmount)}
                              {toWon(item.remakeDiscountAmount) > 0
                                ? ` · 리메이크 할인 ${formatWon(item.remakeDiscountAmount)}`
                                : ""}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
