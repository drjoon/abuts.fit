// related files:
// - web/frontend/src/pages/admin/AdminFinancePage.tsx
// - web/backend/controllers/admin/adminPracticeLabFee.controller.js
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Landmark } from "lucide-react";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AdminEmptyState } from "@/pages/admin/adminUi";
import { formatRequestorWon } from "@/shared/pricing/requestorUnitPricePolicy";

type LabLine = {
  id: string;
  payeeName: string;
  bankName: string;
  accountNumber: string;
  holderName: string;
  amount: number;
  transferStatus: string;
};

type WorkWatch = {
  ongoing?: boolean;
  repeat?: boolean;
  partial?: boolean;
  prepaidCandidate?: boolean;
  unpaidRecordCount?: number;
};

type WorkItem = {
  id: string;
  practiceAnchorId: string;
  practiceName: string;
  yearMonth: string;
  totalAmount: number;
  amountReceived?: number;
  phase: "awaiting_first" | "awaiting_second" | "paused" | "payout";
  firstDueYmd: string;
  secondDueYmd: string;
  labPayoutOnYmd: string;
  labPayoutDueYmd: string;
  watch?: WorkWatch;
  lines: LabLine[];
};

const PHASE_LABEL: Record<WorkItem["phase"], string> = {
  awaiting_first: "1차 입금",
  awaiting_second: "2차 입금",
  paused: "주문 잠시 쉼",
  payout: "기공소 지급",
};

function formatYmd(ymd?: string) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return "";
  const [, month, day] = ymd.split("-");
  return `${Number(month)}월 ${Number(day)}일`;
}

export function AdminPracticeLabFeeTab() {
  const { token } = useAuthStore();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const practiceFilter = searchParams.get("practice") || "";
  const [items, setItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [partialDraft, setPartialDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await request<{
        success: boolean;
        data?: { items: WorkItem[] };
        message?: string;
      }>({
        path: "/api/admin/practice-lab-fees",
        method: "GET",
        token,
        skipCache: true,
      });
      if (res.ok && res.data?.success) {
        setItems(res.data.data?.items || []);
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const recordPartial = async (item: WorkItem) => {
    if (!token || busyId) return;
    const raw = (partialDraft[item.id] ?? "").replace(/,/g, "").trim();
    const amountReceived = raw ? Number(raw) : 0;
    if (!Number.isFinite(amountReceived) || amountReceived < 0) {
      toast({ title: "금액을 확인해 주세요", variant: "destructive" });
      return;
    }
    setBusyId(`partial:${item.id}`);
    try {
      const res = await request<{ success: boolean; message?: string }>({
        path: `/api/admin/practice-lab-fees/${encodeURIComponent(item.id)}/partial`,
        method: "POST",
        token,
        jsonBody: { amountReceived },
      });
      const body = res.data;
      if (!res.ok || !body?.success) {
        throw new Error(body?.message || "처리하지 못했습니다.");
      }
      toast({ title: body.message || "기록했습니다." });
      setPartialDraft((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      await load();
    } catch (error) {
      toast({
        title: "다시 확인해 주세요",
        description: error instanceof Error ? error.message : "처리하지 못했습니다.",
        variant: "destructive",
      });
    } finally {
      setBusyId("");
    }
  };

  const act = async (id: string, kind: "receive" | "pay-labs") => {
    if (!token || busyId) return;
    setBusyId(`${kind}:${id}`);
    try {
      const res = await request<{ success: boolean; message?: string }>({
        path: `/api/admin/practice-lab-fees/${encodeURIComponent(id)}/${kind}`,
        method: "POST",
        token,
      });
      const body = res.data;
      if (!res.ok || !body?.success) {
        throw new Error(body?.message || "처리하지 못했습니다.");
      }
      toast({ title: body.message || "기록했습니다." });
      await load();
    } catch (error) {
      toast({
        title: "다시 확인해 주세요",
        description: error instanceof Error ? error.message : "처리하지 못했습니다.",
        variant: "destructive",
      });
    } finally {
      setBusyId("");
    }
  };

  if (loading && items.length === 0) {
    return <p className="px-4 py-8 text-sm text-slate-500">불러오는 중입니다.</p>;
  }

  const visible = practiceFilter
    ? items.filter((item) => item.practiceAnchorId === practiceFilter)
    : items;
  const filteredName = visible[0]?.practiceName || "이 치과";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-1.5 py-3">
      <p className="text-xs leading-relaxed text-slate-500">
        계좌 이체는 여기서 나가지 않습니다.
        <br />
        전액이 들어온 뒤 입금 확인을 누릅니다.
        <br />
        그 다음 기공소 계좌로 직접 보낸 뒤 기록합니다.
        <br />
        일부만 들어온 금액은 일부 기록에 남깁니다.
        <br />
        전액이 아니면 입금 확인을 누르지 않습니다.
        <br />
        입금자명은 치과명으로 맞춰 주세요.
        <br />
        2차 다음 날 오전 9시 전에 확인하면 새 의뢰는 멈추지 않습니다.
      </p>
      {practiceFilter ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
          <span>{filteredName}만 보고 있습니다.</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 rounded-lg"
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.delete("practice");
              setSearchParams(next, { replace: true });
            }}
          >
            전체
          </Button>
        </div>
      ) : null}
      {visible.length === 0 ? (
        <AdminEmptyState
          icon={Landmark}
          title="확인할 기공료가 없습니다"
          description="안내가 나간 뒤 입금 전이거나, 기공소로 아직 보내지 않은 건이 여기 모입니다."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((item) => (
            <li
              key={item.id}
              className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900">
                    {item.practiceName}
                    <span className="ml-2 text-sm font-normal tabular-nums text-slate-500">
                      {item.yearMonth}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatYmd(item.firstDueYmd)}까지 1차
                    {item.secondDueYmd
                      ? ` · ${formatYmd(item.secondDueYmd)}까지 2차`
                      : ""}
                    {item.phase === "payout"
                      ? ` · 기공소 ${formatYmd(item.labPayoutDueYmd || item.labPayoutOnYmd)}`
                      : ""}
                  </p>
                </div>
                <div className="text-right">
                  <div className="flex flex-wrap justify-end gap-1">
                    <Badge variant="outline">{PHASE_LABEL[item.phase]}</Badge>
                    {item.watch?.repeat ? <Badge variant="outline">2회 이상</Badge> : null}
                    {(item.amountReceived || 0) > 0 && item.phase !== "payout" ? (
                      <Badge variant="outline">일부 입금</Badge>
                    ) : null}
                    {item.watch?.prepaidCandidate ? (
                      <Badge variant="outline">선불 전환 대상</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">
                    {formatRequestorWon(item.totalAmount)}원
                  </p>
                  {(item.amountReceived || 0) > 0 && item.phase !== "payout" ? (
                    <p className="text-[11px] tabular-nums text-slate-500">
                      들어온 {formatRequestorWon(item.amountReceived || 0)}원
                      <br />
                      남은 {formatRequestorWon(item.totalAmount - (item.amountReceived || 0))}원
                    </p>
                  ) : null}
                </div>
              </div>
              {item.lines.length > 0 ? (
                <ul className="mt-3 space-y-1 border-t border-slate-100 pt-2 text-xs text-slate-600">
                  {item.lines.map((line) => (
                    <li key={line.id} className="flex flex-wrap justify-between gap-2">
                      <span>
                        {line.payeeName} · {line.bankName} {line.accountNumber}
                        {line.holderName ? ` · ${line.holderName}` : ""}
                      </span>
                      <span className="tabular-nums">
                        {formatRequestorWon(line.amount)}원
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-slate-500">
                  거래 기공소 지급분은 없습니다. 어벗츠가 받는 금액만 있습니다.
                </p>
              )}
              {item.phase !== "payout" ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    inputMode="numeric"
                    value={
                      partialDraft[item.id] ??
                      ((item.amountReceived || 0) > 0 ? String(item.amountReceived) : "")
                    }
                    onChange={(event) =>
                      setPartialDraft((prev) => ({
                        ...prev,
                        [item.id]: event.target.value.replace(/[^\d,]/g, ""),
                      }))
                    }
                    placeholder="들어온 금액"
                    className="h-9 w-36 rounded-xl border border-slate-200 px-3 text-sm tabular-nums"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9 rounded-xl"
                    disabled={Boolean(busyId)}
                    onClick={() => void recordPartial(item)}
                  >
                    일부 기록
                  </Button>
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {item.phase !== "payout" ? (
                  <Button
                    size="sm"
                    className="h-9 rounded-xl"
                    disabled={Boolean(busyId)}
                    onClick={() => void act(item.id, "receive")}
                  >
                    입금 확인
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 rounded-xl"
                    disabled={Boolean(busyId) || item.lines.length === 0}
                    onClick={() => void act(item.id, "pay-labs")}
                  >
                    기공소 입금 완료
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
